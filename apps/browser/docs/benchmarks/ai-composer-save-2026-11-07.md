# Attachment Save ownership through encrypted persistence

Date: November 7, 2026. Local Electron 45, macOS arm64.

Save previously rechecked current window trust and whether any tab still shared
the chosen scope. A chat switch, same-URL reload, attachment removal after
extraction, or late OS-auth capability result could carry an old approval into
encrypted storage.

Save now binds the original chat, composer/access revisions, main document,
attachment membership, destination tab/group/scope and Personal Data revocation
epoch. It checks after the dialog and extraction, then passes the same guard into
`savePersonalDocument`, which checks after asynchronous capability discovery
before creating a credential or saving a record. Invalid responses reject; the
user's private/AI-access choice and original bytes remain preserved. Listener
cleanup runs in `finally`; renderer exit also revokes composer requests. Live
attachment checks use a map lookup without copying file bytes.

| Actual handler scenario | Before: encrypted records created | After |
| --- | ---: | ---: |
| Switch chats and switch back during dialog | 1 | 0 |
| Same-URL native document reload during dialog | 1 | 0 |
| Switch chat after document extraction | 1 | 0 |
| Remove attachment after document extraction | 1 | 0 |
| Switch chat during OS-auth capability discovery | 1 | 0 |
| Revoke Personal Data during capability discovery | 1 | 0 |
| Replace original destination tab with same-scope tab | 1 | 0 |
| Change group scope and restore it during dialog | 1 | 0 |
| Dispose AI service after extraction | 1 | 0 |

All nine after requests reject, creating zero encrypted records and zero OS
credential-adapter writes. Normal private browser-wide and AI-enabled group saves
each create one record with exact synthetic original bytes and selected `allowAI`;
cancellation creates zero. The encrypted vault file does not contain the synthetic
document fact as plaintext.

Raw observations: `ai-composer-save.json`; source/fixture/log identities and check
results: `ai-composer-save-verification.json`. Exact prior sources are retained
under `baselines/composer-save/`. The native after fixture is in the desktop runner.

```sh
node node_modules/electron/cli.js .erb/scripts/ai-composer-save-smoke.cjs before
node node_modules/electron/cli.js .erb/scripts/ai-composer-save-smoke.cjs after
npm test -- --runInBand
npm run lint
npm run build
```

The fixture uses actual AI and persistence handlers, native main-frame identities
and real encrypted `PasswordVault` writes in isolated temporary files. Test-only
module exports replace the vault between cases. Native dialog results, extraction
completion, capability results and OS credential functions are explicit fixture
controls. OS lock is a native event emission, not a physical-session test. This
does not verify preload serialization, real Keychain behavior, provider/site
traffic, signed packaging, full desktop tests or whole-app performance.

This closes the tested composer Save lifetime cases. Group removal and partial
deletion, MCP/personal-agent mutations, capture/decoder/dependency IPC, downstream
private-data containment and signed/cross-platform release remain open.
