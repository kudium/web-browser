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

The dev command applies pending migrations before starting the server, including
the marketplace tables. If a migration fails, the server does not start. The
standalone `db:migrate` command also updates an already-running local server's database.

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
credential handoff, secure encryption-key enrollment and device recovery are now implemented in the desktop account-sync client. Website login alone still does not activate desktop sync; the app requires explicit enrollment and category consent.

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

**Desktop integration:** Preferences → Sync starts Better Auth’s RFC 8628 device authorization flow. `/device` requires a signed-in account and code comparison; the main process polls `/api/auth/device/token` and retains only the signed credential in OS-encrypted local storage. The first device creates a random 256-bit recovery key and an encrypted account key-check record. Other devices must provide the same key. There is no server-side recovery or automatic key rotation.

Each device uploads its own encrypted snapshot every 30 seconds, with digest-based change detection, conditional revisions, and bounded retry backoff. Incoming snapshots are validated and listed separately; explicit restore creates fresh local spaces/groups/login partitions. Portable preferences are applied only after confirmation. Disable, category changes, and disconnect invalidate pending uploads. Revoked sessions cannot make new API requests; already downloaded data remains on devices.

Deploy migration `0003_messy_falcon.sql` with the web update before distributing the new desktop build. Native iCloud sync is not implemented. The integration suite tests device approval and two clients against a dedicated PostgreSQL database.

## Releases

The GitHub pipeline uploads installers through the authenticated chunk publisher,
verifies their checksums, and registers all targets atomically. It needs no
production database credentials. See [build and release](../../docs/build-and-release.md)
for beta/stable tags, signing secrets, and deployment setup.

For a manual alternative, upload actual signed installers, updater archives and
blockmaps first. Then publish metadata from a trusted host with database access:

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

## Public release history

`/releases` lists published versions with stable/beta filters, release notes,
publication dates and available platform/architecture downloads. Links from the
download page and footer make older installers discoverable. Existing latest
update feeds are unchanged; browsing history never initiates a downgrade.

`GET /v1/releases?channel=all&page=1` exposes the same history as JSON. Channel
may be `all`, `stable` or `beta`; page must be a positive integer. Each page has
up to 12 version/channel groups, with all architecture downloads kept together.
Versions sort by semantic version. Only valid manifests with trusted asset
origins are returned. The response includes `releases`, `page`, `total` and
`totalPages`. No database migration is required. Deploy the website to expose
these routes publicly.

### Account-managed sync and dashboard data

Set `SYNC_MASTER_KEY` to a persistent, cryptographically random 32-byte base64url key in the backend's secret configuration to enable account-managed encryption. This key is independent of `BETTER_AUTH_SECRET`; changing account passwords or resetting a password does not change data keys. Back up the master key securely. Rotating or losing it without re-wrapping the stored account keys makes synced data inaccessible. No plaintext keys belong in Git or logs.

Better Auth authenticates the dashboard session and signed desktop device credential. Account data keys are wrapped with the master key in the reserved `account_managed_key_v1` sync record, which generic sync APIs cannot retrieve or mutate. Existing recovery-key accounts must migrate once by proving their existing key. Their ciphertext is retained unchanged. New desktop sign-ins enroll without recovery-key prompts when the backend is configured; older/unconfigured services retain the legacy flow.

The account dashboard can view, edit, and delete notes and app/tab information in encrypted per-device cloud backups. Writes use revision checks, retain note scope/sensitivity, and retain group-scoped hook/CSS sources. Restored customizations remain disabled until reviewed in Developer. Dashboard changes apply to the selected cloud backup, not every local browser automatically: users restore a backup through desktop Sync. A later desktop upload can replace that device's cloud snapshot. True bidirectional item-level merge and deletion propagation remain separate work.

Server-managed data is encrypted in transit and at rest, but the service can decrypt it for authenticated account access; it is not end-to-end encryption. The master key is never sent to browsers or desktop clients. Desktop account keys are retained in existing OS-encrypted storage. Notes back up automatically without prompting; protected local notes are included once the local vault is unlocked. While protected notes are locked, the previous complete backup is retained instead of replacing it with an incomplete list.

Workspace snapshots include group-scoped page customizations (before/after scripts, CSS, and named/path-filtered hooks). Source validation binds each entry to a backed-up group and origin. Restore remaps the group/profile and disables execution; notification grants, project permissions, cookies, and local project files are never restored by this payload. Older snapshots without customizations remain supported.

The cloud workspace separates Notes, Apps & tabs, and read-only Page hooks into a searchable list and preview. Editing is explicit; unsaved changes are guarded before navigation, and deletion requires confirmation. Storage and Devices are separate views in the same sidebar, keeping account tools out of the document area. On phones, the same workspace switches between list and detail. Device labels currently use the source device ID suffix, since backups do not store a display name.

For a local UI review with fictional data, run from the repository root:

```sh
apps/browser/node_modules/.bin/electron apps/web/scripts/verify-account-dashboard.cjs
```

The check uses the production markup, CSS, and client script with a mocked data API. It verifies previews, search, device filtering, open-tab deduplication, keyboard focus, draft protection, saves, conflict handling, deletion, and narrow layouts. It also checks the mobile view selector, focused tablet layout, invalid URLs, empty/error states, and the return to the list after deletion. Screenshots are written to a temporary folder; set `DASHBOARD_PREVIEW_DIR` to retain them elsewhere. It does not verify live authentication or deploy anything.

### Google sign-in and passkeys

Set runtime-only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` together. Create a
Google Auth Platform **Web application** client in the Kudium project with origin
`https://browser.kudium.com` and redirect URI
`https://browser.kudium.com/api/auth/callback/google`. Only basic OpenID, email,
and profile scopes are used. Complete Google branding/public privacy information
and move the consent app out of Testing before a public launch. Testing currently
requires explicitly listed Google accounts. Never put the secret in frontend
assets, Git, build arguments, or screenshots.

Apply `0004_perfect_quicksilver.sql` on website deployment. Better Auth stores
passkey public keys and counters; private keys and biometric data stay with the
user's authenticator. The relying-party ID is the exact configured service host,
with exact-origin verification and required user verification. Changing the
service host requires users to create new passkeys. Passkeys are added after
Google/email registration in **Devices & sessions → Sign-in methods**, and can
then sign in without a password. Google can also be linked from that panel using
the account's existing email. Unverified local identities are not implicitly
linked on the basis of a matching email. Existing email sign-in remains available.
Google OAuth tokens are encrypted by Better Auth; keep `BETTER_AUTH_SECRET` stable.

The passkey frontend is bundled from `public/passkeys.ts` with Bun on the first
asset request and served from the same origin. It contains no server configuration.
To exercise the real PostgreSQL/WebAuthn flow with fictional users:

```sh
TEST_DATABASE_URL=postgres://localhost:5432/kudium_auth_test \
  ../browser/node_modules/.bin/electron scripts/verify-passkeys.cjs
```

This runner requires a loopback database whose name contains `_test`. It clears
that fixture database's rate-limit table, creates fictional accounts, and uses a
virtual authenticator. Electron's virtual picker is given a known credential
allow-list in the test only. Native signatures, server verification, session
cookies, ownership, deletion, OAuth initiation and device-approval return paths
are exercised. Discoverable passkey selection, actual Touch ID/Face ID, and live
Google consent/callbacks still require real-browser verification after deployment.

## Hooks marketplace

`/hooks` is public. Existing Kudium accounts publish at `/hooks/new`, manage
publications at `/account/hooks`, and like/comment on hook detail pages. New
publications are approved by default; a rejected publication must be reviewed
again after resubmission. Set `HOOK_ADMIN_ACCOUNT_IDS` to a comma-separated list
of Better Auth **user IDs** (not sync account hashes or email addresses) to enable
`/hooks/admin` and its reports/moderation controls. No account can assign itself
this role.

Public JSON packages live at `/v1/hooks/:id/versions/:version/package`; the current
version is available at `/v1/hooks/:id/package`. The portable source contract is
`packages/hooks/package.ts`. Packages contain code, target rules and licensing,
never runtime permissions or local credentials. Browser installs and updates are
saved disabled and executable hooks are not automatically synced. The browser group
picker offers “All groups” for general hooks; these apply across browser sessions,
including groups added later. Named groups retain their shared-session scope.

Run migrations before serving the marketplace. The database migration requires
permission to install PostgreSQL's `pg_trgm` extension; otherwise an administrator
must install it beforehand. It adds indexed name search and cursor pagination.

Because both apps share the package contract, build the web image from the
**repository root**:

```sh
docker build -f apps/web/Dockerfile -t kudium-web .
```

For Coolify, set the Docker build context/base directory to the repository root
and Dockerfile location to `apps/web/Dockerfile`. The release-assets volume path
remains `/app/release-assets`. Website deployment is separate from a browser
installer release. The new `kudium://install-hook` protocol needs a newly packaged
browser; URL import remains available inside the hooks workspace.

### Local sample hooks

With the local database migrated and at least one local account created, run
`bun run seed:hooks` from `apps/web`. This adds six validated examples for CSS,
lifecycle scripts and context-menu actions, with sample likes and publication
dates for trying Trending and Newest. Open <http://localhost:3000/hooks>.

The script only accepts a localhost database and skips samples already added.
It uses the most recently created local account (excluding sample voters) as the
owner; use `bun run seed:hooks --owner=<account-id>` to choose a specific account.
