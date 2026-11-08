# Space title and actions

Implemented November 4, 2026.

- [x] Compact borderless title row with chevron, space icon and name.
- [x] Click title to collapse/expand the space list; Favorites remain available.
- [x] Hover/focus ellipsis button and right-click native actions menu.
- [x] Change icon, rename and edit theme color through the shared customization form.
- [x] Save changes updates the existing space without duplicating it.
- [x] New Folder, New Space and Manage Spaces actions.
- [x] Delete Space is disabled for the final space and otherwise asks for confirmation; apps and sessions move to a remaining space.
- [x] Touch visibility and reduced-motion support for the collapse control.

Only implemented actions are shown; Arc-specific profile, sharing and live-folder integrations are not included.

Verified compact layout, icon/title, collapse/expand, native menu contents, existing-space rename and narrow widths with:
`npx electron .erb/scripts/browser-ui-smoke.cjs --space-title-only`

## Native menu polish

- [x] Keep the live webview visible when opening native space and system menus; only renderer overlays require snapshots.
- [x] Align the compact 24px space options button to the title row’s right edge.
- [x] Desktop regression verifies no webview hide transition when opening the space menu, plus alignment, rename, and responsive layout.

## Panel context menus

- [x] Right-click empty space panel to open the space menu rather than the default Inspect menu.
- [x] Space menu includes customization, new tab/folder, sort, archive unpinned sessions, create/manage/delete space.
- [x] Right-click empty horizontal tab bar for new tab, reload, duplicate, close other tabs, and close tab.
- [x] Preserve existing individual item menus and keep native webviews live while menus are open.
- [x] Desktop verification covers both menus and scoped Close Other Tabs behavior.
- [ ] Profile assignment, live folders, sharing, and folder export require separate feature implementation before adding menu actions.
