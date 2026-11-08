# Durable group deletion and exact target ownership

Date: November 7, 2026. Local Electron 45, macOS arm64.

Group deletion previously checked native frame equality, re-read only the tab
count/shared flags, cleared only the source tab's profile, and rejected a changed
owner after irreversible effects. Failed cleanup had no durable progress record.

The handler now retains the originating document through all approval/read/auth
awaits and compares exact tab IDs and login profiles. It rechecks ownership and
all app-owned users of profiles scheduled for deletion before committing. Every
unshared profile among the removed tabs is included; archived/shared owners keep
their profiles and scopes. Popup source metadata survives opener removal, and
pending website-created views are included in unloaded checks.

An atomic, file- and directory-synced journal records approved tab IDs, group,
space, unshared profiles, private scope and the next cleanup step. After commit,
cleanup finishes those targets independently of the originating invoke response.
Each successful effect is followed by a durable checkpoint. An interrupted
effect/checkpoint may repeat that idempotent step; completed steps are skipped on
an explicitly confirmed retry. Pending cleanup reserves browser groups/profiles
and scoped vault writes. Deletions serialize so shared-profile ownership cannot
change through overlapping removals.

Completed IDs remain retired in the main process across reload/restart. Saved
layout reads exclude them when deciding the final owner of a shared profile, and
browser sync refuses to reload them while asking the renderer to prune their
metadata. Renderer removal uses the approved IDs and reports storage failure
without repeatedly broadcasting a failed write. New tabs with new IDs remain
distinct from the deleted snapshot. Reservations use indexed sets; normal sync
avoids rebuilding a layout when no deletion restrictions exist.

| Actual native scenario | Before | After |
| --- | --- | --- |
| Same-URL reload during confirmation | Cookies deleted | Request rejected; cookie retained |
| Reload while post-dialog saved-layout read is pending | Cookies deleted | Request rejected; cookie retained |
| Replace a tab with another ID, retaining the count | Cookies deleted | Request rejected; cookie retained |
| A profile user remains live | Cookies deleted | Request rejected; cookie retained |
| Removed group contains two unshared profiles | Second profile cookie remains | Both profile cookies deleted |
| Requester closes after deletion commits | Data cleared, removal rejects | Approved cleanup completes; IDs durably retired |
| Last owner removed while saved layout still contains previously deleted owner | Shared cookie remains | Retired IDs excluded; last-owner cookie deleted |
| Cache failure followed by retry in a separate Electron process | Storage clear dispatched twice | Once; retry resumes after completed storage step |

The restart case launches two separate Electron processes with the same native
profile and saved layout. First cleanup fails after actual storage deletion; the
second confirms retry, finishes cleanup and retires the IDs. Cookies are empty
after both stages. The native boundary fixture controls dialogs, group-lock/
unloaded predicates, history dispatch and an uninitialized vault; Chromium cookie
and website-storage deletion is real. Per-case journal path resolution is
redirected while Chromium's user-data path remains fixed. These controls and the
executed bundle/source identities are recorded in `group-removal-boundaries.json`.

Unit tests cover journal reload/resume, target conflicts, serialized deletion,
pending scoped vault writes, malformed journal preservation, and failed renderer
metadata writes. The existing group-close-removal UI fixture separately exercises
the actual renderer/main lifecycle, native dialogs in light/dark/narrow windows,
cancellation, shared-profile retention and final-owner cookies/storage/history/
site-setting deletion. Observed commands and log/source hashes are recorded in
`group-removal-verification.json`.

## Recovery contract and limits

If cleanup fails after commit, the group stays unloaded/reserved and the user sees
that some data may already be gone. Retry requires fresh confirmation and relevant
vault authentication, then resumes only a matching intent. A changed target plan
is refused. If the journal cannot be durably written, deletion does not proceed.
Malformed journal data is preserved and rejected. The journal is bounded to 16 MB;
invalid/full/conflicting recovery needs further product recovery UI. Directory
durability and permission semantics are verified only on the tested macOS host;
unsupported directory syncing fails closed pending platform validation.

This is not an atomic transaction spanning Chromium, vault, history and renderer
storage. It provides durable intent, ordered resumable cleanup and retired-ID
enforcement. Repeated effect/checkpoint windows, abrupt kill/power loss at every
step, full-disk failures, installed-extension/session writers, recovery conflicts,
signed packaging and Windows/Linux behavior remain unverified. No physical OS
authentication or whole-app performance claim follows. Broader downstream
private-data containment and per-subaction/dependency IPC remain release gates.
