# AI sidebar context menus

Tab and group actions reuse the browser's existing native menu definitions. Developer page rows, context chips, inline references, group selectors, and the reference picker delegate to those definitions. Messages, attachments, and tasks have element-specific actions; editable controls retain native editing commands.

Verification:

- 32 tests across seven focused suites passed: nativeContextMenu, developerSidebar, aiMessage, aiTasksPanel, shellContextMenu, aiSidebarContext, and aiSidebarRecovery.
- Targeted ESLint, TypeScript, and the production build passed.
- The isolated Electron fixture `.erb/scripts/browser-ui-smoke.cjs --developer-sidebar-only` passed using real Main/AISidebar and disposable user data. Actual mouse input opened the Developer page's tab menu alongside the production native fallback listener. Pin/unpin, Shift+F10, group-menu selection preservation, and Manage hooks were exercised. Opening the menu or hook editor did not load dormant tabs.
- Actual mouse input in the composer produced native Cut/Copy/Paste roles without invoking clipboard commands.
- Electron screenshots were reviewed at 1160px/light and 740px/dark, with additional header layout checks at 600, 368, 300, and 240px sidebar widths. Screenshots are in `../developer-sidebar/` and `../ai-header/`.

OS menu contents/actions were checked through the actual Electron Menu objects; webContents screenshots do not capture native menu popups. Message and task menu actions were verified in component tests rather than through native mouse interaction. The user's running app and profile were not restarted or modified.
