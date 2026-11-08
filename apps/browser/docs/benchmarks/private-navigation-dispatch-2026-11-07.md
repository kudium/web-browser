# Private navigation authorization at dispatch — November 7, 2026

Private navigation now retains authorization from before initial review through
native tab creation and network dispatch. The lease watches vault changes as well
as the authentication revision: revoking a saved record's consent and restoring
it invalidates the original approval. Native host navigation/replacement,
controller/access/scope changes, locked/removed targets and changed native
WebContents/profile ownership also invalidate the lease. Original source document
ownership remains bound while a new tab is created.

The shared request dispatcher performs synchronous authority checks immediately
before its final native allow callback, including the first approved URL and
asynchronous redirect approvals. There is no await between these checks and the
callback. Navigation cleanup releases the vault/host watchers and pending rule;
failed creation or review also releases the lease. Public Full-access navigation
keeps its automatic behavior. The lease begins before initial review so a later
snapshot cannot revive an approval after revocation.

## Native before/after evidence

`private-navigation-dispatch.json` records actual Electron 45 WebContents,
registerAI/encrypted vault, official MCP SDK and loopback HTTP request counts on
macOS arm64. Consent changes, reviews and the createTab callback are controlled;
the callback creates real disposable BrowserWindows and retains about:blank until
initial loading finishes. The fixture disables BackForwardCache and uses no-store
responses to exercise real history requests. Synthetic data only.

The baseline substitutes retained pre-dispatch-guard `ai.ts`, `aiNavigation.ts`
and `requestRules.ts`; remaining modules use current source. It includes the
previous redirect policy, so history/new-tab review invariants already hold in
both phases. The new improvement is stale initial authorization enforcement.

| Case | Before | After |
| --- | --- | --- |
| Consent revoked/restored after loadURL, before the initial request | 1 destination request; success | 0 requests; tool rejects |
| Consent revoked/restored during native new-tab creation | 1 destination request; success | 0 requests; rejects; tab remains blank |
| Native host navigated and restored during new-tab creation | 1 destination request; success | 0 requests; rejects; tab remains blank |
| Private new-tab redirect declined | 0 requests; one redirect review | Same |
| Private new-tab redirect accepted | 1 request; one redirect review | Same |
| Private Back, Forward and Reload redirects declined | Each 0 requests; one redirect review | Same |
| Public Full-access redirect | 1 request; zero reviews | Same |
| Disabled script/image preferences | 0 resource requests | Same |

Unit tests additionally verify initial synchronous checks, revocation after
asynchronous rule completion, a change during local review cleanup before the
native callback, and lease disposal. All 142 suites /726 tests pass on final
source. Lint/types and production build pass. The verification JSON binds the raw
report, probe, source, inventory and command logs with SHA-256 hashes. No whole-app
speedup is claimed.

## Scope and remaining production gates

This supersedes the missing private new-tab/history socket fixtures noted in
`private-navigation-2026-11-07.md`, for the controlled native createTab callback
and exercised history requests. The full browser renderer/extension creation
handshake remains outside this fixture. Chromium dispatch is an irreversible
boundary: revocation after its allow callback cannot retract a sent request.

The policy still covers owned main-frame navigation only. Descendants, fetch,
workers, unowned requests, extension/native messaging paths, existing WebSocket/
WebRTC channels, hooks and retained values after Stop/navigation need separate
containment. Initial approved payload provenance, general private attachments/
user input/website facts, native Enter delivery, marker power-loss durability and
signed/cross-platform release checks remain open. Production readiness is unproven.

Probe: `.erb/scripts/private-navigation-dispatch-smoke.cjs`.
Raw: `private-navigation-dispatch.json`.
Verification: `private-navigation-dispatch-verification.json`.
Inventory: `../security/ipc-inventory-2026-11-07-private-navigation-dispatch.json`.
