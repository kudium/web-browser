# Extension IPC provenance — November 7, 2026

The dependency router previously accepted caller-supplied extension IDs and
resolved requested remote partitions without an owning-workspace check. Normal
requests and listener changes now require an actually loaded extension and its
matching live extension frame or current service worker. Spoofed IDs and website
frames are rejected. Cross-session toolbar requests require the owning workspace
main frame before partition resolution and again for the resolved target profile.
Closed/released profile owners lose access. Extension API request/response
payload logging is removed from the preload and router.

Both reviewed CommonJS/ESM bundles and both dependency trees are patched by the
existing postinstall/prebuild adapter. Installed routing regressions verify valid
frame/worker traffic, spoofed IDs/listeners, stale workers, rejection before
partition resolution, target ownership, normal toolbar traffic and payload-log
removal. Main-process tests cover owning main-frame and target-session checks.

Scoped verification: 12 extension/package tests pass, both installed router
regressions, scoped lint and the production build pass. A real Electron/installed
engine selected-install regression passes with native loads `["a"]`, preserved
separately in `extension-router-native-selected-2026-11-07.json` rather than
overwriting the historical install report. Whole-project verification
encountered concurrent developer-terminal/editor changes: the latest run reported
three failing suites and lint errors in those files. Those edits were preserved;
the earlier 746-test green result is historical rather than current confirmation.

Remaining limits include asynchronous dependency capability lifetimes, full
renderer/extension integration and OS native host/platform validation. This is
not blanket authorization of every installed dependency API.
