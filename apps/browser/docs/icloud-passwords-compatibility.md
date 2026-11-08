# iCloud Passwords compatibility investigation

Verified November 4, 2026 on macOS 27.0.1 with iCloud Passwords 3.4.0.

## Finding

The extension loads, but macOS rejects the Apple native helper when launched
from Kudium Browser's Electron runtime. This is an operating-system launch constraint,
not a missing extension permission or a missing helper installation.

- The extension uses `chrome.runtime.connectNative("com.apple.passwordmanager")`.
- `/Library/Google/Chrome/NativeMessagingHosts/com.apple.passwordmanager.json`
  exists as a symlink into Apple's Cryptex. Its `allowed_origins` includes the
  official extension ID `pejdijmoenmkgeppbflobdenhhabjlaj`.
- The helper executable exists and passes `codesign --verify --strict`.
- A capability-only request (`{"cmd":14}`) receives no reply; the input pipe
  reports EPIPE and the helper exits with SIGKILL. No password query, pairing,
  or credential access was attempted.
- macOS DiagnosticReports for this helper identify an Electron parent and
  `SIGKILL (Code Signature Invalid)`.
- The helper's embedded parent launch constraint (code-signature slot 9)
  accepts a browser credential entitlement or specified signing identifiers
  paired with specified developer team identifiers. Arc and Dia are listed;
  Kudium Browser and the Electron development runtime are not.

The existing EPIPE compatibility patch prevents the broken pipe from becoming
an uncaught Electron error. It does not authorize Kudium Browser to launch Apple's
helper and therefore cannot make iCloud Passwords connect.

## Application identity

Company: Kudium. Bundle ID: `com.kudium.kudiumbrowser`. Website: https://kudium.com.
Contact: hello@kudium.com. Use these values in the Apple entitlement request.

## Supported next step

The helper installed on this Mac accepts
`com.apple.developer.web-browser.public-key-credential` as an alternative to its
explicit browser signing-identity list. Apple documents this as a managed browser
capability that an organization's Apple Developer Account Holder must request.

- Documentation: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.web-browser.public-key-credential
- Request: https://developer.apple.com/contact/request/macos-browsers-passkeys/

Apple's documented criteria include HTTP/HTTPS schemes in Info.plist, a URL
field/search/bookmarks on launch, and rendering the requested destination.
Kudium Browser now declares HTTP/HTTPS URL schemes and implements macOS external
URL opening (verified November 8). These application prerequisites are prepared. After approval, sign the main browser executable with
the managed entitlement and the appropriate provisioning profile, then test a
packaged build with the real helper. Normal Developer ID signing alone does not
satisfy the currently installed helper's constraint for Kudium Browser.

Do not add the managed entitlement to active development or release signing
configuration before it is granted. Renaming Electron to another browser,
changing the user agent, or copying the manifest does not supply that browser's
signing identity or team. Apple's helper and its launch constraints should
remain unchanged.

## Remaining validation after approval

Approval and an accepted helper launch are prerequisites, not proof of complete
extension compatibility. Test capability exchange, user-driven pairing, popup
state, frame-specific autofill, generated passwords, OTP handling, reconnects,
and independent session profiles. Also audit the native messaging transport for
UTF-8 byte lengths and fragmented/coalesced pipe frames before claiming full
password-manager support.

No saved passwords, extension storage, keychain databases, or pairing secrets
were read or modified during this investigation.

See [Apple integration readiness](apple-integration-readiness.md) for the current request details, capability checks and remaining acceptance work.
