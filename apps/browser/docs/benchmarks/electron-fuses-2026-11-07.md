# Packaged Electron runtime hardening

November 7, 2026. Raw attack results: `electron-fuses.json`. Actual application
checks: `packaged-security.json`. Check/source identities:
`electron-fuses-verification.json`. Production readiness remains unproven.

## Change and actual before/after evidence

Electron 45's default fuse settings were present in the existing local package:
Node execution mode, Node environment options, main-process inspector and unpacked
app fallback were enabled; ASAR integrity validation was disabled. Packaging now
uses electron-builder's `electronFuses` configuration to disable the first three,
require app.asar, and enable embedded ASAR integrity validation. The builder applies
fuses immediately before signing. Local arm64 test builds reset the ad-hoc
signature; this does not provide a Developer ID signature or notarization.

A fresh macOS arm64 directory package was built from the current production
bundles, with publishing disabled and signing explicitly null. Its actual fuse
wire matches all five requested settings. Its Info.plist ASAR header hash matches
the actual archive header. The test fails if the known nine-entry fuse wire
changes, requiring review when Electron adds/removes fuses.

The adversarial probe copies that package into disposable app bundles, preserving
framework symlinks and checking real-path containment before edits. Both phases
use identical synthetic ASAR bootstrap code and matching header-integrity metadata.
The before copy restores the five original default bits; the after copy uses the
packaging settings. This isolates fuse behavior from unrelated application code.
Neither development Electron nor the input package is changed. This is a
reconstructed fuse baseline, not a full old-versus-new application benchmark.

| Native attack/check | Before | After |
| --- | --- | --- |
| ELECTRON_RUN_AS_NODE with a marker script | Script executes | Script ignored; packaged bootstrap and worker run |
| NODE_OPTIONS --require marker injection | Already rejected by packaged Electron | Rejected; no new exploit-prevention claim |
| Supported NODE_OPTIONS header-size override | Changes 16,384 → 12,345 bytes | Ignored; remains 16,384 bytes |
| --inspect on a random loopback port | Main inspector opens | No main inspector |
| SIGUSR1 after bootstrap | Main inspector opens | No inspector; default signal terminates process |
| Modify ASAR main.js bytes without changing its integrity metadata | Modified code executes | Exits 1 before bootstrap; integrity diagnostic |
| Remove ASAR and supply Resources/app marker code | Fallback code executes | Exits 1; fallback code never executes |
| Clean bootstrap and worker_threads | Both execute successfully | Both execute successfully |

Markers and process outcomes are verified in actual native processes. Timeouts
are not accepted for archive rejection. Elapsed times in the raw report are test
durations, not a performance benchmark. No speed, memory or GPU gain is claimed;
integrity validation can add archive-read work.

## Actual packaged application regression

The unified `test:packaged-security` command also launches the actual package with
disposable userData and a local HTTP fixture. Main/preload/renderer/HTML ASAR
entries must match the current production build before launch. Checks pass for:

- Rendered workspace and trusted preload preference updates, independently
  verified on disk.
- An actual website view running its local script without the privileged bridge.
- Browsing history recording, awaited worker-backed clear and empty JSON on disk.
- Production CSP rejecting an inserted inline script.
- Website-view removal after clearing the layout.

Chromium renderer CDP is explicitly enabled for this test. The main-process
inspector remains disabled. The test ends after awaited history persistence;
it does not prove normal quit flushing, native chooser/keyboard behavior,
extension/native-messaging flows or crash recovery. Full unit checks pass at
132 suites / 671 tests; whole-project lint/types and native packaging pass.

## Compatibility and open release work

Current application code uses worker_threads, not child_process.fork or an
ELECTRON_RUN_AS_NODE subprocess. Renderer DevTools remain available. NODE_OPTIONS
and NODE_EXTRA_CA_CERTS stop configuring packaged Node runtimes; administration
that depended on these environment overrides must use supported app/system
configuration. There is no data migration for these five settings.

Electron's cookie encryption remains off: enabling it is a one-way cookie-store
transition and macOS requires a properly signed Keychain identity. Signed existing
cookie migration, unavailable-Keychain behavior and rollback policy remain release
work. File-protocol extra privileges and the V8/Wasm defaults remain unchanged.
The app still uses file:// for its shell; custom-protocol migration needs separate
compatibility and security verification.

ASAR integrity is supported on macOS and Windows, not Linux. Windows/x64 runtime
verification remains open. External resources and unpacked native modules are
outside this ASAR payload check. Without trusted release signing, a party that can
rewrite the entire bundle can change fuses and integrity metadata too. Developer
ID signing, notarization, Gatekeeper installation and authentic updates remain
required. Chromium remote-debugging command-line switches also remain a separate
production hardening gate; they are not controlled by the main inspector fuse.

Reproduce the local package with:

```sh
node node_modules/electron-builder/out/cli/cli.js --mac dir --arm64 --publish never --config.mac.identity=null --config.directories.output=/tmp/kudiumbrowser-fuse-package
npm run test:packaged-security -- /tmp/kudiumbrowser-fuse-package/mac-arm64/Kudium Browser.app
```

Build current production bundles first if application sources changed. These
commands create a local unsigned package and disposable test data; they do not
upload or publish an application.

## Subsequent November 7 Chromium restriction

`packaged-debugging-2026-11-07.md` documents the follow-up that now removes
Chromium debugging port/pipe switches from packaged initialization. Native
transport tests run on the untouched current package. The unified command now
uses `packaged-observer-smoke.cjs` for UI/persistence/CSP checks in a test-only
rewrapped package with identical production payload bytes, replacing the initial
direct-CDP method described above. It adds no production bypass. Earlier direct
package/CDP results are historical in `packaged-security.json.previousRuns`.
The initial verification JSON describes its original run; current source/report
identities are in `packaged-debugging-verification.json`. Signing, cookies,
file-protocol privileges, external resources and other platforms remain open.
