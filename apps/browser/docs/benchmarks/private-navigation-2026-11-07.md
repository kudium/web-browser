# Private AI navigation destination review — November 7, 2026

Private AI navigation now holds each changed HTTP(S) main-frame destination in
Electron's native `onBeforeRequest` callback until local approval succeeds. The
initial exact approved URL is allowed once; fragments are excluded from network
identity. Changed paths/queries on the same origin also require review. Each
navigation allows at most 16 main-frame requests. Credentials in destinations
are rejected. Stop, source/host replacement, renderer exit, permission/consent
changes and review failure invalidate the pending callback before dispatch.

A shared request-rule dispatcher preserves advanced preferences instead of
replacing their one native Electron listener. Ordinary synchronous rules return
synchronously. Temporary rules target a specific WebContents; removing a rule
cancels its pending requests, while unrelated scoped rules can be removed without
canceling those requests. Review holds Chromium's original request rather than
replaying a canceled navigation, preserving redirect methods, bodies and cookies.
Native review displays URL, method and body-presence metadata, never the raw body.

The private floor is connected to navigate, native new-tab navigation and
back/forward/reload. Private tab creation refuses the older renderer fallback
because it cannot arm destination enforcement before loading. Read-only page
queries retain automatic behavior. Local review pauses the remaining navigation
and action budgets; website-dialog pauses compose with review pauses. The outer
protocol/review lifetime remains bounded at 120 seconds.

## Observed before and after

`private-navigation.json` records actual Electron 45, native WebContents, encrypted
vault, official MCP SDK and loopback HTTP socket observations on macOS arm64.
Review choices are controlled and all data is synthetic. Baseline substitutes
only retained pre-change navigation and preference modules; other modules use
current source. This isolates the added destination boundary from earlier saved
fact action-review improvements. Both phases use the same probe.

| Case | Before | After |
| --- | --- | --- |
| Denied same-origin redirect with changed path/query | 1 destination request; no redirect review | 0 requests; one review; tool rejects |
| Denied cross-origin redirect | 1 destination request; no redirect review | 0 requests; one review; tool rejects |
| Public Full-access redirect | 1 request; zero reviews | 1 request; zero reviews |
| Approved two-hop redirect | 1 final request | 1 final request; two destination reviews |
| Stop during held redirect | Not claimed | 0 destination requests; tool rejects |
| Consent changed then restored during review | Not claimed | 0 destination requests; tool rejects |
| Sibling tab sharing profile during held redirect | Not claimed | Sibling loads; held destination stays unsent until approval |
| Approved POST 307 redirect | Not claimed | POST body and cookie preserved; review metadata reports POST/body |
| Disabled script/image preferences | 0 resource requests | 0 resource requests |

The unit suite additionally covers callback cancellation and late acceptance,
request-rule errors, removal of unrelated scoped rules, 16-request limits, review
timeouts, and independent website/review pauses. All 142 suites /722 tests pass.
Lint/type and production-build results are recorded in the verification file.
This is a security boundary result; no overall application speedup is claimed.

## Limits and remaining production work

The policy exists only during an owned main-frame navigation. It does not contain
subframes, fetch/XHR, service workers, unowned requests, hooks, existing WebSocket/
WebRTC channels, or values retained in page/worker storage after navigation or
Stop. An approved initial endpoint still receives that request. The method/body
metadata does not establish immutable payload provenance. General private
attachments, user input and website-derived data need separate policies.

Native MCP navigate and direct native POST redirect paths are exercised here;
new-tab and history glue is type-checked and covered by existing lifecycle tests,
but dedicated private new-tab/history socket fixtures remain open. Native Enter
input delivery, marker power-loss durability, signed distribution and Windows/
Linux/x64 validation also remain open. Production readiness is not established.

Sources: `src/main/requestRules.ts`, `aiNavigation.ts`, `aiDialogs.ts`, `ai.ts`,
`advancedPreferences.ts`. Probe: `.erb/scripts/private-navigation-smoke.cjs`.
Raw evidence: `private-navigation.json`; verification:
`private-navigation-verification.json`. IPC inventory snapshot:
`../security/ipc-inventory-2026-11-07-private-navigation.json`.
