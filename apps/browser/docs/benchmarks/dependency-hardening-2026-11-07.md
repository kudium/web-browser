# Dependency boundary hardening — November 7, 2026

This batch builds on the owned extension-install work. It does not establish release readiness.

Native messaging now binds connections to the initiating extension frame or worker, rejects website impersonation and connection-ID collisions, checks loaded extension permissions before process dispatch and messages, and revokes on navigation, renderer loss, worker stop or extension unload. Cancellation settles pending launch requests immediately; late preparation cannot spawn. One-shot replies and failures close the process, listeners and connection map. Launch/reply waits have a 30-second deadline; connection count is capped at 128 per runtime.

Extension installs and updates now require CRX3 publisher signatures over the signed header and complete ZIP payload. RSA and ECDSA proofs must match the declared extension identity. Downloads use HTTPS with three redirects at most, only `clients2.google.com`/`clients2.googleusercontent.com`, a 60-second deadline and a 64 MiB stream limit. ZIP extraction rejects traversal, links, duplicate names, unsupported/encrypted entries and unsafe Windows names. Limits are 10,000 entries, depth 16, 16 MiB per file, 256 MiB total and a 1 MiB manifest. Actual inflation is bounded independently of archive size declarations. Failed extraction removes its partial directory.

Both fixes are reproducible postinstall/prebuild patches of the reviewed installed dependency versions, for CommonJS and ESM in both dependency trees. A changed dependency layout requires review rather than silently omitting the patch. Tests are registered in `npm test`.

Verification on local macOS arm64:

- 143 Jest suites / 735 tests passed; full lint/types and production build passed. After the final cancellation/bundle adjustments, focused CommonJS/ESM regressions and scoped lint passed.
- Native authority: 11 controlled process/IPC cases per bundle, 22 total. These execute the installed classes with process fixtures; they do not prove physical OS host behavior.
- Extension transport: 10 parser/download/extraction cases per bundle, 20 total. Includes tampered signatures, malicious signed paths, false inflation sizes, redirect escape, streaming limits and failed-directory cleanup.
- One real Google store download of uBlock Origin Lite (`ddkjiahejlhfcafbddmgiahcphecmpfh`, version `2026.1103.1743`, MV3) verified its publisher signature and extracted successfully. Temporary downloaded and extracted data was removed.
- Existing native framing regression continues to pass.

The new `.github/workflows/desktop-validation.yml` prepares test/lint/build jobs for macOS, Windows and Linux with bounded job duration and cancellation of superseded runs. It has not executed on hosted runners and produces source-build artifacts, not signed installers. The user confirmed runners/signing credentials are not configured.

Remaining limits: remote store UI/preload compatibility, cached-package authenticity and publisher/store provenance policy, extension-update permission escalation, durable catalog/rollback and native acknowledgment interruption, other privileged dependency transports and OS native host integration remain unverified. This batch does not fix all-channel private-data containment, Windows marker directory durability, signed/update/install recovery, or the recorded native screenshot/resize failure.

Reproduce:

```sh
node .erb/scripts/patch-native-messaging.cjs
node .erb/scripts/native-authority-regression.cjs
node .erb/scripts/native-authority-regression.cjs --esm
node .erb/scripts/extension-transport-regression.cjs
node .erb/scripts/extension-transport-regression.cjs --esm
node .erb/scripts/extension-transport-regression.cjs --remote
```
