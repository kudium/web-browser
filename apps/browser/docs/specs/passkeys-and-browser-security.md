# Passkeys and browser security implementation

Owner: Kudium / Kudium Browser (`com.kudium.kudiumbrowser`). Updated November 4, 2026.
Apple entitlement request: `3PJLSLF88K`, submitted and pending.

## Goal and release boundary

Support WebAuthn registration and authentication for website content, then native
iCloud Keychain passkey creation/sign-in and iCloud Passwords integration once
Apple authorizes a signed browser build. Do not claim native iCloud support from
virtual-authenticator tests. Do not bypass TLS, origin, code-signing, or Apple
helper launch constraints. No application code may log passkeys, native-message
payloads, private keys, passwords, or pairing secrets.

## Work available before approval

- [x] Register the explicit App ID under Kudium and submit the entitlement request.
- [x] Verify Chromium WebAuthn registration/authentication with a resident virtual
  CTAP2 credential and required user verification.
- [x] Declare HTTP/HTTPS browser URL schemes in packaged macOS metadata.
- [x] Handle cold-start and running-app external HTTP/HTTPS links, queue until the
  trusted renderer is ready, and restore/focus the main window.
- [x] Reject non-web schemes and untrusted renderer link-delivery requests.
- [x] Keep external links in independent session profiles to avoid silently
  selecting another account's credentials.
- [x] Audit Electron's native macOS WebAuthn delegate and document the native path.
- [x] Prepare an opt-in signing configuration and managed-entitlement template;
  normal development/release builds must not request the unapproved entitlement.
- [x] Verify UTF-8 byte framing and fragmented/coalesced native messaging replies.
- [x] Verify malformed/oversized native messages disconnect safely without logging
  credential payloads or raising an uncaught exception.
- [x] Handle EPIPE, closed streams, and native-host write failures without an
  uncaught Electron error.
- [x] Extend WebAuthn tests for RP rejection, signed user-verification/presence
  flags, AbortSignal cancellation, separate sessions, and restricted renderer defaults.
- [ ] Exercise independent credential stores, live prompt cancellation, cross-origin
  frames, hardware keys, and account selection beyond the virtual baseline.
- [ ] Implement and compile a browser-specific native passkey delegate; the API
  audit is complete, but this implementation remains outstanding.
- [x] Record passing targeted checks and remaining limitations in this spec.

## Work gated by Apple approval or user-driven native testing

- [ ] Apple grants the managed browser credential capability to Kudium.
- [ ] Obtain/update the matching provisioning profile and Developer ID signing.
- [ ] Verify main executable entitlements in a signed, notarized macOS build.
- [ ] Verify native platform authenticator discovery and real iCloud registration.
- [ ] Verify existing iCloud passkey sign-in and user-driven authorization/cancel.
- [ ] Verify iCloud Passwords helper launch, pairing, frame-specific autofill, OTP,
  reconnects, and session/account separation.
- [ ] Complete the browser-specific AuthenticationServices delegate and verify
  exact frame-origin/clientData handling with Apple's approved capability.
- [ ] Validate hardware security keys and supported macOS versions with real users.
- [ ] Release only after the native checklist passes; document supported scope.

## Acceptance criteria

External links render their exact HTTP/HTTPS destination without weakening web
security. Rendering, settings, and extension privileges remain isolated. Security
tests use disposable profiles and synthetic credentials. A passing virtual test
must verify registration/authentication, not just API presence. Pending items
remain unchecked with concrete reasons and steps to resume.

## Verification and findings

Initial baseline: `electron .erb/scripts/browser-ui-smoke.cjs --webauthn-only`
passes registration and sign-in on a localhost secure context using a virtual
CTAP2 authenticator. Real Apple helper launches currently fail macOS parent
launch constraints; the approved entitlement is still required.

### Completed checks (November 4)

- `npm run build` — passed.
- `npx tsc --noEmit` and targeted ESLint — passed.
- `node .erb/scripts/native-messaging-regression.cjs` — passed pipe disconnects,
  UTF-8 byte lengths, fragmented/coalesced replies, invalid JSON, and 1 MiB reply limit.
- `node .erb/scripts/external-links-regression.cjs` — passed cold-start queue,
  running instance delivery, exact URLs, rejected schemes/untrusted IPC and separate
  new session IDs. This uses the main handler with mocked OS/window events.
- `electron .erb/scripts/browser-ui-smoke.cjs --webauthn-only` — passed synthetic
  resident registration/sign-in, signed UV/UP flags, invalid RP SecurityError,
  aborted request AbortError and sandboxed renderer defaults/separate sessions.
- `plutil -lint assets/entitlements.browser.mac.plist` — passed template syntax.

Packaged macOS Launch Services behavior still needs a signed installed-app test.
The packaging dependency collector currently fails on the configured unavailable
pnpm 12.16.1 runtime; declaration and handler tests do not establish default-browser
or Apple helper compatibility.

### Native API audit and remaining implementation

Electron 45 exposes `app.configureWebAuthn({ platformPasskeys: true })` after ready.
Its [documentation](https://www.electronjs.org/docs/latest/api/app#appconfigurewebauthnoptions-macos)
and [native delegate source](https://github.com/electron/electron/blob/v45.0.0/shell/browser/webauthn/electron_platform_passkeys_authenticator_mac.mm)
use the domain-associated ASAuthorizationController path and derive clientData
origin from the RP domain. The source explicitly avoids the browser-specific
registration request API. Associated Domains/AASA authorization is required for
that path; it does not establish arbitrary website browser integration.

Do not enable this globally or claim native iCloud readiness. Implement a
browser-specific delegate that preserves Chromium's exact clientData/origin,
rejects unauthorized frame requests, cancels on navigation/destruction, and
returns authenticator responses through Chromium. Compile-level work can proceed
before approval, but entitlement-backed behavior requires a properly signed test
build. System credential providers share RP-scoped passkeys across browser sessions;
separate cookies/sessions do not isolate iCloud credentials.

### Approved signing preparation

Normal builds retain `assets/entitlements.mac.plist`. The opt-in main executable
template is `assets/entitlements.browser.mac.plist`; helpers retain ordinary JIT
entitlements. After capability approval and profile issuance:

```sh
export KUDIUMBROWSER_BROWSER_PROVISIONING_PROFILE=/absolute/path/approved.provisionprofile
npx electron-builder --mac --config .erb/scripts/approved-browser-signing.cjs
node .erb/scripts/verify-browser-signing.cjs /absolute/path/Kudium Browser.app
```

The verifier checks signature integrity, embedded profile presence and main
application/team/browser entitlement values. It does not establish Apple's grant,
profile entitlement authorization, notarization or successful native ceremonies;
those remain release gates above. No approved signed build has been tested yet.
