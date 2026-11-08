# Kudium Browser encrypted sync API

Owner: Kudium. November 4, 2026.
Status: backend foundation implemented November 7, 2026 in `apps/web`.
See [service setup and limitations](../../../web/README.md). Desktop account connection, recovery-key enrollment and per-device snapshot transport are implemented November 8, 2026. Deployment and signed distribution remain release steps.

## Contract and trust boundary

Provide a second sync provider alongside native iCloud. Account authentication and
storage authorization belong to the service; browsing content is encrypted by the
client before upload. The API must not receive plaintext browsing snapshots,
passwords, passkeys, cookies, login tokens or the unwrapped sync encryption key.

Initial categories: workspace organization, open tabs and portable preferences.
The client must require opt-in, honor category exclusions and pause queued uploads
when disabled or when the authenticated account changes. Existing local consent
choices do not authorize a future upload until account connection and key enrollment
are completed and the user can review what will be synced.

Use a service-controlled HTTPS origin, fixed by the application distribution. Do
not add arbitrary sync-server URLs or paste-token fields to preferences. Reject
redirects that would send credentials to another origin. Never log authorization
headers, URLs/titles from decrypted records, or ciphertext key envelopes.

## Authentication and encryption keys

The service uses Better Auth with PostgreSQL-backed sessions for website accounts.
Desktop browser-mediated authorization and credential handoff must bind the
initiating device request, validate state and use a reviewed PKCE-equivalent
protocol before transport is activated. Signed session credentials must live in
the OS-protected credential store in the main process. Require a new account
connection before any transport is activated. The current session has a seven-day
rolling lifetime; sign-out and password reset revoke sessions in the database.

Server authorization derives the account from the verified Better Auth session user, never
from an account ID supplied in a request body. Scope every record, device, change
cursor and object-storage key to that account. Test cross-account access attempts.

Enrolling a second device requires explicit access to the account's encryption key:
approved-device transfer or a reviewed recovery-secret mechanism. Authentication
reset alone must not give the server a decrypted vault key. Select recovery design,
key wrapping/KDF and device enrollment before claiming end-to-end encryption.
Rotate/re-wrap keys after lost-device revocation and document the limitations of
revoking data that a device has already downloaded. No custom cryptographic
protocol is approved by this document without review and tests.

The local foundation uses AES-256-GCM with a fresh 96-bit nonce per record and
record ID/schema/key version as authenticated metadata. Key generation, secure
persistent storage, cross-device provisioning and recovery are still pending.
Backend record IDs must be opaque; no hostname, session name or email in paths.

## Proposed endpoints

| Method / route | Purpose |
| --- | --- |
| `GET /v1/sync/status` | Account quota, supported schema and service status |
| `POST /v1/sync/devices` | Enroll a device after authenticated key-provisioning flow |
| `GET /v1/sync/devices` | List the user's enrolled devices |
| `DELETE /v1/sync/devices/{id}` | Revoke the user's device credentials |
| `GET /v1/sync/changes?cursor=...` | Paginated opaque records/tombstones and a resumable account-scoped cursor |
| `PUT /v1/sync/records/{id}` | Conditional encrypted record update using a revision/ETag |
| `DELETE /v1/sync/records/{id}` | Conditional tombstone creation; bounded retention for offline devices |
| `DELETE /v1/sync/data` | Explicit confirmed cloud-data removal with documented retention |

A record includes envelope version, opaque ID, key version, nonce, ciphertext,
authentication tag, revision and an opaque type/device identifier only where needed.
Treat metadata leakage as part of the threat model. Validate exact schemas, size
limits and canonical encoding. Reject malformed envelopes, unknown critical fields,
unsupported versions, over-quota writes and unexpected content types.

Use optimistic concurrency (`If-Match` / revision) and return a conflict instead
of silently replacing newer data. Retry using idempotent record operations and
bounded exponential backoff. Change cursors must survive interruptions and reject
use under another account. Use structured error codes without echoing payloads.

Keep remote device-tab lists separate from a Mac's currently open tabs. Incoming
records never automatically close local tabs or navigate an active page. Apply
remote sessions through a validated logical-ID-to-local-partition mapping.

## Production implementation checklist

- [ ] Choose hosting, fixed API origin and account/identity provider.
- [ ] Finalize encrypted record schemas, category consent and conflict semantics.
- [ ] Finalize key enrollment, recovery, rotation and device revocation design.
- [ ] Implement authentication and strict per-account authorization.
- [ ] Implement opaque encrypted record storage, change feed and tombstones.
- [ ] Implement quotas, rate limits, transactional revision checks and bounded paging.
- [ ] Add audit events without sensitive record/credential content.
- [ ] Define backup retention, data deletion, privacy policy and incident handling.
- [ ] Run cross-account isolation, replay, tamper, offline conflict and abuse tests.
- [ ] Integrate a main-process client transport and real account connection UI.
- [ ] Verify two-device onboarding, recovery and account-switch behavior.

The updated desktop account-sync client connects accounts and uploads encrypted per-device snapshots after explicit enrollment. The standalone backend now uses Better Auth PostgreSQL sessions and signed bearer credentials and
provides status, encrypted-record operations, a change feed and cloud-data deletion.
Native iCloud, automatic key rotation, and production rollout remain pending; the checklist above tracks the complete production scope.

## Implemented desktop flow (November 8, 2026)

Better Auth device authorization (RFC 8628), not a paste-token field, binds desktop sign-in to a user-approved code and client `kudium-desktop`. The signed bearer credential is stored with the random sync key in OS-encrypted `account-sync.bin`. Account approval does not itself activate uploads. First-device enrollment requires confirmation that the recovery key was saved; subsequent devices authenticate and prove possession by decrypting the account key-check record. No new KDF or server-held recovery secret is introduced.

The transport uses only the fixed HTTPS service origin, rejects redirects, validates incoming envelopes/snapshots, writes per-device records with optimistic concurrency, and retries transient errors with bounded backoff. Snapshot category changes and disable invalidate in-flight work before another upload. Each device retains its own workspace; remote restore creates fresh local partition IDs, and synced preferences require explicit confirmation. Device/session revocation is available from `/account`; it cannot erase downloaded copies. Key rotation and native CloudKit remain outside this implementation.

The dedicated PostgreSQL integration suite verifies first-device enrollment, wrong-key rejection, second-device recovery, restore, opt-out, signed device credentials and single-use redemption. Deploy the added database migration and rebuild/sign the desktop app before calling the live product ready.
