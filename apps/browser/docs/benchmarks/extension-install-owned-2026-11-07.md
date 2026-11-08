# Owned extension installation — November 7, 2026

The application now prepares extensions without loading them, reviews the actual package permissions and loads directly into the selected session. The previous dependency path loaded into the store session first and only later applied profile policy. The selected-session native reproduction changes from **store → A** to **A only**.

`extensions.ts` owns `chromeWebstore.beginInstall` for registered store WebContents. It requires the exact main frame, store session and live owner, validates the extension ID, and binds document/owner/profile/catalog revisions before package preparation through review and queued dispatch. Dependency fallback `beforeInstall` is denied. The selected session is the default; All sessions remains an explicit separate grant. Ordinary callback refreshes with the same owner/name do not invalidate approval; owner/target changes and restoration do.

`extensionPackage.ts` copies a cached or downloaded package to a unique owner-only staging directory without executing it. It verifies Manifest V3 identity from the package key, reads actual required/optional permissions, and validates the copied file set and content hashes again after review. Later changes to the source cache do not alter the approved copy. Preparation uses asynchronous I/O, 256KiB copy/hash buffers and limits of 256MiB, 10,000 entries and depth 16; manifests are bounded to 1MiB. At most four installs prepare concurrently; preparation/review have a two-minute deadline. Native-load acknowledgement is not made cancelable by this change.

The queued operation rechecks ownership, validates/commits the package, publishes profile policy and invokes native loading without an await between the authorization check and load call. It preserves previously authorized siblings, supports explicit All-session installation, supplies the installed event/status path, and attempts removal/policy rollback on failure. Temporary packages are cleaned up; detailed filesystem errors stay in local extension settings rather than being returned to the store page. Existing source/cache data is preserved.

| Native case | Before | After |
| --- | --- | --- |
| Selected Target A | Store and A load | A alone loads |
| Explicit All sessions | All three profiles load | All three profiles load |
| Declined review | No native load | No native load |
| Changed/restored target or owner; navigation; change after review before dispatch | Store/A load | No native load |
| Reviewed package changed or file added | Store/A load | No native load |
| Actual package requests tabs, client metadata omits it | Review omits tabs | Review displays actual tabs permission |
| Source cache gains tabs after review | Native package gains unreviewed permission | Approved immutable copy retains original permissions |
| Same-owner callback refresh | Install succeeds | Install succeeds |

`.erb/scripts/extension-install-owned-smoke.cjs` executes 12 cases before and after with actual installed engines, native IPC and a generated-key local cached MV3 package. Six stale/package-mutation cases change from two native loads each to zero. All cases leave no staging directories. Source/probe/runtime identity and native load order are in `extension-install-owned.json`; retained baseline is the pre-repair scope diagnostic snapshot. Final native source hashes are verified, and the cases run in desktop checks. The original diagnostic remains historical evidence rather than a repaired test.

All 143 suites /735 tests, lint/types and production build pass. Final focused tests additionally cover the preparation timeout, copied-source independence, file additions/content mutation, identity rejection and pre-commit revocation. The final timeout assertion was added to an existing case after the full suite; the focused 8 tests and scoped test lint pass. Logs and hashes are in `extension-install-owned-verification.json`. No whole-app speedup or timing improvement is claimed.

Verification is macOS arm64 with local cache packages. Remote Chrome Web Store UI/download compatibility, remote CRX authenticity and download/extraction resource bounds, unregistered dependency transport routes, failure-recovery durability, Stop/navigation during already-dispatched native load acknowledgement, and Windows/Linux native behavior remain unproven. The change does not close private website descendant/worker/existing-channel containment, compositor/sidebar handoff or signed-release gates. Production readiness remains unproven.
