Fix shutdown crashes and refresh the browser engine.

- Fix "Object has been destroyed" crashes when closing tabs, closing the browser, or restarting to install an update. AI logging and window cleanup retain safe references instead of reading destroyed native objects.
- Fix sidebar hover cleanup after native views disappear, and safely release extension panels, debugger attachments and email detection registrations.
- Release stale Developer Tools views when their inspector closes. Preserve right, bottom and panel docking, and restore the page without retaining a destroyed view.
- Ignore late load failures, ready events and input callbacks after dialogs or Hook Editors close. Avoid destroying already-closed hook test windows.
- Update Electron to 45.5.0 with Chromium 156.0.8078.109, including upstream fixes for renderer crashes and aborted dialogs. Update DOMPurify, browser routing and folder-tree dependencies.

Versions 1.0.18 and 1.0.19 require one manual installation of 1.0.20 or later to restore update checks.
