# Browser passkeys

System passkeys belong to the user's credential provider and relying party. They
are shared across Kudium login profiles. Kudium does not copy private keys into
Personal Data or account sync.

## Implementation and runtime prerequisite

`src/main/passkeys.ts` registers account selection for every Electron session
before creating browser views. The native system sheet handles platform passkey
registration, provider choice, authentication and user verification. Chromium
retains secure-context, RP ID, origin, Permissions Policy and request lifecycle
checks. Account selection is canceled when the requesting document or an ancestor is
replaced, the owning page closes, or its renderer crashes. Same-document changes
and unrelated iframe loads retain the picker.

Stock Electron 45.0.0 has an Associated Domains authenticator intended for apps
whose domains explicitly associate with them. It is insufficient for a browser.
We deliberately do not enable that authenticator in stock Electron.

`patches/electron/browser-passkeys.patch` exposes
`app.isBrowserPasskeySupported()` and uses Chromium's existing
`device::fido::icloud_keychain::NewDiscovery` for browser-entitled applications.
This uses Apple's browser-specific AuthenticationServices implementation and
Chromium's client-data hash, rather than the app-specific Associated Domains
implementation. Non-browser Electron applications retain their existing path.
The browser only enables platform passkeys when the patched runtime reports
support (macOS 13.5+ and the browser credential entitlement).

**The checked-in npm Electron binary is not patched. Full system passkey support
is not available until a patched runtime is built and packaged.** WebAuthn and
roaming authenticator account selection remain available with stock Electron;
Electron still lacks security-key PIN entry.

## Build the runtime

The repository now provides a local preparation workflow. Run from the repository
root on a Mac:

```sh
npm run runtime:prepare
npm run runtime:sync
npm run runtime:build -- --arch arm64
npm run runtime:build -- --arch x64
npm run runtime:verify -- --arch arm64
npm run runtime:verify -- --arch x64
```

Preparation checks Xcode, Node, Python and Rosetta; fetches a full Electron source
checkout and pinned depot_tools; applies the patch; and writes separate arm64/x64
release GN configurations. Inputs are recorded in
`patches/electron/runtime-inputs.json`: Electron `45.0.0` commit
`54f961b44b83e4ece81065ab60a182fd0c38c01e`, Chromium `156.0.8078.48`,
Node `v24.22.0` and native module ABI `150`. Electron source version verification
uses its Git commit/tag and DEPS, since its source package.json deliberately says
`0.0.0-development`.

Default workspace: `release-artifacts/electron-runtime/45.0.0/`, ignored by Git.
Preparation uses little disk space; dependency sync and compilation each require
100 GiB free before they start. This is a conservative local guard, not a measured
guarantee of total build size. Reserve ample additional capacity for two target
architectures. The current Mac has roughly 11 GiB free, so only source
preparation has completed. No large dependency sync or compilation was started.

Use the same whitespace-free `--root` path on every command when building on a
larger APFS volume, for example:

```sh
npm run runtime:prepare -- --root /Volumes/Build/kudium-electron
npm run runtime:sync -- --root /Volumes/Build/kudium-electron
npm run runtime:build -- --root /Volumes/Build/kudium-electron --arch arm64
```

Sync uses Electron's DEPS and upstream patch hooks. Build uses the upstream release
configuration, local/offline Siso execution and `electron:electron_dist_zip`.
There is no hosted build, remote build execution, signing, upload or publication.
Source changes must match the checked-in patch exactly, and existing differing
build configurations are preserved. A lock prevents concurrent changes to a build
root. Interrupted work retains its files; inspect the failure before removing a
stale lock or incomplete distribution.

Completed builds extract their distribution under
`distributions/darwin-<arch>-<patch-hash>/dist/` and record file checksums, upstream
inputs, patch checksum and probe results in a sibling `runtime.json`. The probe
requires the custom API and exact Electron/Chromium/Node/ABI/architecture values.
It accepts `browserPasskeyAvailable: false` for an unentitled binary and always
records native passkey acceptance as unverified. Stock Electron fails this probe.
Verification rechecks distribution checksums and runs the probe again.
Run `npm run test:runtime` from the repository root to verify the preparation
command, disk gate, configuration-preservation and source-provenance checks.

For manual source work, the patch helper remains available from `apps/browser`:

```sh
node .erb/scripts/patch-browser-passkeys.cjs /path/to/src/electron --check
node .erb/scripts/patch-browser-passkeys.cjs /path/to/src/electron --apply
```

Build Electron for each target architecture using its source-build workflow,
then pass the extracted custom distribution to electron-builder via
`--config.electronDist=/absolute/path/to/distribution`. Development must launch
that distribution's Electron executable too; `npm install` supplies stock Electron.
Do not publish a stock-runtime build as supporting system passkeys.

The signed app must use the approved browser entitlement configuration in
`.erb/scripts/approved-browser-signing.cjs`, including the provisioning profile
authorizing `com.apple.developer.web-browser.public-key-credential`. The base
packaging configuration does not carry that entitlement. Adding it to a plist
alone does not establish Apple approval. Associated Domains and website AASA
files are not needed for this browser API path.

Read `docs/build-and-release.md` at the repository root before building or
changing publication tooling. Current release tooling does not select a custom
Electron distribution; integrating the verified distributions for both
architectures into the release path is required before publication.

Preparation evidence and limits are recorded in
`docs/benchmarks/electron-runtime-preparation.json`. The patch also wires
`isUserVerifyingPlatformAuthenticatorAvailable()` to Chromium's browser discovery
availability. Discovery requires a local native window; app-shim stand-in windows
are excluded pending a supported native-sheet integration. These source checks do
not establish compilation or native behavior.

## Verification

The existing `browser-ui-smoke.cjs --webauthn-only` test checks registration,
discoverable credentials and authentication using a virtual CTAP2 authenticator.
The shared fixture also runs privately, verifies challenges, origin, RP hashes,
user-verification flags and actual ECDSA signatures outside the renderer, rejects
tampered assertions and invalid RPs, and checks cancellation/iframe policy. It
selects only its disposable virtual account. It does not verify native passkeys.

Native acceptance requires an approved signed app using the patched runtime:

- Verify `app.isBrowserPasskeySupported()` and the page's platform availability.
- Register and authenticate on an HTTPS WebAuthn test site with server-side
  challenge, origin and signature verification; include a subdomain whose RP ID
  is its parent domain to detect origin substitution.
- Authenticate with an existing system passkey, including from another login
  profile; verify provider selection where a third-party provider is installed.
- Cancel the system sheet; navigate, close and abort during a pending request.
- Verify excluded credentials, multiple accounts and iframe Permissions Policy.
- Check ordinary USB keys separately; PIN-required keys remain an Electron gap.

No native passkey success is established by a virtual test or signing inspection.
