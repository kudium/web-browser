# MCP and personal-agent configuration ownership

Date: November 7, 2026. Electron 45, local macOS arm64.

## Changes

Configuration requests now retain their originating native document and service
lifetime across controller readiness, native pickers, reviews and restart awaits.
A human-control revision also prevents a delayed update from undoing a later
takeover. Mutating MCP and personal-agent setup share a lock, so token rotation
cannot invalidate the connection being written during agent review. Main-frame
and trusted-settings checks remain enforced, including settings after host close.

The real MCP controller checks the caller before restarting, after stopping and
after listening. Requests receive HTTP 503 while a configuration update is
pending, even if the socket has bound. A revoked restart closes the listener,
persists disabled state and rotates/removes its credentials. Cancellation before
restart leaves the prior controller untouched. Failure after restart leaves
existing external control stopped; the user must explicitly enable it again.
Disabling-state persistence still depends on a successful filesystem write.

Agent file updates check retained authorization after review and before mutation.
Newly created credentials and a server enabled by an unsuccessful connect are
revoked/stopped. The human-control pause is lifted only after a successful connect
or a running MCP enable operation. Update patches are copied before awaits, and
`rotate` is checked as a boolean at runtime.

## Actual before/after evidence

| Scenario | Before | After |
| --- | --- | --- |
| MCP update waits for readiness across native reload | Enables control | Rejects; stopped |
| Agent connect waits for readiness across settings reload | Enables control and changes config | Rejects; config unchanged |
| Host reload while actual listen completion is held | Completes enabled | Rejects; persisted disabled |
| Settings reload while actual listen completion is held | Completes enabled | Rejects; persisted disabled |
| Human takeover while actual listen completion is held | Completes enabled and clears pause | Rejects; disabled and stays paused |
| Agent picker crosses native settings reload | Writes registry | Rejects; no registry |
| Agent picker outlives service disposal | Writes registry | Rejects; no registry |
| Agent replace review crosses host reload | Writes agent config/registry | Rejects; config unchanged, no registry/backup, new connection revoked |
| Agent remove review crosses settings reload | Removes connection | Rejects; config unchanged, no registry/backup |
| Token rotation competes with agent review | Accepted; writes an already-revoked agent credential | Rotation rejected; saved agent credential matches live controller |

The three held-listener cases also send real SDK initialize, list-tools and
`list_tabs` traffic over loopback before revocation. All three execute successfully
before the fix; all three fail during the update afterward. This demonstrates
client-work isolation during restart, not private-data containment or an external
agent attack. Native same-URL reload preserves the tested frame object.

Normal enable, connect, disconnect and trusted settings after host close pass in
both versions. Unit regression uses real temporary files to verify revoked review
creates no backup, registry or changed config. Raw observations and identities are
in `mcp-ownership.json`; observed checks/log hashes are in
`mcp-ownership-verification.json`. Exact pre-change sources are retained in
`baselines/mcp-ownership/`. The native after probe is in the desktop runner.

```sh
node node_modules/electron/cli.js .erb/scripts/mcp-ownership-smoke.cjs before
node node_modules/electron/cli.js .erb/scripts/mcp-ownership-smoke.cjs after
npm test -- --runInBand
npm run lint
npm run build
```

## Limits

The fixture uses actual AI/controller/config handlers, real loopback SDK traffic,
isolated file writes and native documents. Test-only exports expose the controller
and schedule its existing `beforeStart`; listen completion and dialog responses
are controlled. The takeover case invokes the actual IPC handler, not a physical
mouse event. It does not verify production preload serialization, actual external
agent integration, filesystem path races/resource limits, private-data tool
traffic, physical authentication, signed packaging or whole-app performance.

This supersedes the tested MCP/personal-agent asynchronous ownership findings.
Full per-subaction/dependency IPC, downstream private-data destination enforcement,
group deletion coordination, capture/decoder bounds and signed/cross-platform
release remain open.
