# Saved-data fill and document upload approval lifetime

Date: November 7, 2026. Scope: actual Electron 45.0.0, macOS arm64, disposable encrypted vault and synthetic HTTPS website.

## Problem and implementation

Saved-data filling previously compared only the current URL and WebContents after its native review. A same-URL replacement, host reload, profile reassignment or consent changed and restored could pass. Record edits during review could change the values eventually entered. Saved document attachment likewise reread consent after its first review, but did not retain consent/owner checks through the second file-upload review or a pending website dialog.

Both operations now use the existing document/owner/group/access binding plus an authentication epoch and a vault-change subscription. A vault write revokes the operation even if the saved value or consent is restored. Checks run after native review/authentication and immediately before fill or native file selection. Document upload passes its private binding through the nested upload tool, including the native chooser dispatch. Document and vault subscriptions remain active until a pending native action completes. Cancel/Stop clean up; a failed original-file upload removes its temporary artifact.

The filling review now states that saved values enter the website and its scripts may send them immediately. This corrects the implication that local filling keeps values away from website scripts. Reviews retain their existing selected-record scope; this change does not introduce provider disclosure of passwords.

## Native before/after evidence

The fixture uses the official local MCP client against actual registerAI handlers. Input/change handlers immediately fetch a synthetic /receive endpoint. Electron's custom HTTPS protocol handler reads the actual Chromium Request body. No TLS server or external network destination is used. Native message-box responses are controlled to reproduce races; actual DOM filling, native file selection and pending website confirm handling execute.

| Scenario | Before private request bodies | After private request bodies |
| --- | ---: | ---: |
| Fill: same URL document replaced during review | 1 | 0 |
| Fill: consent changed and restored | 1 | 0 |
| Fill: record values changed | 1 | 0 |
| Fill: profile reassigned | 1 | 0 |
| Fill: trusted host document replaced | 1 | 0 |
| Document: consent changed and restored | 1 | 0 |
| Document: trusted host document replaced | 1 | 0 |
| Document: consent revoked while website confirm is pending | 1 | 0 |
| Document: consent revoked during second upload review | 1 | 0 |
| Normal approved fill | 1 | 1 |
| Normal approved document input upload | 1 | 1 |
| Normal approved pending native chooser upload | 1 | 1 |
| Declined fill | 0 | 0 |
| Stop during fill review | 0 | 0 |

All nine newly restricted cases return errors after the fix. All three ordinary approved paths remain successful. Tool results contain no synthetic private value in either phase. Stop and Cancel already blocked on the baseline; they are regression evidence, not new fixes.

Raw report: `ai-private-fill.json`. Baseline: exact pre-change AI source under `baselines/private-fill/ai.ts.txt`; other dependencies are current and hashed. `ai-private-fill-verification.json` records source, probe, logs and observed check exits. Unit tests separately exercise revocation and retained subscription lifetime.

```sh
node node_modules/electron/cli.js .erb/scripts/ai-private-fill-smoke.cjs before
node node_modules/electron/cli.js .erb/scripts/ai-private-fill-smoke.cjs after
npm test -- --runInBand
npm run lint
npm run build
node node_modules/electron/cli.js .erb/scripts/personal-data-ai-smoke.cjs
node node_modules/electron/cli.js .erb/scripts/ai-data-disclosure-smoke.cjs
```

All 135 suites / 680 tests, lint/types, production build, existing native private-data/disclosure checks and the current unsigned/ad-hoc arm64 packaged-security runner pass. The after fixture is included in the desktop runner. No whole-app speed, CPU or memory claim is made; this is a security improvement with actual request-body evidence.

## Limits and remaining scope

Authorized websites receive the approved data and may transmit it elsewhere through arbitrary scripts. This is not a network destination allowlist or proof of prompt-injection containment after provider disclosure. Temporary secure-input requests and their subsequent reuse still use URL/profile checks; their document lifetime needs separate review. The shared binding tests navigation/ownership changes during approval and at dispatch; it does not prove every renderer/network scheduling race impossible.

The fixture uses a local MCP recipient and controlled reviews. It does not test an adversarial model provider, all user form patterns, OS authentication UI/Keychain, signed installation, other platforms, or full desktop focus/input behavior. Package runner scope and observed results are in the verification JSON; test-only observer UI evidence does not establish untouched signed-release correctness. Full IPC inventory, file-protocol/native-resource privileges, private-context downstream policy, native input/focus and signed release gates remain open.
