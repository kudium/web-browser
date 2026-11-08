Production Electron review for guided AI input and named hooks.

Run: `node_modules/.bin/electron .erb/scripts/ai-input-hooks-smoke.cjs`.

Uses a disposable profile and the production SiteDeveloperPanel, CodeEditor and private-input window. Hook editor screenshots: 360/820px, light/dark. Feedback and private form screenshots: 360/600px, light/dark. Checked suggestion selection, password masking, unchecked optional save, cancellation and abort cleanup. Reviewed narrow light and wide dark renders; corrected wrapping in hook field labels.

29 tests passed across private input, hook filters, hook notification permissions, Developer UI/library, tool schemas, Personal Data capture and external Personal Agent MCP suites. TypeScript and targeted lint passed.

No real AI provider request, website login submission or OS vault authentication was exercised here. Path filtering runs on document load; SPA route changes require script listeners. Private filling still requires a unique visible field mapping and does not submit forms.

Additional AI page/permission regression suites: 24 tests passed with `--testEnvironmentOptions='{"customExportConditions":["node","node-addons"]}'`. The default jsdom browser export condition fails to parse the existing `yaml/browser` dependency imported through Personal Agent connections; the server-side resolver avoids that harness issue. Total: 53 passing tests across these runs.

Hook layout refinement: replaced expanded Name/Pages rows with compact selection and anchored targeting/settings popovers. Captures include 360/820px light/dark closed/open controls, all-pages disclosure, exact/prefix selection menus and invalid path feedback. Selected pages default to the actual current page pathname. Reviewed new collapsed, expanded, menu and error screenshots. Four existing Developer tests plus the Electron interaction fixture, TypeScript and targeted lint pass. Native dragging and website runtime execution were not repeated for this layout-only refinement.
