# Kudium Browser branding and menu review

The application now uses Kudium Browser in user-facing source text, page titles, native menus, About information, package metadata, current README/Skills/MCP documentation and AI guidance. Original logo copied unchanged to assets/icon.png. assets/app-icon.png is a square, centered derivative; ICNS and ICO contain platform-sized derivatives. Existing bundle ID, profile storage, IPC names, MCP connection keys/resource URI and portable formats remain compatible. Historical evidence retains its original branding.

Validation on 2026-11-07:
- Production webpack build, TypeScript, targeted ESLint and diff checks passed.
- 40 focused tests across menu, shortcuts, settings, group-context, group import, window commands, request handling, preferences and runtime security passed.
- The running macOS development application was relaunched and its native identity/window title both read Kudium Browser. Existing groups and project links remained available.
- Every native menu was opened and its accessible entries inspected: application, File, Edit, View, History, Workspace, AI, Developer, Window and Help. macOS strips ampersands from labels; those labels were changed to use “and”.
- Browser Tasks was selected from the native AI menu and the Tasks pane opened. About showed the new logo/name/copyright. This exposed Electron's development version as the app version; source now uses projectVersion in development and the packaged app version in production. That final version correction was build/type checked, not rechecked after another live restart.
- Four isolated Electron branding captures at 1000px/760px in light/dark appearance were produced and inspected. These show the name/logo on a disposable review document, not screenshots of the production settings page or native menu popups. Native menu screenshots were unavailable through the computer-use tool, so the complete native visual review remains outstanding. Windows/Linux native rendering, all menu action flows, signed installers, notarization and update delivery were not exercised.
- A broader test selection found unrelated missing fixture dependencies in ui.test.tsx and aiTasksPanel.test.tsx; these failures remain unresolved. Passing focused checks do not establish complete production readiness.

Repeat the isolated capture with `./node_modules/.bin/electron .erb/scripts/branding-menu-review.cjs`. macOS development-host branding runs before `npm run dev` using `.erb/scripts/brand-development-app.cjs`; installed builds obtain their name/icon from electron-builder metadata.
