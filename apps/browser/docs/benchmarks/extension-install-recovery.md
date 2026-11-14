# Extension install identity and recovery — November 14, 2026

A native `extension-loaded` event previously rewrote a known package's catalog
identity when the loaded ID differed. That rewrite also prevented the installer
from matching its published policy during rollback. Known package identity changes
now remove the unexpected extension and preserve the catalog. Startup and update
loads reject mismatched acknowledgments as well.

Installation restores its catalog and newly loaded extensions inside the serialized
mutation, before another operation can dispatch. Cleanup matches the new package
path and leaves previously loaded sibling packages alone. Failed cleanup retains
the package for recovery and reports both the original and recovery errors.
Successful native installs/updates clear earlier load failures for their target.

The owned native fixture now verifies four recovery paths with real Electron 45
sessions and local generated-key packages: a key changed immediately before native
load, navigation after native load, a controlled native rejection, and an All Groups
installation whose second profile rejects after the first profile loads. Each
asserts no remaining native extensions, original disabled catalog policy, removal
of the committed candidate directory, and a successful retry. The key-change and
navigation cases use actual native loading; rejection cases control the loader.
The cases are registered in the desktop checks.

All 17 current owned-install cases pass, including installation through the native store-menu entry point. The four recovery reports, including
source and probe hashes, are in `extension-install-recovery.json`; the other 13
current reports are refreshed in `extension-install-owned.json`. The 11 focused
extension/update suites pass (51 tests). TypeScript, scoped lint and production build pass.

This evidence is macOS arm64 and controlled reviews/local packages. It does not
prove recovery after process termination or a hung native acknowledgment, remote
store/password-manager compatibility, package-retention bounds or signed installers
on other platforms. Those completion items remain open.

The latest live uBlock fixture now passes installation, worker startup, actual
native filtering and profile isolation through the existing Extensions menu.
Google's own page controls still intermittently disable installation. See
`extension-live-store.md` for the verified native-menu path and its explicit limits.
