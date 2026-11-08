# Apple integration readiness — November 8, 2026

## Current state

Kudium Account sync has a working local implementation and passing two-device backend tests. It still needs the updated backend deployed and a signed desktop release. iCloud browser-data sync has no active CloudKit transport. Apple iCloud Passwords is a separate managed capability; its helper currently rejects Kudium's signing identity.

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
