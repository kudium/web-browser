# AI references and reusable files verification

Production composer and real AI IPC were exercised using a disposable Electron profile, a local website and a deterministic local provider. No live job applications or personal vault records were used.

- Chat-file upload preserves the exact original bytes. Selecting the file does not submit the application. A separate multipart submission reads the same bytes; committed navigation releases the temporary upload cache.
- Save to Personal Data preserves encrypted originals, cancellation and private-document AI settings. OS-backed saving retains the locked state and grants no secret-reading session.
- Follow-up tasks receive a bounded opaque file catalog without the document text being sent again.
- A referenced group supplies its exact saved-tab count; unfiltered tab listing defaults to that single group during the task. The fixture has three group tabs and one unrelated tab, and reports three.
- Group references in chat open their picker, focus the group and reopen after dismissal. Suggestions show groups before pages. Search narrows results and choosing Use tab narrows draft context.
- Production native tab/group menu actions open the sidebar and add context. Existing drag sources retain copy behavior and the attached tab is read on demand.
- Screenshots cover 480px and 240px sidebar widths, light/dark, long group labels, mention suggestions, Markdown preview, open group/tab pickers, focused/filtered search, reusable files, disabled saving and save errors. The full-browser fixture also captures the integration at 1160px and 800px window widths.

64 focused tests in twelve suites pass, covering vault encryption/permissions, private document persistence, original-file lifecycle, attachment budgets, context bounds/scope validation, Markdown references, recovery, tool schemas and composer behavior. TypeScript, targeted ESLint, the production build and diff checks pass.

Native Save/upload review responses were stubbed with approved and cancelled fixture responses. Actual OS dialog appearance and live commercial-model responses were not reviewed. The negative tests intentionally log rejected saves and expired IDs. Electron's synchronous safeStorage deprecation messages come from the existing encryption adapter.

Run:

```sh
node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .erb/scripts/ai-reference-files-smoke.cjs
TOUCHBOX_SMOKE_OUTPUT=docs/evidence/ai-reference-files/browser node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .erb/scripts/browser-ui-smoke.cjs --ai-context-only
```

See `results.json` and `browser/results.json` for the native checks. No system clipboard operations are part of these fixtures.
