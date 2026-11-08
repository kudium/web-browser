# Apple browser entitlement request

Submitted November 4, 2026.

- Organization: Kudium LTD
- App: TouchBox
- Bundle ID: `com.kudium.touchbox`
- Request ID: `3PJLSLF88K`
- Entitlement: `com.apple.developer.web-browser.public-key-credential`
- Status: Submitted; awaiting Apple's review. Not yet approved.

The explicit App ID was registered in the Kudium developer account before
submission. Apple's receipt states: “Thank you for your submission. We’ll review
your request and contact you soon with a status update.”

The application answers Yes to macOS browser status, WebAuthn support, and planned
iCloud Keychain integration. It links to https://kudium.com,
https://github.com/samtax01/TouchBox, and the repository's releases page.
It discloses that TouchBox is in development, native iCloud Keychain integration
is incomplete, and packaging/HTTP/HTTPS URL handling work remains.

## Verified WebAuthn baseline

The existing Chromium engine passed registration and authentication in TouchBox
with a virtual CTAP2 authenticator. The test requires a resident credential and
user verification and checks the client-data operation types and authentication
signature presence. It does not authenticate against a real website's backend,
validate physical authenticators, or exercise iCloud Keychain.

Run: `node_modules/.bin/electron .erb/scripts/browser-ui-smoke.cjs --webauthn-only`.
The test uses disposable profiles and virtual credentials. It does not read,
export, or modify real passwords, pairing secrets, or keychain credentials.

## Native integration work

After approval, configure the managed capability and provisioning profile for a
signed main browser executable. Verify the native platform-authenticator path
with Apple's AuthenticationServices/iCloud Keychain and the Chromium WebAuthn
flow. Test existing-passkey sign-in, new-passkey registration, cross-origin and
relying-party restrictions, user verification, cancellation, and profile
isolation. Then retest iCloud Passwords helper launch, pairing, autofill, and OTP.

Keep secure contexts, TLS validation, renderer sandboxing, context isolation, and
trusted-UI IPC checks enforced. Approval does not establish conformance to every
security standard or prove complete extension compatibility.
