# Browser interaction and organization

Owner: Kudium / Kudium Browser. Updated November 4, 2026.

## Research and approach

Arc was inspected through its installed macOS interface: favorite single-click,
favorite right-click menu, Rename dialog and Cancel, Command+T command bar, and
Preferences → Shortcuts → search for “back” → Go Back (Alternate) → priority menu.
A sidebar screenshot also showed four favorites columns and nested folders.
The Mac initially required unlocking; inspection resumed after the user unlocked it.

Use these interaction patterns as references. Kudium Browser keeps its own visual design
and explicit isolated-session model. No Arc names, pinned URLs, shortcut settings
or account data were edited. Findings below describe browser controls, not private
website content.

| Observed Arc behavior | Kudium Browser decision |
| --- | --- |
| Favorite single-click activates its page | Preserve single-click session activation and clear active state |
| Four favorites columns; the inspected collection had twelve tiles | Use four columns and no row-count cap, with scrolling for larger collections |
| Favorite menu separates Rename, Edit Pinned Page, Split View, Move To, Remove Favorite | Keep name, home URL, placement and favorite status as distinct actions |
| Rename opens a small name dialog with Cancel/Rename | Use a responsive favorite rename dialog with Cancel/Save and accessible labels |
| Folders visibly support nested organization | Ship consistent flat session-folder moves now; plan nested folders next |
| Command+T opens “Search or Enter URL…” | Keep Kudium Browser command palette and session-aware new-tab flow |
| Shortcuts page searches feature names and shortcut labels | Dedicated searchable Keyboard Shortcuts preference page |
| Go Back uses Command+Left; alternate uses Command+[ | Support requested Command+[ / ] and shifted { / } aliases; bindings are editable |
| Shortcut priority offers Prefer Websites / Use Both / Prefer Arc | Track per-action/site priority as a follow-up; current registered shortcuts take browser priority |

## Completed implementation

- [x] Four favorites columns in expanded sidebar; compact sidebar retains one column.
- [x] No row-count cap; a large favorites collection scrolls while location and
  session controls remain reachable. Verified with 26 favorite tiles.
- [x] One favorite tile per session, single-click activation, accessible names,
  custom-name tooltips and existing native context menus.
- [x] Favorite renaming in a responsive dialog; Cancel leaves the name unchanged.
- [x] Existing flat app/session folders retain create, collapse, rename and removal.
- [x] Removing a folder returns its sessions to the space without deleting tabs.
- [x] Shared session-folder move logic for drag-and-drop and context-menu actions.
- [x] Moving to a folder moves the source-space session's saved tabs together,
  removes favorite status, pins it in the destination and retains its session ID.
- [x] Folder-heading drop feedback and collapsible contents.
- [x] Shared shortcut registry and persistent validated overrides.
- [x] Dedicated searchable Keyboard Shortcuts preference page with capture dialog,
  unassign, reset one action and reset all bindings.
- [x] Reject duplicate bindings, duplicate modifiers, malformed keys and reserved
  editing/system combinations with readable errors.
- [x] Temporarily suppress native menu accelerators while recording a binding;
  restore them when the capture dialog closes.
- [x] Apply shortcut changes without restart and rebuild native menu accelerators
  from the same registry. Opening settings does not replace the main browser menu.
- [x] Handle shortcuts with website or workspace focus; page actions target the
  focused website pane directly, including split-view panes.
- [x] Command+[ / ] and Command+Shift+[ / ] (the { / } keys) for back/forward.
- [x] Address/new-tab palette, tab switching, close/reopen, find, reload, print,
  zoom in/out/reset, preferences, sidebar and space switching.
- [x] Build, TypeScript, targeted lint and automated interaction checks.

## Next phase and research still needed

- [x] Inspect Arc's folder-specific right-click actions (November 4 native UI).
- [ ] Verify actual folder drag/reordering behavior in a disposable research space.
- [ ] Nested folders: parent IDs, cycle prevention, rename/move/delete semantics,
  depth limits and migration of existing flat folders.
- [x] Persist folder and space collapse state locally across reload/restart.
- [x] Folder Left/Right collapse/expand and enter contained sessions with Right.
- [ ] Complete keyboard folder traversal and context-menu “new folder” /
  “move folder” actions.
- [ ] Improve favorite reordering feedback and add folder creation from selected
  sessions; verify behavior across spaces and compact sidebar.
- [ ] Add per-action/site shortcut priority with an explicit policy for text fields,
  editors and application shortcuts. No website-first mode is claimed yet.
- [x] Independent alternate binding addition/removal, capped at four per action.
- [x] History/download actions and bindable Extensions menu are in the registry.
- [x] Versioned shortcut JSON import/export with change review, platform-aware
  validation and retry without replacing bindings on failure.
- [ ] Keyboard-layout/localized key labels and split management shortcut actions.
- [ ] Revisit home-URL editing and left/middle/modifier-click actions with a written
  behavior matrix for favorites, sessions, tabs and folders.
- [ ] Verify all native menu interactions manually in a packaged Kudium Browser build.

## Acceptance and scope

Folders organize whole sessions in a space. Moving a session changes placement,
not its cookie partition. A folder move can move a favorite from another space
into the current space only through the explicit menu or drop action. Removing a
folder clears matching folder IDs only in that space. Nested folders are pending.

Shortcuts are application-scoped, not global OS hooks. Mod means Command on macOS
and Control on Windows/Linux. Matching uses physical key codes and exact modifiers;
shifted bracket aliases are supported. Common editing/window controls are reserved.
Customizing an action replaces its default aliases; resetting restores them. Native
menus show the first binding, and the input dispatcher recognizes all configured
bindings. Current registered browser shortcuts take priority over website handlers.

## Verification

- `npx jest --runInBand` — all 27 suites / 69 tests passed.
- Focused unit checks cover exact/platform modifier matching, shifted bracket
  aliases, conflicts/reserved keys, capture/save and menu suppression, live native
  menu rebuilding, preference persistence and session-folder partition preservation.
- `electron .erb/scripts/browser-ui-smoke.cjs --shortcuts-only` verifies real
  Command+{ / } navigation, live Alt+B remapping, the old binding stopping, and real
  capture/save through the dedicated preference page at a narrow window size.
- `electron .erb/scripts/browser-ui-smoke.cjs --organization-only` verifies 26
  favorites across four columns with scroll, favorite rename dialog and accessible
  name, folder drops that retain the session ID, collapse and narrow layout.
- `npx tsc --noEmit`, targeted ESLint and `npm run build` verify implementation.

Screenshots from the focused Electron checks were visually inspected. Real Arc
controls were clicked as described above; Arc's broader feature set remains a
research backlog rather than an implied completed port.

## November 4 live inspection follow-up

Arc's toolbar Extensions Menu opens a compact dark panel with extension icons,
names and a pin control at the right of each row. Filled and outlined pins
distinguish pinned and unpinned entries. Add Extension and Manage Extensions sit
below the installed items. A right-click on an extension opens a native context
menu, although this tool's screenshot clipped that menu and AX did not expose its
entries. The visible site-data submenu is evidence of that control, not proof of
its permission semantics. Extension popup authentication remains unverified.

The folder context menu exposes Share Folder, New Nested Folder, Turn Folder into
Space, Copy All Links, Copy All Links as Markdown, Change Icon, Rename, Duplicate,
Move to (existing spaces and New Space), and Delete. These were read without
changing or deleting the user's folders. Kudium Browser currently has flat folders;
nested folders and the additional actions remain implementation requirements.

- [x] Persistent extension pin/order controls in the native management menu;
  toolbar keyboard focus follows the visual order. Management remains accessible
  with icons hidden.
- [ ] Compact extension picker with icon/name rows and inline pin controls.
- [ ] Extension site-access diagnostics that reflect supported enforcement.
- [x] Folder copy-links/Markdown and move-to-existing-space actions.
- [ ] Folder icon, duplicate and move-to-new-space actions.
- [ ] Nested-folder schema, cycle protection and conversion-to-space semantics.

Folder copy exports every non-archived page in that folder and space, rather than
only the selected page of each session. Markdown labels escape brackets and
newlines. Empty folders disable copy actions; successful and rejected clipboard
calls show accessible feedback. Moving includes archived pages and preserves tab,
session and shared-profile IDs. A destination folder-ID collision allocates a new
folder ID without combining unrelated folders. The destination remains accessible
after reload. Nested folders remain a separate schema change.

Verification: `--folder-actions-only` exercises the native menu, text/Markdown
clipboard calls, failure feedback, destination collision and reload reachability.
It intercepts clipboard writes in a disposable renderer rather than changing the
user's clipboard. Unit checks, whole-project lint/types, production build and all
42 suites / 113 tests pass. Destination sidebar screenshot was visually inspected.
