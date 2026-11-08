# Browser history and macOS menus

Implemented November 4, 2026.

## Sidebar library

- [x] Downloads / History built-in spaces inside the swipeable sidebar.
- [x] Compact shared header, dock toggles without a top close control, small search controls, single-row file actions and consistent empty states.
- [x] Command+Y (Control+Y elsewhere) opens History; configurable in Keyboard Shortcuts.
- [x] HTTP/HTTPS visits and main-frame in-page navigation recorded across profiles.
- [x] Persisted titles, URLs, timestamps and profile IDs; latest 10,000 visits retained.
- [x] Search titles and URLs, group by date, and incrementally display entries.
- [x] Revisit a page in the selected browser tab.
- [x] Remove individual records or confirm clearing all browsing history.
- [x] Clearing history leaves cookies, logins, downloads and open tabs intact.
- [x] Trusted main-frame IPC; URL credentials removed and non-web URLs excluded.
- [x] Responsive sidebar with website view retained.

History starts recording with this implementation; Chromium does not provide an API for recovering visits previously unrecorded by Kudium Browser. The local history file is private to the app user but is not encrypted. Cloud synchronization is outside this feature.

Verification: 80 tests pass; production build, TypeScript and focused lint pass. Electron history smoke verifies real visits, search, revisit, clear and narrow sidebar layout:
`npx electron .erb/scripts/browser-ui-smoke.cjs --history-only`

## Native macOS context menus

- [x] Existing Look Up, Speech and Services retained.
- [x] Native Share submenu added for selected text, the clicked link, or the page URL.
- [x] Template tests verify sharing payload and Services role.
- [ ] Investigate dedicated Siri invocation for selected web content.
- [ ] Investigate a dedicated ChatGPT action, availability detection and user-controlled context sharing.

Electron exposes native menu roles for Services, Speech and Share:
https://www.electronjs.org/docs/latest/api/menu-item

The Arc screenshot alone does not establish whether its Siri/ChatGPT entries come from Arc-specific code, OS integration or an installed service. Electron has no Siri or ChatGPT menu role. Implementing dedicated entries requires a supported integration and real-device validation; adding labels alone would not provide the functionality. Services availability depends on installed services, system settings and the focused native responder.
