# Page capture lifetime and export commit — November 7, 2026

Evidence: `page-capture-boundaries.json`, `page-capture-verification.json`, and
`../evidence/page-capture-lifetime/results.json`. Native Electron 45, macOS arm64.

Captures now retain the requesting document and actual source WebContents
ownership through asynchronous pixels, printing, save selection and export.
Host navigation/crash/destruction invalidates pending work and saved previews.
Locked/removal-reserved source tabs are excluded. Immutable PDF bytes may still
be saved after source navigation. Cancel is checked after the native save dialog;
malformed crop values no longer default to the whole image. Replacing a capture
registration disposes the old service without removing the replacement.

Exports write an exclusive, owner-only temporary sibling, check ownership, then
rename into the chosen destination. Rename dispatch is the commit boundary;
revocation after dispatch cannot undo publication. Clipboard dispatch has the
same irreversible boundary. Failed/canceled pre-commit work attempts temp cleanup.

| Actual native observation | Before | After |
| --- | --- | --- |
| Nine stale/canceled operations accepted | 9 | 0 |
| Existing export destinations overwritten in six cases | 6 | 0 |
| Malformed crop clipboard dispatch | 1 | 0 |
| Replacement registration usable | No | Yes |

Both phases use the same final probe hash and exact source/bundle identities.
Normal visible/full capture, PNG export, crop dispatch and immutable PDF export
pass. The probe holds completions after actual Chromium pixel/PDF and filesystem
operations; save selection and ownership loss are explicit controls. Clipboard
is a dispatch counter in this boundary probe, without touching the OS clipboard.

Focused tests pass (2 suites / 15 tests), as do whole-project lint/types and the
production build. The separate renderer/main UI probe ran sequentially and passes
area selection/crop pixels, clipboard copy, native save cancellation, full-page
below-fold content, retained scroll position, zoom, PDF print text/layout,
foreign-window IPC rejection and light/dark narrow layouts. Dialog destinations
are disposable fixtures. Expected rejection diagnostics are present in its log.

Two obsolete real-clipboard probes were accidentally run concurrently before the
final controlled probe. They may have replaced the user's prior clipboard;
recovery is unavailable. Later sequential UI restoration does not recover or
validate that original clipboard. Those obsolete logs are excluded from evidence.

This change establishes tested lifetime/commit behavior, not image decoder
containment, native-resource bounds, path-race containment, crash/power-loss
cleanup, physical input/auth, signed/cross-platform readiness or general speed.
No full desktop suite rerun is claimed.

Image preflight follow-up: current after boundary report and native capture UI
were rerun with header/byte checks; all previously described lifetime cases and
normal exports pass. `page-capture-verification.json` now identifies current
sources and the image-preflight inventory snapshot. Full unit/lint/build evidence
is in `image-preflight-verification.json`; earlier focused-test counts above
describe the original capture-lifetime stage.
