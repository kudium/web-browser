# Download library

Status: implemented, November 4, 2026.

## Experience

An Arc-inspired downloads panel toggles inside the browser sidebar, replacing the session list with searchable history grouped by date. Clicking Downloads again restores the session list; swiping navigates through user spaces, Downloads and History; the website stays visible. Open it from the browser sidebar, the Downloads menu, or Command+J / Command+Shift+J (Control on other platforms). Bindings can be changed in Keyboard Shortcuts preferences.

- [x] Toggleable in-browser sidebar panel with responsive, scrollable history.
- [x] Persistent download records across application restarts.
- [x] Filename search; active/completed and file-type filters.
- [x] Today, Yesterday, Last 7 days and month groups.
- [x] Image thumbnails and system file icons with generic fallbacks.
- [x] Progress, pause/resume/cancel controls for live transfers.
- [x] Open completed files and reveal them in Finder / the file manager.
- [x] Remove individual records and confirm clearing history.
- [x] Clearing retains active transfers and never deletes downloaded files.
- [x] Main-frame IPC trust checks and actions restricted to recorded IDs.
- [x] Incremental display for long lists.

## Storage and boundaries

History is stored in userData/download-history.json with atomic replacement and private file permissions. Records contain local filenames, paths, byte counts, type and timestamps. Records from unfinished downloads become interrupted on restart; they cannot resume without a live Electron DownloadItem. Files moved outside Kudium Browser may no longer open from history.

Previously completed downloads cannot be reconstructed from the old in-memory-only implementation. Recording begins with this implementation. The library is local; cloud synchronization and file deletion are outside this feature.

## Verification

- Backend tests cover persistence, active-download preservation, file preservation, opening recorded files, invalid IDs and untrusted IPC rejection.
- Helpers are tested for date groups and common file types.
- Production build, TypeScript and focused lint checks pass.
- Electron smoke test performs a real HTTP attachment download, searches history, clears through the confirmation dialog, verifies the file remains, and checks desktop/narrow layout overflow. Run after building:
  `npx electron .erb/scripts/browser-ui-smoke.cjs --downloads-only`

Sidebar verification: `npx electron .erb/scripts/browser-ui-smoke.cjs --downloads-sidebar-only` tests a real download, inline history, toggling, keyboard opening, dock toggles, window count and sidebar overflow.
