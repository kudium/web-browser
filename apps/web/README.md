# Kudium web service

Bun + Hono serves a React-rendered showcase homepage and documentation, an
`electron-updater` compatible release feed, and authenticated encrypted-record sync.
PostgreSQL + Drizzle handles transactional revisions, account isolation and quotas.
This service is independent of the Electron app's build and dependencies.

## Run

```sh
cd apps/web
bun install
cp .env.example .env
# Configure PostgreSQL, generate BETTER_AUTH_SECRET, and set
# BETTER_AUTH_URL=http://localhost:3000 for local development.
bun run db:migrate
bun run dev
```

Open http://localhost:3000 and http://localhost:3000/docs. React renders HTML on the
server; the account forms use a small same-origin script. `bun run start` runs
the production server. Database, Better Auth secret/base URL and allowed asset origins are configured
through the environment. There is no development auth bypass. `/health` is liveness; `/ready` checks the database. Migrations are
committed in `drizzle/`; use `db:generate` after changing the schema.

## Database choice

Use your existing **PostgreSQL with Drizzle**. Sync needs transactions to allocate
account revisions, enforce quotas and reject concurrent stale writes atomically.
JSONB stores opaque encrypted envelopes and release manifests; primary keys isolate
records and change streams by account. Keep installer binaries and blockmaps in
object storage/CDN or GitHub Releases, not PostgreSQL. No Redis is needed initially;
use an edge/shared rate limiter when deploying multiple instances.

## Authentication and sync

Authentication runs inside this Bun/Hono app using **Better Auth** and its Drizzle
PostgreSQL adapter. No Clerk, Keycloak or external OIDC account is required.
`auth_users`, `auth_accounts`, `auth_sessions`, `auth_verifications` and
`auth_rate_limits` are migrated alongside the existing sync tables.

Set `BETTER_AUTH_SECRET` to a cryptographically random value of at least 32
characters (`openssl rand -base64 48`) and preserve it across deployments/replicas.
Set `BETTER_AUTH_URL=https://browser.kudium.com`; HTTP loopback origins are
accepted for development only. Missing/invalid configuration stops server startup.

- `/sign-up`, `/sign-in`, `/account`: server-rendered React account pages.
- `/api/auth/*`: Better Auth's email/password, session and sign-out endpoints.
- Browser sessions use HTTP-only, Secure (HTTPS), SameSite=Lax cookies. The pages
  never persist session tokens in localStorage.
- Passwords require 12–128 characters and are hashed by Better Auth.
- Optional `SMTP_URL` and `SMTP_FROM` enable email verification on signup/signin
  and password-reset pages. Without SMTP, email/password sign-in works but email
  ownership is not verified and recovery is unavailable. No email is logged as a
  substitute for delivery. Configure SMTP before offering verified-email accounts.
- Password reset revokes existing sessions. Sign-out also immediately revokes its
  session. Session caching is disabled so sync checks consult PostgreSQL.
- Authentication rate limits are database-backed; use edge limits as well. Ensure
  client IP headers are set by your trusted reverse proxy, not by callers.

Desktop/main-process clients may send the **signed** `set-auth-token` response
header from successful sign-in as `Authorization: Bearer <token>`. The raw token
in the JSON body is not accepted: the Bearer plugin requires a signature. Store
this credential only in OS-protected storage, never renderer state, URLs or logs.
Sync account IDs derive from Better Auth's stable user ID, never a request body or
email address. Session cookies are deliberately not accepted by `/v1/sync` routes.
Browser account pages read their cookie session on the server and show storage usage.

The previous OIDC verifier is replaced; existing OIDC identities/records are not
silently linked by email. If this service was previously deployed with OIDC, a
reviewed identity migration is required. Desktop browser-mediated authorization,
credential handoff, secure encryption-key enrollment and device recovery still
need integration; adding website login alone does not activate desktop sync.

The `/v1/sync` API accepts the exact envelope from `apps/browser/src/main/sync/encryption.ts`:
AES-256-GCM version 1, opaque recordId, positive keyVersion, base64 nonce (12 bytes),
ciphertext (up to 8 MiB), and tag (16 bytes). It validates shape and canonical
encoding but cannot verify ciphertext/tag authenticity. Client decryption must
reject tampering. The server never receives unwrapped keys or plaintext snapshots.

- `GET /v1/sync/status`: usage, quota, supported schema and current cursor.
- `PUT /v1/sync/records/:id`: create with `If-None-Match: *`, update with
  `If-Match: "revision"`. Response includes revision and ETag.
- `GET /v1/sync/records/:id`: encrypted record and ETag.
- `DELETE /v1/sync/records/:id`: conditional tombstone with `If-Match`.
- `GET /v1/sync/changes?cursor=...&limit=10`: immutable events, tombstones,
  next cursor, hasMore. Limit is 1–20. Save cursors only after applying the page.
- `DELETE /v1/sync/data`: requires `X-Confirm-Delete: all-sync-data`; erases all
  current/historical ciphertext, retains opaque IDs, tombstones and cursor ordering.

409 means revision conflict; 428 means missing precondition; 413 means quota or
body limit exceeded. Never blindly overwrite a conflict. A lost successful write
response can yield 409 on retry: fetch the latest record to reconcile before retrying.
IDs cannot be reused with `If-None-Match: *` after deletion; use the tombstone's
revision to restore a record. Account cursors are canonical base64url tuples;
they are account-bound and validated, but are not credentials or signed secrets.
A cursor beyond the account's sequence is rejected.

Limits: 12 MiB request body, 64 MiB current encoded envelopes, 256 MiB historical
encoded envelopes, 10,000 record IDs including tombstones, 100,000 change events
per account. Quotas include ciphertext envelope encoding; they are not plaintext
sizes. Deleting a single record retains its history until cloud-data deletion.
Cloud deletion adds up to 10,000 final tombstones even at the event quota so deletion
is always possible. Event and ID quotas are not reset by deletion. No automatic
history pruning is implemented: long-lived accounts need an explicit compaction /
full-resync protocol before these bounds become restrictive. Cloud-data deletion
cannot erase device copies or backups; set backup retention operationally.

The account-row lock serializes writes within an account while allowing independent
accounts to proceed concurrently. Change events retain payloads so interrupted
pagination never skips an intervening revision. Remote tabs must not replace,
navigate or close active local tabs automatically.

**Desktop integration remains separate:** account connection UI, browser-mediated authorization,
secure key enrollment, recovery/rotation, device credentials/revocation, category
consent, retry queue and application of remote records. No device-enrollment API
is exposed because its key-provisioning protocol is not yet finalized. This backend
does not make the desktop's existing setup-placeholder into working two-device sync.
Do not claim production end-to-end sync until those flows are implemented and tested.

## Releases

Upload actual signed installers, updater archives and blockmaps first. Then publish
metadata from a trusted CI/release job with database access:

```sh
bun run release:publish manifest.json
```

Example `manifest.json` (replace the size/hash with values from your actual build):

```json
{
  "platform": "darwin",
  "arch": "arm64",
  "channel": "stable",
  "version": "1.0.1",
  "notes": "Describe the release here.",
  "files": [
    {
      "url": "https://downloads.kudium.com/Kudium-1.0.1-arm64.zip",
      "sha512": "<base64 SHA-512 digest of the actual file>",
      "size": 12345678
    }
  ]
}
```

Targets: darwin/win32/linux, arm64/x64, stable/beta. Stable rejects prerelease
versions. Asset origins must match `RELEASE_ASSET_ORIGINS` exactly and use HTTPS.
The publishing job is trusted to supply genuine checksums and signed artifacts;
the service does not download or verify artifacts at publication. Version/target
combinations are immutable (unique constraint), preventing accidental replacement.
The highest semantic version wins, rather than the most recently inserted row.

`GET /v1/updates/latest?platform=darwin&arch=arm64&channel=stable&currentVersion=1.0.0`
returns availability and metadata. Missing release returns `available: false`.
`GET /download/:platform/:arch` redirects to the latest stable asset; on Mac it
prefers a DMG if supplied. Without a release, it shows a real unavailable page.

Generic updater feed base URL:

```text
https://browser.kudium.com/updates/stable/darwin/arm64
```

The updater requests `latest-mac.yml`, `latest.yml` (Windows), or
`latest-linux.yml`. Beta uses `/updates/beta/.../beta-mac.yml`, `beta.yml`, or
`beta-linux.yml`. Configure electron-builder's **generic** publish URL per
platform and architecture and package app-update.yml with it. Ordinary desktop builds continue to use GitHub in package.json.
`npm run package:web` uses `.erb/configs/electron-builder.web.cjs` to embed
`https://browser.kudium.com/updates/stable/<platform>/<arch>` in each
packaged app-update.yml. electron-builder expands the architecture macro.
The existing main-process updater consumes that metadata without a runtime URL
setting. Publish assets and deploy the service before distributing these web-feed
builds; already installed GitHub-feed clients require a new build to switch. Select beta via
electron-updater channel configuration. Absolute asset URLs are preserved in YAML.
macOS updater files require ZIP archives and signed/notarized apps, Windows NSIS
installers need signing, and Linux uses AppImage. Preserve adjacent blockmap URLs.
Do not advertise this feed as complete installation testing: signed packaged builds
must still be tested on every supported platform.

## Deployment and checks

Deploy on a VM/container/PaaS that supports Bun and PostgreSQL connections. This
server uses TCP PostgreSQL and is not a Cloudflare Worker. Use HTTPS at the reverse
proxy, restrict database network access, and run migrations once per deployment.
Use a dedicated database role with the minimum privileges needed at runtime, and a
separate migration/release role. Keep secrets in environment/secrets management.
No CORS is enabled: desktop transport belongs in Electron's main process. Pages and
API share an origin. Security headers include a restrictive CSP.

The built-in per-account limiter is 120 authenticated requests/minute/process,
with bounded in-memory buckets. Enforce unauthenticated/IP abuse limits and a
shared limiter at your proxy; scale-out must not multiply quotas. Disable proxy
logging of Authorization, bodies and query cursors. Database backups may contain
ciphertext; define retention and deletion policy. Add your own monitoring without
record payloads or credentials. Per-session revocation is supported by Better Auth. Device/key-level revocation
is deferred until a reviewed enrollment design exists.

```sh
bun run check
bun test
# Integration requires a dedicated, migrated-or-empty TEST database:
TEST_DATABASE_URL=postgres://localhost:5432/kudium_web_test bun test
```

Integration tests apply migrations and create uniquely named test accounts/releases,
then remove them. **Do not point TEST_DATABASE_URL at production.** Without that
variable integration tests are explicitly skipped. Tests cover account isolation,
concurrent revision conflicts, cursor paging, tombstones, quota rollback, deletion,
release selection/YAML and page responses.
