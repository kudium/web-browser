# Session management

Sessions represent browsing identities containing tabs across multiple websites. Session metadata is separate from page titles and favicons.

- [x] Reuse SessionEditor in the in-app session dialog and existing edit-session window.
- [x] Rename the session without overwriting individual page names or custom titles.
- [x] Choose recommended emoji, use the macOS system emoji picker with the field focused, paste emoji, choose an image, or return to the website icon.
- [x] Keep shared session icon metadata separate from tab favicon updates.
- [x] Choose a space, folder, and regular/pinned/favorite placement for all tabs in the session.
- [x] Set a session home page and provide Open Session Home in its context menu.
- [x] Preserve session partitions, cookies, logins, URLs, and individual tab identities when saving settings.
- [x] Responsive editor, save/cancel controls, validation, and keyboard-friendly form controls.
- [x] Unit tests cover shared identity/group changes and preserved page metadata; Electron verifies in-app editing, shared rename/emoji, and narrow layout.

## Shared logins and searchable session selection

- [x] Reusable SessionPicker with search, keyboard selection, deduplicated choices, empty results, and a maximum of 100 rendered matches while searching the full set.
- [x] Reuse in session login settings, Preferences site-data/profile actions, and extension access.
- [x] Offer “Share login with another session” rather than “Merge”: separate session groups use the same browser storage partition.
- [x] Keep grouping identity (sessionId) separate from login storage (sessionProfileId), including website permissions and extension scope.
- [x] Confirm login changes before reloading affected tabs. Existing browser storage is retained.
- [x] Allow returning to Independent login using the session’s original storage.
- [x] Explicit new independent sessions clear inherited login sharing; tabs opened within a shared session keep its profile.
- [x] Warn in Preferences that storage actions affect all sessions sharing a login.
- [x] Unit tests cover searchable selection and separate group/shared profile metadata. Electron verifies picker selection and actual shared cookies across distinct groups.

Sharing includes cookies, local storage, permissions, and profile-scoped extension data. It does not merge tabs or clone storage. Shared sessions reference the same persistent store; the chosen profile ID is resolved at save time rather than following future reassignment of another group. A destructive merge operation is not part of this feature.

## Move tabs into sessions

- [x] Drag a horizontal tab onto another session row or tab to join its group, regardless of website origin.
- [x] Adopt destination session identity, grouping, icon, home setting, and login profile while preserving page title/favicon/URL.
- [x] Confirm before switching to different login storage; shared-profile moves preserve the live webview without a reload or prompt.
- [x] Preserve remaining source tabs and use current destination metadata for links opened after a move.
- [x] Remove same-origin restriction from the Move Tab to Session context menu.
- [x] Unit tests and Electron verification cover cross-site movement, target cookies, unaffected source tabs, shared-profile live views, and new links after transfer.
