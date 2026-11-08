# AI attachment import ownership and bounded file reads

Date: November 7, 2026. Scope: macOS arm64, Electron 45.0.0; synthetic files and disposable profiles.

## Problem and implementation

The previous picker/add handlers resumed after asynchronous work and attached files to whichever chat was then selected. The picker did not reauthorize after its dialog. A chat switch, revoked access or navigation could therefore redirect private attachments; clear/dispose could be followed by a late insertion.

Imports now capture the original chat, native frame, composer revision, access revision and group. Navigation, host closure and destruction revoke that operation. Handlers revalidate after waits and before committing; document extraction independently checks ownership before storage. Failed batches remove only entries they created. Preferences configuration remains authorized through its independent settings window after browser closure, verified by the existing native AI smoke.

Selected files use asynchronous descriptor-bound open/stat/read/close. Reads allocate at most the initial size plus one byte, reject nonregular, empty or >20 MB files, detect growth and changed size/mtime, and close descriptors on failure. Existing attachment-count, total-byte and extraction limits remain enforced.

## Actual before/after evidence

| Native handler case | Before | After |
| --- | --- | --- |
| Picker chat switch | Accepted; 1 retained | Rejected; 0 retained |
| Picker switch away and back | Accepted; 1 retained | Rejected; 0 retained |
| Add chat switch | Accepted; 1 retained | Rejected; 0 retained |
| Access changed then restored | Accepted; 1 retained | Rejected; 0 retained |
| Clear during add | Accepted; 1 retained | Rejected; 0 retained |
| Native navigation then restoration | Accepted; 1 retained | Rejected; 0 retained |
| Partially imported picker batch | Accepted; 2 retained | Rejected; 0 retained |
| Service disposal | Accepted; 1 retained | Rejected; 0 retained |
| Normal two-file picker | Succeeds | Succeeds |
| Selected-file synchronous reads/stats | 2 / 2 | 0 / 0 |

Raw results: `ai-import-boundary.json`. Exact pre-change AI/composer snapshots are retained under `baselines/ai-imports/`; other bundled dependencies are current and hashed. The after probe invokes actual registerAI handlers with real Electron main-frame identities. Picker completion and add method entry are deliberately delayed to reproduce races. Unit tests independently revoke ownership during the actual extraction await and verify no entry/capacity is committed; real file tests cover bounds, growth and descriptor cleanup.

## Reproduction and verification

```sh
node node_modules/electron/cli.js .erb/scripts/ai-import-boundary-smoke.cjs before
node node_modules/electron/cli.js .erb/scripts/ai-import-boundary-smoke.cjs after
node node_modules/electron/cli.js .erb/scripts/ai-smoke.cjs
npm test -- --runInBand
npm run lint
npm run build
```

See `ai-import-boundary-verification.json` for observed results and SHA-256 identities. The after import probe is included in the desktop runner. No broad native-suite pass follows from these scoped checks.

## Limits and remaining release gates

Synchronous I/O counts prove removal for selected-file reads/stats only; no whole-app latency, CPU or memory improvement is claimed. The handler probe does not establish renderer IPC serialization or private bytes at provider/upload destinations. Native image decoding still precedes the pixel-limit check; broader decoder containment is open. Size/mtime checks cannot guarantee detection of malicious same-size modifications with spoofed metadata. The disposed-store probe retains a reference for inspection and does not establish an unbounded production memory leak.

A current unsigned/ad-hoc macOS arm64 directory package passes the packaged-security runner: fuses, actual-package debugging refusal and UI/preload/isolation/history/CSP/cleanup through a test-only ASAR observer with identical production payload. This is instrumented-copy evidence, not signed untouched-release full UI verification. Signed distribution/update authenticity, cookie migration/Keychain behavior, other platforms, full IPC inventory, file-protocol/native-resource privileges and downstream private-data containment remain release gates. Existing native input/compositor and broader AI sidebar focus failures remain unresolved.
