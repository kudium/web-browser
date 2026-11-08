# Workspace Preferences

Search engine and Sync lead the Preferences sidebar. Workspace combines Groups, Spaces and Archive with a segmented control. Existing preference-section requests still open the corresponding workspace tab.

Bulk selection excludes locked groups and keeps the first space as the destination for space contents. Select all followed by the confirmed bulk action replaces a separate Delete all command. Group and archive removal retain saved session data; space deletion preserves tabs and groups.

The Electron fixture uses disposable local data and the real Settings component. Captures cover 1000 × 760 and 760 × 760, light/dark, all three tabs, selection, confirmations and removal. The rendered list and confirmation captures were visually reviewed; overflow assertions passed. Existing icon/color popovers and native window dragging were not re-reviewed in this change.

Seven focused tests, TypeScript and targeted ESLint pass.

Run: `./node_modules/.bin/electron .erb/scripts/workspace-preferences-review.cjs`
