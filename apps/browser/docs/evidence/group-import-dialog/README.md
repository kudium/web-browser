# Group import review

Replaced the native text alert with the shared sandboxed custom dialog. Every page appears in a scrollable list with its name, website/path and hook indicator. View all hooks expands all imported source grouped by website, including named hooks and their path filters. Source is escaped and displayed as text; it never executes. Hooks remain disabled after import, and Developer opens for enabling/editing.

The isolated Electron fixture reviews 540 × 640 and 360 × 640 in light and dark appearances, with the preview collapsed and expanded. All eight captures were inspected. Layout checks cover horizontal overflow, page/source completeness and fixed footer visibility. Cancel returns the cancellation response. Existing export and cancellation/isolation tests pass alongside escaped-source rendering tests (11 tests). TypeScript and targeted lint pass.

Run `./node_modules/.bin/electron .erb/scripts/group-import-dialog-review.cjs`.
