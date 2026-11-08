# Extension store IPC and approval lifetime — November 7, 2026

Chrome Web Store handlers previously accepted any same-origin frame. Uninstall approval checked the destination owner after review but did not bind the requesting document, selected profile, ownership history or the later queued catalog write. Native tests reproduce mutations after those conditions change.

`extensions.ts` now requires the exact current main frame, WebContents sender, store session and live store owner. Status requests bound IDs to 128 characters and manifest JSON to 1MiB, with object/integer-version validation before catalog access. Uninstall requests capture source/target profile revisions, owner, catalog revision and exact installed-entry snapshot. The existing IPC document watcher invalidates navigation/crash/destruction. Checks run after review and synchronously immediately before the queued catalog write. Target or owner changes followed by restoration still invalidate the captured revisions. Listeners are removed on every exit.

| Native case | Before | After |
| --- | --- | --- |
| Same-origin child status IPC | Receives enabled status | Rejected |
| Navigation during uninstall review | 1 catalog mutation | 0 |
| Target changed and restored during review | 1 catalog mutation | 0 |
| Target changed/restored after review, before queued write | 1 catalog mutation | 0 |
| Profile owner released and restored during review | 1 catalog mutation | 0 |
| Approved unchanged removal | 1 catalog mutation, success | 1 catalog mutation, success |

`.erb/scripts/extension-store-boundary-smoke.cjs before/after` runs actual native main/child-frame IPC against the bundled handlers and real disposable filesystem catalog. The baseline retains pre-change `extensions.ts`; source/probe/binding hashes and results are in `extension-store-boundary.json`. A local session protocol serves the HTTPS store origin. A fixture-only subframe-enabled preload exposes IPC for the attack; it is not a production preload change. Extension engines, store initialization and native review are adapters, and the synthetic extension is not installed. Therefore this proves the application handler/catalog boundary, not live-store installation or dependency router behavior.

A replaced renderer can leave an executeJavaScript reply pending after navigation. The probe additionally observes handler completion while preserving native IPC transport, so it waits for actual queued mutation/cancellation rather than assuming a renderer timeout means the handler stopped. The final native report uses explicit resolved result/error objects for child replies. An earlier harness timed out before this observation fix; that timeout is not passing evidence.

Unit checks cover child rejection, malformed/oversized manifests, navigation, changed/restored targets, queued invalidation, listener disposal and existing disk-full retry behavior. All 142 suites /732 tests, lint/types and production build pass. Quality outcomes and hashes are recorded in `extension-store-boundary-verification.json`. The after native probe is registered in desktop checks.

No whole-app speedup is claimed. Uninstall reviews perform extra catalog reads and retain temporary document listeners until review/queue completion. Existing synchronous catalog persistence is unchanged. Live-store install and dependency/native-messaging branches, comprehensive scheduled-task/private network containment, compositor/sidebar focus, signed release and intended-platform validation remain open. Production readiness remains unproven.
