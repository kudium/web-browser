# Website links stay in tabs

Website requests for new pages belong inside Kudium Browser. Plugin and extension windows retain their separate popup behavior.

- [x] Route HTTP/HTTPS website window requests into tabs in the source session and space.
- [x] Command-click opens a background tab without changing selection.
- [x] Foreground website window requests open a selected tab.
- [x] Prevent website requests from creating separate native windows.
- [x] Preserve the existing extension window creation path.
- [x] Keep the popup-blocking preference for unsolicited website requests, with wording describing tabs.
- [x] Reject unsupported schemes.
- [x] Verify routing with unit tests and an Electron desktop check using a native Command-click and `window.open()`.

## Compatibility boundary

This implementation opens HTTP/HTTPS destinations as independent tabs. It does not provide a child window object to the requesting page. Flows that open `about:blank`, write into a popup, or require `window.opener` messaging need further tab lifecycle support.

- [ ] Support opener-based website flows entirely within tabs, including blank child pages and form submissions, without permitting native website windows.

## New-page metadata

- [x] Use shared newPageTab construction for website window requests and context-menu link opening.
- [x] Initialize the title from the destination hostname and clear inherited favicon/custom title/position.
- [x] Preserve the source session and space without copying the source page identity.
- [x] Resolve actual title and favicon once the destination loads; lazy background tabs show the hostname until opened.
- [x] Unit routing assertions and Electron verification cover hostname placeholders plus a destination-specific title and PNG favicon.

## Consistent address navigation

- [x] Address entry and search navigate the selected tab regardless of destination origin.
- [x] Create a tab/session from the address field only when no tab is selected.
- [x] Keep explicit separate-session commands available.
- [x] Electron regression verifies cross-origin address navigation preserves tab count, session partition, selection, and back history.
