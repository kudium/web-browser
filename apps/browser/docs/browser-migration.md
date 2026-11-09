# Browser migration

Preferences → Browser migration does not access other browsers automatically. Choose **Scan for browser data** to find profiles; the page explains that this reads other browsers’ profile folders and may trigger a macOS access prompt. Each time the page opens, a scan requires this explicit action. After scanning, review the selected data before importing.

It offers two import paths:

- Detect Chrome, Edge, Brave, Chromium and macOS Arc profiles in their standard locations. Import bookmarks/folders and up to 10,000 recent history URLs with their last-visit dates. These are saved as new groups with a new, shared login profile for that import.
- Choose a browser-exported password CSV. Chrome, Edge, Brave, Firefox and Safari CSV column conventions are supported. Only HTTPS logins are accepted. Review the count, authenticate to the password vault and import. Exact duplicates are skipped; existing passwords are kept. Passwords are not sent to the renderer or enabled for AI use.

The existing bookmark HTML, Arc Markdown and pasted-link imports remain available. Password CSV files contain readable secrets; remove the export after importing. No source-browser files are deleted or edited by the importer.

## Cookies and sign-ins

Optional cookie transfer currently supports macOS Chromium v10 cookie encryption using the source browser's Keychain Safe Storage entry. macOS can request access to that entry. Cookie secrets remain in the main process and are written through Electron's cookies API into the new import profile. Expired, partitioned, unsupported and failed cookies are skipped. Failed cookie access does not prevent bookmark/history import; the result reports the limitation.

This is not a complete browser-profile copy. Device-bound sessions, localStorage, IndexedDB, service workers, extensions, open tabs, and Safari/Firefox native cookie stores are not transferred. Some websites will require signing in again. Windows app-bound cookies and Linux keyring-encrypted cookies are not supported. Profile discovery can miss browsers installed with custom profile paths. Close the source browser if history cannot be read.

## Limits and verification

Native SQLite is read-only. Preview tokens are limited to ten minutes, one use, and the requesting trusted main frame. Callers cannot select an existing destination login profile. Password CSVs and bookmark JSON have an 8 MB limit; password imports are limited to 1,000 entries and bookmarks to 5,000 links.

Eleven focused tests cover CSV quoting/limits/filtering, encrypted-vault deduplication/AI exclusion, cookie decryption/host binding and native SQLite history with trusted one-use tokens. Electron fixtures review the actual settings at 900px and 360px in light/dark appearance, including pickers, review, loading, error, empty, password-result and completed-import states (40 layouts). No real user's browser profile or Keychain cookies were migrated during verification.

Repeat the settings review with `.erb/scripts/browser-migration-review.cjs`.

Locked source databases now fall back to private, stable temporary snapshots with WAL/journal files. Copies have restricted permissions and are deleted after reading. If the source changes during capture, the importer retries, then asks the user to close it. This fallback was verified against a locked Arc Default history; no data was committed to Kudium. UI errors now appear beside the import action and scroll into view.

### Arc sidebar import
Arc's macOS importer reads the current `StorableSidebar.json` alongside standard Chromium bookmarks. It follows reachable item IDs in sidebar order, preserving spaces, folders, favorites, and pinned state. It excludes stale/deleted items, cycles, unsupported URLs and spaces belonging to other profiles. Standard bookmarks are retained when a profile has no sidebar tabs; URLs already imported from the sidebar are not added a second time from the bookmarks file. Internal `__ARC_SYSTEM_PROFILE` entries are hidden, and the default profile uses a readable label. Source files remain read-only.

Validated with a real Arc sidebar count-only read (1,000 reachable default-profile tabs), synthetic profile-isolation/nested-folder/cycle/unsafe-URL fixtures, and native discovery/prepare tests covering system-profile exclusion and standard-bookmark fallback. Electron fixtures exercised 40 states at 900px and 360px in light/dark appearance, including both pickers, review, cancellation, loading, empty/error states, and completion. Profile picker screenshots were visually inspected at both widths and appearances. No real migration was committed.
