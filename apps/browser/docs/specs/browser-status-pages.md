# Browser status pages

Implemented November 4, 2026.

- [x] First-load placeholder with animated indicator and accessible status.
- [x] Keep existing website content visible during subsequent navigation while tab/progress indicators show loading.
- [x] Full-page unavailable, offline, DNS, timeout, certificate, stopped-load and renderer-crash messages.
- [x] Retry and history-back controls.
- [x] Collapsible error diagnostics; only the hostname appears by default.
- [x] Persistent failure state across title, media and loading updates.
- [x] Ignore subframe failures and cancelled navigation events.
- [x] Recovery restores the native website view.
- [x] Support individual split panes and responsive layouts.

Certificate failures retain Chromium security enforcement. There is no bypass button. HTTP responses such as a website’s own 404 or 500 pages remain website content.

Verification: 78 unit tests passed, TypeScript and focused lint passed, production build passed. Electron smoke checks confirmed persistent error state, native view hiding/recovery, desktop/narrow layout, and loading indicators clearing after slow navigation.

Commands:
`npx electron .erb/scripts/browser-ui-smoke.cjs --page-status-only`
`npx electron .erb/scripts/browser-ui-smoke.cjs --loading-only`

## TouchBox connection sequence

- [x] Replace the first-load spinner screen with a dark terminal card, animated matrix streams, blinking prompt, and staggered DNS/network/TLS/HTTP/DOM stages.
- [x] Display only the destination host; avoid exposing URL paths, query strings, or credentials.
- [x] Label stages as simulated visual steps; no extra requests or fabricated diagnostic results.
- [x] Omit the TLS stage for HTTP destinations.
- [x] Hand off to the actual website immediately when loading finishes; do not add artificial delays.
- [x] Keep ordinary navigation feedback lightweight and preserve error recovery pages.
- [x] Respect reduced-motion preferences and fit narrow browser panes.
- [x] Verify first-load animation and page handoff with a slow local website, desktop/narrow screenshots, and status-page tests.

### Loading animation performance check — November 4, 2026

Electron desktop A/B check: local HTTP page with a fixed 700ms response delay. Ten alternating runs; discard the first pair as warmup, leaving four runs per mode. Disabled mode keeps the static terminal but disables its animations and removes the matrix streams.

| Mean | Animated | Static |
| --- | ---: | ---: |
| Navigation to did-finish-load | 729ms | 729ms |
| Navigation to loading overlay removed | 741ms | 742ms |
| Host UI renderer TaskDuration delta | 113ms | 92ms |
| Host UI renderer LayoutDuration delta | 2ms | 1ms |

No measurable navigation delay in this check. The animation adds some renderer work (~21ms in this fixture); these metrics do not measure GPU load and are not a guarantee for older devices or all websites. The sequence performs no extra requests and has no minimum duration. First-load webview visibility currently follows did-finish-load, an existing behavior independent of the animated design.

Repeat with `npx electron .erb/scripts/browser-ui-smoke.cjs --connection-performance-only` after building.

### Ready-page handoff

- [x] Dismiss initial loading UI on DOM readiness instead of waiting for did-finish-load; keep the lightweight tab loading indicator for remaining resources.
- [x] Electron check confirms a page is visible while a 2.5-second image request is still loading.
- [x] Increase the default inactive-tab retention to 60 minutes. Explicit saved timeout preferences remain respected.

## Shared terminal status surfaces

- [x] Extract TerminalStatus and TerminalDestination for reusable loading/error presentation.
- [x] Match unreachable, offline, timeout, certificate, and crash pages to the terminal style with a FAILED accent.
- [x] Preserve retry/back controls and collapsed actual error diagnostics.
- [x] Keep persistent error backdrops static, with reduced-motion support and responsive sizing.
- [x] Verify recovery, desktop/narrow layouts, status tests, and DOM-ready loading handoff after extraction.
