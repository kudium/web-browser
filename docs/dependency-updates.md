# Dependency refresh — November 14, 2026

Browser and web manifests and lockfiles were refreshed to the latest compatible
releases. This includes Electron 45.3.2, React 19.3.1, Jest 30.5.2, PDF.js 6.5.438,
resizable panels 4.23.0, Better Auth 1.7.25, and postgres 4.1.1.

## Compatibility constraints

The browser retains three older major lines with explicit peer constraints:

- TypeScript 6.0.3: ts-jest 29.4.15 requires TypeScript below 7; the current
  typescript-eslint parser also requires a version below 6.1.
- ESLint 9.39.5: eslint-plugin-react 7.37.5 does not declare ESLint 10 support.
- Babel's CommonJS transform 7.29.14: the Jest transform chain uses Babel 7.

ESLint now uses `apps/browser/eslint.config.cjs`; obsolete ERB/Airbnb presets and
legacy configuration files were removed. The flat configuration keeps the project's
explicit rule overrides and enables React, accessibility, promise, and hook rules.
Lint reports 208 errors and 268 warnings; these have not been suppressed.

## Application migrations

React refs now declare initial values and nullable DOM targets. PDF rendering uses
the current canvas argument and loading-task cleanup API. Developer pane sizing
uses the new Group/Separator API, percentage units, and saved-layout hook.

The packaged app overrides adm-zip to 0.6.1, matching the browser's override.
Production npm audits for both the browser and packaged runtime report zero
advisories. Development dependencies still report upstream glob/deepmerge advisories;
the existing deepmerge installation patch remains enabled.

## Validation

- Browser TypeScript check and production webpack build passed.
- Browser: 311 Jest suites, 1,901 tests passed.
- Web: TypeScript check passed; 58 tests passed and 25 database-dependent tests skipped.
- MCP: two tests passed; the Bun demo test and build passed.
- Native Electron password-manager smoke passed using a disposable profile.

This source refresh does not publish installers or create a version tag. Website deployment is managed separately through Coolify.
