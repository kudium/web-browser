# iCloud sync and continuity

Owner: Kudium / Kudium Browser (`com.kudium.kudiumbrowser`). November 4, 2026.
Initial scope confirmed by the user: Mac to Mac.
Status (November 8): Kudium Account sync, recovery-key enrollment, encrypted per-device workspace/password records, explicit restore and device authorization are implemented and tested locally. Backend deployment and desktop publication are pending. Native iCloud transport, CloudKit provisioning and Apple credential approval remain pending.

The historical phase notes below describe the November 4 audit. For current Apple setup and acceptance requirements, see [Apple integration readiness](../apple-integration-readiness.md).

## Product goal

Let a user enable iCloud sync in Kudium Browser, see their spaces, folders, favorites,
session apps and tabs on another Mac, and explicitly continue browsing there.
Keep credentials under Apple-supported credential APIs and protect browsing data
with application-level encryption. Sync is optional and off by default.

“Session apps” means saved session organization, not guaranteed transfer of every
website login. A website may require sign-in or passkey authorization on the new
Mac. Syncing a URL does not transfer unsaved forms, editor state, media playback,
or an authenticated server session.

## Storage audit

- [x] Confirm Mac-to-Mac as the initial device scope.
- [x] Audit app/session storage: `src/utils/AppManager.ts` uses `user_apps` in
  workspace localStorage; spaces/folders have their own localStorage records.
- [x] Audit actual login isolation: main-process WebContentsViews use persistent
  Electron session partitions (`persist:kudiumbrowser-<sessionId>`).
- [x] Audit preferences: main-process JSON contains controls and shortcuts as well
  as device-specific settings that must not all be copied to another Mac.
- [x] Separate Apple credentials from Kudium Browser browsing-state sync. No custom
  Kudium Browser password vault or existing CloudKit integration was found in the audit.

## Data and credential channels

| Data | Proposed channel | Initial scope |
| --- | --- | --- |
| Spaces, folders, favorites and saved session names | App-encrypted records in the user's private CloudKit database | Yes, opt-in |
| Open tabs and their current URLs, selected tab and per-device recency | Same encrypted channel; explicit “Tabs from other Macs” / continue action | Yes, opt-in |
| Portable preferences and keyboard shortcuts | Versioned allowlist in encrypted records | Yes, optional category |
| Passwords/passkeys saved by Apple's credential provider | iCloud Keychain / Passwords integration, governed by that provider | Separate integration; Apple browser work still pending |
| A future Kudium Browser-owned secret such as the sync encryption key | App-scoped synchronizable Keychain item, via native Security APIs | Needs signed integration and lifecycle testing |
| Website cookies, bearer/refresh tokens and login storage | Device-local Electron partition | Excluded from initial sync |
| Private/incognito tabs, extension credential stores, permission grants | Device-local | Excluded |
| File downloads, local paths, caches, history of unsaved forms/editor content | Device-local | Excluded |

The app cannot enumerate another app's Keychain items or export passkey private
keys. Adding CloudKit support does not grant access to the user's Safari/Passwords
vault. The existing Apple browser entitlement request concerns credential access;
CloudKit container/signing configuration is a separate capability setup.

Do not copy Chromium profile folders between Macs. Cookies can be device-bound,
server-revoked, encrypted for the originating installation, or sufficient to
impersonate the user. Seamless continuation means restoring organization and
opening the destination, with Apple credential authorization when required.

## Architecture

Use a native macOS bridge from the main process to CloudKit and Security.framework.
Use a private CloudKit database/container belonging to Kudium's signed app. Require
an available iCloud account and an explicit user opt-in before network uploads.
Keep the renderer sandboxed: it can request status and category changes, but may
not receive CloudKit credentials, vault contents, or the encryption key.

Encrypt browsing content before upload with authenticated encryption and independent
nonces. Bind schema version, record ID and key version as authenticated metadata.
Do not treat CloudKit private-database access control as a blanket end-to-end
security guarantee. The encryption key must be provisioned/recovered through an
app-scoped synchronizable Keychain design; never store it beside CloudKit ciphertext
or in preferences/localStorage. Verify available Keychain attributes and recovery
behavior in signed two-Mac tests before claiming end-to-end encryption.

Assign stable logical IDs to synced spaces/folders/sessions. On each Mac map those
IDs to its own local partitions; receiving a record cannot choose an arbitrary local
partition, filesystem path or extension-install target. Session IDs organize records;
they are not authentication. Do not merge distinct website accounts by hostname.

Use versioned records, change tokens, conflict handling, tombstones and an offline
retry queue. Track per-device open tabs separately so an offline/closed Mac cannot
erase another Mac's active workspace. Receiving remote tabs must not navigate an
active page or close local work without an explicit user action.

## Implementation phases

### 1. Local encrypted sync foundation

- [x] Define a versioned outbound snapshot and portable preference allowlist.
- [ ] Define remote import/change-feed schemas and conflict revisions.
- [ ] Build explicit export/import adapters for saved apps, current tab state,
  spaces/folders and preferences. Never export the entire localStorage store.
- [ ] Validate record size/count, IDs, URLs and relationships; reject unknown fields,
  extension install targets, filesystem paths and partition injection.
- [x] Add provider-independent authenticated encryption with tamper/metadata
  rejection; test synthetic records and fresh nonces. Key provisioning is pending.
- [ ] Implement device identity, conflict rules, deletion tombstones and offline queue.
- [ ] Keep private browsing excluded and define how a user removes selected tabs
  from sync; URLs and titles can contain sensitive data and must be encrypted.

### 2. Native iCloud integration and settings

- [ ] Configure an appropriate CloudKit container and app capability under Kudium;
  prepare signing/provisioning and development/production environments.
- [ ] Build the native CloudKit/Keychain bridge and narrow trusted IPC surface.
- [x] Add Preferences → Sync with persisted enable intent, provider selection and
  category toggles. iCloud defaults on Mac; account connection is clearly pending.
- [x] Expose truthful main-process status: off/setup required, disconnected and no
  successful-sync timestamp. No provider transport is active.
- [ ] Add real account connection, device list, successful-sync timestamps, retry,
  pause and sign-out/account-change handling.
- [ ] Keep all upload/download work disabled until opt-in and account/key checks pass.
- [ ] Add encrypted uploads, incremental downloads, notifications and bounded retries.
- [ ] Handle iCloud account changes by detaching the old account's queue and keys;
  never upload one account's pending records into another account.
- [ ] Define key recovery, rotation, lost-device handling and cloud-data removal.
  Disabling sync must clearly distinguish keeping cloud data from deleting it.

### 3. Continue on another Mac

- [ ] Add “Tabs from other Macs” with device names/recency and explicit open/continue.
- [ ] Restore selected sessions into separate local partitions and retain their
  organization without copying cookies or granting website permissions.
- [ ] Resolve rename/move/delete conflicts without losing local tabs.
- [ ] Test two signed Macs: offline edits, reconnect, key unavailable, iCloud full,
  account switch, device removal, interrupted upload and schema upgrades.
- [ ] Consider native Handoff after validating Electron/macOS integration; encrypted
  tab sync and NSUserActivity Handoff are distinct capabilities.

### 4. Apple credentials

- [ ] Complete the existing [passkey/browser security spec](passkeys-and-browser-security.md).
- [ ] Verify supported iCloud Passwords/passkey discovery, registration and sign-in
  on both Macs through Apple's supported integration.
- [ ] Explain site-required reauthentication and provider authorization accurately.
- [ ] Consider any Kudium Browser-owned credential vault only as a separate reviewed
  project; no custom password-copying channel is part of this first release.

## Release acceptance

No plaintext sensitive browsing data, raw credentials, login cookies, tokens,
passkey keys or sync keys appear in CloudKit payloads or logs. Every upload follows
explicit category consent. Tampered records fail closed. Offline operations do not
silently delete work. A second Mac restores session organization and can use the
supported Apple credential flow, with site-required sign-in clearly presented.

CloudKit production configuration, signed builds, recovery/security tests and
real two-device verification remain required. No implementation/release checkboxes
are checked merely because this design is written.

## References

- [CloudKit](https://developer.apple.com/documentation/cloudkit)
- [Synchronizable Keychain items](https://developer.apple.com/documentation/security/ksecattrsynchronizable)
- [Apple browser passkey entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.web-browser.public-key-credential)

## Current implementation and API plan

The `cloudSync` preference is a local configuration/enable intent, not evidence of
an active cloud connection. Category choices can be prepared while sync is off.
An enabled choice displays **Setup required**, with a provider-specific explanation
that no data is uploaded. There is no automatic upload queue tied to that choice.

The outbound snapshot builder selects only approved fields and excludes private
and non-web tabs, embedded URL credentials, device paths, permission grants and
extension-install targets. It is not yet wired to live snapshot collection or
remote import. The encryption module takes a main-process key; it does not generate
or persist a roaming vault key, and its tests do not establish end-to-end deployment.

[Kudium Browser API plan](kudiumbrowser-sync-api.md): account auth, opaque encrypted storage,
change cursors, optimistic concurrency, key enrollment/recovery and device revocation.
Backend implementation remains deferred as requested. Native CloudKit container,
bridge, signed provisioning and two-Mac tests are also still outstanding.

## Verification for this phase (November 4)

- `npx jest --runInBand`: 29 suites / 74 tests passed.
- `npx tsc --noEmit`: passed.
- Targeted ESLint: passed.
- `npm run build`: passed.
- `electron .erb/scripts/browser-ui-smoke.cjs --sync-settings-only`: passed Mac
  iCloud default, persisted enable intent/categories, Kudium Browser provider selection,
  truthful disconnected status, disable, and layouts at 1080/760/480 pixels.
- Desktop screenshots were visually inspected. Encryption/snapshot helpers use
  synthetic fixtures; there is no real cloud/network or two-Mac test in this phase.


### Optional saved-password sync and structured imports

Kudium global saved logins can be synced as separate encrypted per-device records. Password sync defaults off, requires unlocking Personal Data for each upload or restore, and never sends plaintext credentials through renderer IPC. Restoring keeps existing passwords and creates entries without AI access. Group-scoped credentials, passkeys, payment data and OTPs remain local. Apple iCloud Passwords remains blocked until Apple grants Kudium the managed browser entitlement; account sync does not grant this access.

Preferences → Import accepts bookmark HTML, links and Arc’s official Markdown data export. Arc space headings become new Kudium spaces, and favorites/pinned sections are recognized. Bookmark folder paths are retained; nested folders use readable Parent / Child names because Kudium folders are currently flat. Dia and other browsers retain structure only when it exists in their export; flat links do not expose spaces. Existing local tabs and spaces are preserved.
