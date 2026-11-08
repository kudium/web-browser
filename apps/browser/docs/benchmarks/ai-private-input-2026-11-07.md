# Temporary secure-input document and authorization lifetime

Date: November 7, 2026. Scope: actual Electron 45.0.0 on macOS arm64, disposable vault and synthetic HTTPS website.

## Problem and implementation

The secure-input request and later temporary fill compared URL/profile values but did not retain the original document or authorization revision. A same-URL page/host reload or permission change followed by restoration could reuse private values in a different context. OS screen lock did not invalidate temporary values. A same-URL replacement during an explicitly saved request could also persist and fill information collected under the prior document.

Requests now use the existing document/owner/group/access binding from field inspection through collection and later reuse. A private-input lease watches the host and website main-document navigation, destruction, renderer crash and Personal Data revocation. Navigation or OS revocation aborts a pending secure form and removes any stored temporary entry. Temporary fill rechecks its original binding before consuming the values. Permission/scope changes, chat changes, Stop, expiration and service disposal all remove entries through one cleanup path. Cleanup releases timers, auth subscriptions and retained document listeners.

A request has a 15-minute maximum lifetime starting when field validation/collection begins, including time spent in the secure form. Temporary values cannot outlive that request. The existing one-second task timer already pruned expired entries on the baseline; independent lease timers add cleanup that survives a stopped task scheduler and support modal cancellation. This is not a claim that baseline expiration was absent.

The secure form now explains that it gives AI a reference, that filling sends values to website scripts, and that page/authorization changes close the request. Removal drops application references; JavaScript strings are not guaranteed to be zeroized in process memory.

## Actual native before/after evidence

The fixture opens the actual sandboxed requestAIInput window and replies through its real contextBridge/IPC form API using synthetic values. It invokes actual registerAI via the official local MCP client. The website input handler immediately fetches /receive; the custom HTTPS protocol handler reads the actual Chromium Request body. No external accounts, providers or TLS socket server are used.

| Scenario | Before private Request bodies | After private Request bodies |
| --- | ---: | ---: |
| Website same-URL reload during collection | 1 | 0 |
| Trusted host reload during collection | 1 | 0 |
| Profile reassigned during collection | 1 | 0 |
| Website same-URL reload before reuse | 1 | 0 |
| Trusted host reload before reuse | 1 | 0 |
| Permissions changed and restored before reuse | 1 | 0 |
| OS screen-lock event before reuse | 1 | 0 |
| Website reload during explicitly saved collection | 1 | 0 |
| Normal temporary collection/fill | 1 | 1 |
| Normal explicitly saved collection/fill | 1 | 1 |
| Cancel secure form | 0 | 0 |
| Stop before reuse | 0 | 0 |

All eight stale cases now return errors. During website/host reload collection cases, the secure window closes before the fixture can send its answer. The stale explicitly saved request also goes from one newly saved scoped record to zero. Normal explicit saving still creates a scoped record with the synthetic value and fills it successfully. Tool results contain no private sentinel in either phase. Cancel/Stop already blocked on the baseline and remain regression evidence.

`ai-private-input.json` retains raw results and exact source/probe/dependency hashes. Baseline is the exact pre-change AI source in `baselines/private-input/ai.ts.txt`; other dependencies are current and hashed. Unit tests verify expiration, document/render lifetime, authentication revocation, owner checks, consumption and listener/timer cleanup. The after native fixture is included in the desktop runner.

```sh
node node_modules/electron/cli.js .erb/scripts/ai-private-input-smoke.cjs before
node node_modules/electron/cli.js .erb/scripts/ai-private-input-smoke.cjs after
npm test -- --runInBand
npm run lint
npm run build
node node_modules/electron/cli.js .erb/scripts/personal-data-ai-smoke.cjs
node node_modules/electron/cli.js .erb/scripts/ai-private-fill-smoke.cjs after
```

All 136 suites / 688 tests, lint/types, final production build, existing native saved-data workflows and current unsigned/ad-hoc arm64 packaged-security checks pass. Check exits, source identities and log hashes are recorded in `ai-private-input-verification.json`. No whole-app latency, CPU or memory improvement is claimed.

## Limits and remaining gates

Authorized website scripts receive filled data and may transmit/display it elsewhere. This does not enforce network destination containment or prove provider prompt-injection resistance. The native fixture synthesizes the OS lock-screen event; it does not verify an actual locked macOS session, Keychain or physical authentication UI. Timer/renderer-crash cleanup is unit evidence; native tests cover normal filling and the eight listed collection/reuse changes. DOM mutation without document replacement and every renderer/network scheduling race are not proven safe.

Local package verification scope is recorded separately; test-only observer UI evidence is not signed untouched-release verification. Full IPC/file-protocol/native-resource review, private-context downstream policy, existing native input/focus failures, signed installation/update/cookie migration and other platforms remain open.
