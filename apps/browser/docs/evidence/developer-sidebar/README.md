# Developer sidebar

The Assistant sidebar now includes Assistant, Tasks, and Developer tabs. Developer reuses the shared searchable group picker and group icons, shows each page's saved hook status, and opens the existing independent script editor.

Only the selected group's metadata is requested. Sources are not included in list responses. Search renders at most 100 matches, with a refinement hint. Updates are debounced and inactive panels stop listening. Saved scripts for unloaded pages can be edited without creating page views; Run loads the target page explicitly. Same-site pages sharing a login profile share saved hooks.

Checks:

- 27 focused tests cover the sidebar, metadata boundaries, existing editor, assistant recovery/context, and group-lock service.
- Production Electron browser fixture verifies real group picker/icons, active/disabled/no-hook statuses, offline editor and save, shared-site/profile behavior, assistant draft preservation, and locked-group denial.
- Native editor fixture verifies syntax editing, nonmodal behavior, resizing, and existing origin/profile/contents restrictions.
- Light/dark captures check standard/narrow sidebar bounds and single-line tab/group labels.

```sh
npm run build
./node_modules/.bin/electron .erb/scripts/browser-ui-smoke.cjs --developer-sidebar-only
./node_modules/.bin/electron .erb/scripts/site-developer-window-smoke.cjs
```
