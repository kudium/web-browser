# Apple integration readiness — November 8, 2026

## Current state

Kudium Account sync is deployed at `browser.kudium.com`. Signed and notarized macOS beta `1.0.2-beta.1` was published on November 8 from commit `87ba8afea4a282dee1114d72d0f654ac59ffe181` (release workflow `42510833119`). Both Apple Silicon and Intel beta manifests were verified. Native iCloud integration is isolated in draft PR #2 and is not included in that beta. Apple iCloud Passwords is a separate managed capability; its helper currently rejects Kudium's signing identity.

The browser already declares HTTP/HTTPS URL schemes in `package.json` and handles macOS `open-url` requests in `src/main/main.ts`. The older compatibility investigation's statement that these are missing is superseded.

## Credential entitlement request

Correction request `XDL783F4J3` was accepted on November 8 and references original request `3PJLSLF88K`. Approval remains pending. The explicit App ID was registered under Kudium LTD with CloudKit capability selected. Submit/review capability requests at:
https://developer.apple.com/contact/request/macos-browsers-passkeys/

Use verified application details:

- Organization: Kudium LTD
- Team: `79VCL28M9P`
- Application: Kudium Browser
- Bundle identifier: `com.kudium.kudiumbrowser`
- Website: https://kudium.com
- Product website: https://browser.kudium.com
- Contact: hello@kudium.com
- Managed capability: `com.apple.developer.web-browser.public-key-credential`

Suggested request explanation (review before submitting):

> Kudium Browser is a macOS web browser that renders HTTP and HTTPS pages, provides URL entry, search and saved tabs/bookmarks, and handles external web links. We request the managed browser credential capability to integrate Apple's supported passkey and iCloud Passwords flows. Kudium isolates website sessions and keeps credential access under user authorization. We will validate a provisioned, Developer ID-signed build before making the feature available.

Do not assert Apple approval or activate this entitlement before an approved provisioning profile exists. GitHub notarization credentials do not establish Account Holder access or managed capability approval.

## CloudKit setup

This is independent of the credential entitlement request. Under Kudium's Apple Developer team, configure an explicit app identifier and iCloud/CloudKit capability, create a Kudium-owned container, and obtain a provisioning profile valid for the chosen distribution route. Confirm container identifiers with the Account Holder before using them in code. The local profiles inspected on November 8 belong to KudiTrust, not Kudium Browser, and contain no iCloud capability.

Implement a native CloudKit connection and app-scoped key provisioning. Encrypt approved workspace snapshots before cloud upload. Keep keys and CloudKit account credentials out of renderer IPC, reject account changes during operations, use conditional record revisions, and require explicit restore. Apple iCloud Passwords must never be treated as permission to enumerate Apple's credential vault.

## Acceptance on provisioned Macs

Run `node .erb/scripts/check-apple-capabilities.cjs /path/to/Kudium.app` to inspect the main executable's signing capabilities. This is a configuration check, not a cloud round-trip test.

Then verify on two signed Macs: opt-in/off, offline/reconnect, concurrent edits, key recovery, account switch, cloud quota errors, revoked devices, data deletion and tampered snapshots. Separately verify supported password extension pairing, autofill, generated passwords, OTPs and independent website sessions. Use synthetic accounts and credentials. Do not publish iCloud support until these pass.

## CloudKit container registration

On November 8, `iCloud.com.kudium.kudiumbrowser` was registered as Kudium Browser Sync under Kudium LTD and assigned to `com.kudium.kudiumbrowser`. The app capability change was saved in the developer portal. No native CloudKit transport or cloud schema deployment is implied by this registration. Provisioning, implementation and signed two-Mac acceptance remain pending.

## Native bridge implementation

`native/cloud-sync/bridge.mm` implements an asynchronous in-process Node-API bridge to the fixed Kudium CloudKit container's private database. It supports account identity checks and bounded encrypted-record lookup, listing, conditional writes and deletion tombstones. It does not access Apple's password vault. `CloudKitEncryptedStore` validates envelopes and revisions, rejects plaintext writes and checks account identity before and after each operation.

`node .erb/scripts/build-cloudkit.cjs` compiles a universal arm64/x86_64 module into the temporary directory. Both architectures compiled on November 8; the module loaded and rejected invalid argument types without contacting iCloud. Three adapter tests passed with synthetic ciphertext and account-switch fixtures. These are implementation checks, not a real CloudKit round trip.

The bridge is not loaded by normal builds or exposed through renderer IPC. The integration branch now wires native account connection, recovery-key enrollment (stored in the OS-encrypted local store), encrypted periodic snapshots, password transfer, conditional revisions, tombstones, explicit restore and provider selection. It uses a bounded full CloudKit refresh; incremental zone change tokens are not implemented. Native credentials are stored separately from Kudium Account credentials and operations reject account changes. Password sync still requires Personal Data authentication. The existing Kudium Account release proceeds independently.

Explicit integration packaging uses `.erb/configs/electron-builder.icloud.cjs`, which checks a provided production CloudKit profile and requires the universal module. The iCloud entitlement template does not request the unapproved Apple browser credential entitlement. Set `KUDIUM_ICLOUD_INTEGRATION=true` only for provisioned integration testing. Normal releases leave this flag unset and show iCloud unavailable.

Remaining acceptance: obtain the distribution profile, deploy the CloudKit record schema/environment, verify a signed package on two Macs (including native account changes, conflicts, reconnects, deletion and quota errors), and then replace the integration-only flag with a verified release capability. Apple iCloud Passwords remains separately gated by managed entitlement approval and native credential tests.

All browser and storage checks for the native integration PR passed on Linux, Windows and macOS. The user confirmed a second Mac using the same Apple account is available. Follow [the two-Mac acceptance checklist](icloud-two-mac-acceptance.md); no real cross-device result has been recorded yet.

On November 8, Developer ID profile `5M54LAX6UN` was generated for the exact browser App ID and production container. It selects Kudium LTD's existing Developer ID Application certificate (certificate expiry December 8, 2027). The private profile is held in the CI secret `KUDIUM_ICLOUD_PROFILE_BASE64`, not committed. The build accepts Apple's wildcard services encoding only alongside the exact production container and app identity. Production schema deployment was confirmed in CloudKit Console: `KudiumEncryptedSnapshot`, `envelope` String, `revision` Int64, `deleted` Int64, and `recordName` queryable. The bridge uses the private database exclusively.

`.github/workflows/browser-icloud-integration.yml` builds signed/notarized installers for both Mac architectures as private CI artifacts. It does not publish a channel feed. The integration opt-in flag is embedded by the production main-process webpack build; users do not need to set a shell variable. Real signed-app acceptance remains pending.

First integration packaging run `42514783365` was blocked before any job steps ran. GitHub reported failed recent account payments or an Actions spending limit. Resolve organization billing, then rerun the workflow. No signed integration installer was produced by that run. Local universal native compilation, TypeScript, and validation against the actual production profile passed.
