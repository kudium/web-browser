# Native extension engine integration — November 7, 2026

This follow-up verifies the extension-store boundary against installed `electron-chrome-extensions` and `electron-chrome-web-store` engines with a real, local Manifest V3 extension. It replaces the earlier catalog-only observation for the tested removal cases. No production source changed.

`.erb/scripts/extension-store-integration-smoke.cjs before/after` loads a permissionless local extension into three real persistent Electron sessions, all contained in a disposable user-data directory. It runs native main/child IPC through the bundled application handlers, checks catalog changes and actual `session.extensions.getExtension()` state, and preserves the other two profiles after each removal. Baseline uses retained pre-boundary `extensions.ts`; both phases use the same actual installed dependencies. Dependencies are externalized and loaded normally rather than mocked. Native review and local HTTPS store content remain controlled fixtures; a subframe-enabled fixture preload permits the child-frame attack.

| Case | Before | After |
| --- | --- | --- |
| Same-origin child status request | Receives enabled status | Rejected |
| Navigation during review | Target extension unloaded | Extension remains loaded |
| Target changed/restored during review | Target extension unloaded | Extension remains loaded |
| Target changed/restored after review before queued mutation | Target extension unloaded | Extension remains loaded |
| Owner released/restored during review | Target extension unloaded | Extension remains loaded |
| Unchanged approved removal | Target unloaded; two siblings remain loaded | Target unloaded; two siblings remain loaded |

Temporary request navigation listeners return to zero in every removal case. Renderer navigation can interrupt reply observation, so the fixture awaits the real handler completion in addition to native IPC. Every case checks actual native loaded state; it does not infer unloading from a catalog edit. Source/probe/binding hashes, installed engine versions, entry/preload hashes, Electron version and full results are in `extension-store-integration.json`. Check logs and source identities are in `extension-store-integration-verification.json`.

The initial harness used temporary session partitions, which Electron correctly refuses for extension loading; the final harness uses persistent partitions inside its disposable profile. A later report-only failure used a package.json export that the dependency does not expose; final metadata is read from the installed package files. Both failed attempts were terminal and corrected before final before/after evidence; neither is passing evidence.

Final native before/after checks and scoped runner lint pass. Production handler, IPC binding and test source hashes still match the prior passing full suite (142 suites /732 tests), lint/types and build. Those checks were not repeated. The new after probe is included in desktop checks. No whole-app performance claim or additional production behavior change is made.

This covers local extension loading, scoped native removal and the application store IPC boundary using actual installed engines. It does not verify remote Chrome Web Store download/install UI, extension permission/native-messaging routes, extension workers or arbitrary privileged dependency APIs, signed packaging, physical input or all-platform behavior. Those release gates remain open.
