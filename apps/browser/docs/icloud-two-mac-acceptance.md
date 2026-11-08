# Native iCloud two-Mac acceptance

Status: awaiting a production CloudKit provisioning profile and signed integration installer. A second Mac is available. The published `1.0.2-beta.1` beta supports Kudium Account sync; it cannot run this iCloud test.

## Prepare the integration installer

- Obtain a Developer ID provisioning profile for team `79VCL28M9P`, app `com.kudium.kudiumbrowser`, container `iCloud.com.kudium.kudiumbrowser`, CloudKit Production, matching the signing certificate used by CI. Keep signing keys and profile contents out of this document.
- Configure and deploy the `KudiumEncryptedSnapshot` record type in the container's production schema: `envelope` String, `revision` Int64, `deleted` Int64/Boolean-compatible numeric value. Enable record querying required by the all-records query. Verify the schema against the actual bridge writes before deployment.
- Compile `node .erb/scripts/build-cloudkit.cjs assets/native/kudium-cloudkit-bridge.node` with matching Electron headers. Package with `.erb/configs/electron-builder.icloud.cjs`, `KUDIUM_ICLOUD_INTEGRATION=true`, `RELEASE_SIGNING_REQUIRED=true`, and `KUDIUM_ICLOUD_PROFILE` pointing to the verified profile.
- Verify Developer ID signing, embedded provisioning, container entitlements, notarization and Gatekeeper acceptance on both architectures. Record installer version, commit and SHA-512 before distributing.

## Test with synthetic browser data

Use the same Apple account on both Macs. Back up each browser profile and use disposable browser data. Keep recovery keys, passwords, Apple account identifiers and ciphertext out of screenshots and logs.

1. On Mac A, select iCloud in Preferences → Sync, connect and enable sync. Store its recovery key privately. Create a test space, group, folder and tabs with distinctive names; change one supported preference.
2. On Mac B, connect to iCloud, enroll with the recovery key and explicitly restore. Verify supported workspace structure and preferences. Existing local data must not be overwritten without the restore flow; AI permissions must not transfer.
3. Add a synthetic Kudium saved password on A, authenticate in Personal Data and opt into password sync. Authenticate on B and explicitly restore it. Verify password opt-out stops further password uploads. This tests Kudium saved passwords, not Apple's password vault.
4. Make concurrent changes on both devices. Verify conflicts are surfaced and existing remote data is not silently overwritten. Disconnect networking, edit locally, reconnect and verify recovery without lost data.
5. Turn sync off on each Mac and verify uploads stop. Disconnect Kudium's iCloud connection and verify the system Apple account remains signed in.
6. Exercise account changes during operations and recovery-key mismatch: reject access rather than mixing accounts or restoring unreadable data.
7. Delete disposable cloud data through the supported flow, reconnect the second device and verify deleted payloads cannot be restored. Test tampered snapshots, quota failure and interrupted operations with controlled fixtures where a real service condition cannot safely be reproduced. Label simulated results separately.

## Record results

Record Mac model/architecture, macOS version, installer version/commit/hash, profile expiry, schema deployment date, and pass/fail evidence for each step. Do not mark production iCloud ready until the real two-device round trip and failure handling pass. Incremental CloudKit change tokens are not implemented; this integration uses bounded full refreshes.

Apple Passwords/passkeys require approval of request `XDL783F4J3` (original `3PJLSLF88K`), a matching managed profile and separate native helper/pairing/autofill/passkey acceptance.
