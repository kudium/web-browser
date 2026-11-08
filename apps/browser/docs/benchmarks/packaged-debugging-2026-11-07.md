# Packaged Chromium debugging boundary

November 7, 2026. Native results: `packaged-debugging.json`. Application-payload
checks: `packaged-security.json`. Source/check identities:
`packaged-debugging-verification.json`.

## Finding and change

The previous fuse change disabled the main-process inspector, but Chromium's
remote-debugging port and pipe remained available. An actual packaged baseline
launched with these options exposed CDP. A client used the privileged app renderer
to update browser preferences, independently verified on disk. Website sender
checks do not distinguish this CDP-controlled renderer from legitimate UI code.

`restrictPackagedDebugging()` now removes remote-debugging-port,
remote-debugging-pipe, remote-debugging-address and remote-allow-origins from
packaged apps during main initialization, before ready/window creation.
Development apps retain debugging. There is no environment variable or special
release argument that restores the transports. User-opened renderer DevTools
remain separate from these remote endpoints; the main inspector fuse stays off.

## Actual native before/after

The before package is the previously verified fuse-hardened macOS arm64 package,
before this main-code change. The after package contains the new production main
bundle. Both use the same five fuse settings. Native executable/archive/main
identities are recorded. Each case uses disposable userData and a local startup
page. The page must load, execute JavaScript and report an undefined privileged
bridge; the process must stay alive while observations run. A failed startup does
not count as debugging protection.

| CLI transport | Before | After |
| --- | --- | --- |
| Random debugging port | Endpoint available; CDP updates app preferences | No endpoint or DevToolsActivePort file; local page runs |
| Fixed loopback debugging port | Endpoint available; CDP updates app preferences | No endpoint; local page runs |
| Debugging pipe using inherited descriptors | Browser.getVersion response received | No response; local page runs |

The probe polls through at least two seconds after page execution. For the port
cases, baseline CDP preference changes occur only after local page startup and are
verified on disk. After runs also require no debugging-listener diagnostic.
This is three native cases per phase, not a general startup/performance benchmark
or a proof about all future Chromium switch variants or platforms.

Earlier baseline attempts timed out waiting for the startup page while settings
were being changed during startup. The fixture now waits for page execution before
its CDP write. The cause of those earlier timeouts is unverified; they are not
passes or performance data. A diagnostic successful run with a different probe
identity remains historical in previousRuns. The final before and after reports
use the same current probe hash.

## Regression checks without a production debugging exception

The old direct-CDP `packaged-security-smoke.cjs` is retained as historical tooling;
it cannot test the new release package because its required endpoint is denied.
The packaged check runner now uses the native transport test plus
`packaged-observer-smoke.cjs`. That observer lives only in a disposable rewrapped
ASAR test copy. It runs fixed test programs from the native main process; it is
not included in production resources or exposed through production IPC.

Main/preload/renderer/HTML entries in the copy must match the actual package and
current production build byte-for-byte. The test recomputes its own ASAR metadata
and ad-hoc signature before launch, retaining the hardened fuse settings. It
verifies the same workspace/preload, live preference persistence, isolated website,
recorded visit and durable worker clear, inline CSP, and tab cleanup assertions,
plus absence of Chromium debugging. The unmodified after package separately
passes all three transport/startup checks above.

These observer results prove the production payload's tested behaviors in an
instrumented package. They do not prove pixel appearance, the untouched shipped
package's full UI flow, trusted signing, pending-quit flushing, native chooser,
extension/native-messaging behavior or cross-platform parity. Older direct-CDP
results remain in `packaged-security.json.previousRuns` with their original method.

Unit suite: **133 suites / 673 tests passed**. Whole-project lint/types, production
build and local arm64 directory packaging passed. The packaged security runner
also retains the fuse injection/archive/worker regression. No speed or memory
gain is claimed. JSON formats and user data need no migration; development tools
remain available. Signing, cookie migration, broader native input/focus, private
data, IPC inventory and other-platform release gates remain open.

Reproduce after building current production bundles:

```sh
node .erb/scripts/packaged-debugging-smoke.cjs before /path/to/previous/TouchBox.app
node node_modules/electron-builder/out/cli/cli.js --mac dir --arm64 --publish never --config.mac.identity=null --config.directories.output=/tmp/touchbox-debugging-package
npm run test:packaged-security -- /tmp/touchbox-debugging-package/mac-arm64/TouchBox.app
```

The before reference must precede the debugging restriction; an arbitrary old
package is not equivalent evidence. No package is uploaded or published.
