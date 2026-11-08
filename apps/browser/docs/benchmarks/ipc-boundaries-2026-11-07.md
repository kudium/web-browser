# IPC document lifetime and runtime channel bounds

Date: November 7, 2026. Scope: Electron 45.0.0, local macOS arm64.

## Problem and implementation

Group lock requests checked trust initially, then waited for capability/authentication. Frame object equality could survive same-URL reload, allowing stale requests to protect, unlock or unprotect groups. Preference dialogs rechecked ownership but did not retain document replacement history before resetting preferences, changing the download directory or clearing session data/cache.

`watchIPCRequest` captures the native frame and URL, watches navigation/destruction/renderer exit, and rechecks live trust. Group requests bind before capability awaits and after native authentication; the service also rejects a revoked caller before immediate protect/lock mutations. Preference action requests bind native directory/reset/clear dialogs and dispose listeners on every return/failure. Profile identity checks remain enforced.

The trusted app preload's three generic IPC methods now enforce the existing declared channel set at runtime. Named app capabilities continue to use their explicit channels.

## Actual native before/after

| Scenario | Before | After |
| --- | --- | --- |
| Same-frame reload while group capability is pending | Group protected | No protection |
| Same-URL reload during group unlock authentication | Group unlocked | Locked; request rejected |
| Same-URL reload during unprotect authentication | Protection removed | Protection retained; rejected |
| Same-URL reload during preference reset | Preferences reset | Unchanged; rejected |
| Same-URL reload during directory picker | Directory changed | Unchanged; rejected |
| Same-URL reload during clear-data dialog | Session clear dispatched | No clear; rejected |
| Same-URL reload during clear-cache dialog | Cache clear dispatched | No clear; rejected |
| Generic send to undeclared channel | Main receives 1 message | Rejected; 0 messages |
| Generic on/once undeclared subscriptions | Both receive event | Both rejected; 0 events |
| Normal group unlock and directory selection | Succeed | Succeed |
| Declared legacy channels | Usable | Usable |
| Foreign window group/preference access | Both blocked | Both blocked |

The fixture executes the production preload through contextBridge/IPC and uses actual Electron main-frame identities. It demonstrates the same frame object survives the tested file-document reload. Direct real-handler calls isolate effects from Electron rejecting an old renderer's invoke response. Native auth/capability/dialog completions are controlled; extension browser-action registration and preference extension enumeration are fixture stubs. Session clearing operates only on a disposable session. No real OS authentication or personal data is used.

Baseline sources are exact pre-change snapshots under `baselines/ipc-boundaries/`; current dependent sources and generator/probe identities are hashed. Raw result: `ipc-boundaries.json`; observed checks: `ipc-boundaries-verification.json`. The native after probe is included in the desktop runner. Unit tests cover source/trust/frame checks, same-document replacement, destruction/crash cleanup and revoked service mutations.

```sh
node .erb/scripts/ipc-inventory.cjs
node node_modules/electron/cli.js .erb/scripts/ipc-boundary-smoke.cjs before
node node_modules/electron/cli.js .erb/scripts/ipc-boundary-smoke.cjs after
npm test -- --runInBand
npm run lint
npm run build
```

The current unsigned/ad-hoc macOS arm64 package passed the packaged security runner: fuse/debugging checks and the instrumented production-payload UI/preload/isolation/history/CSP/cleanup observer. The runner exit was 0; its log hash and the package ASAR hash are recorded in the verification JSON. This does not verify an untouched signed release.

## Scope and remaining gates

Seven stale effects and three generic channel methods are restricted. Foreign-window denial was already present and is regression evidence. The generic channel test demonstrates a runtime surface reduction, not an actual UI-injection exploit. No whole-app speed/CPU/memory gain is claimed.

See `../security/ipc-inventory-review-2026-11-07.md` for all app-owned registrations, generated/dependency surfaces and unfinished branch-level reviews. Group removal, composer Save, MCP/personal-agent mutations, capture requester lifecycle, decoder/resource bounds and dependency IPC remain open. Physical OS authentication, native input/focus, downstream private-data traffic and signed/cross-platform release also remain gates. Package observer checks, when recorded, are instrumented production-payload evidence rather than untouched signed-release verification.
