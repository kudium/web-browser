# Extension messaging acceptance

Run from `apps/browser` after `node .erb/scripts/patch-native-messaging.cjs`:

```sh
node .erb/scripts/extension-webextension-alias-regression.cjs
node .erb/scripts/native-messaging-regression.cjs
node .erb/scripts/native-authority-regression.cjs
node .erb/scripts/native-authority-regression.cjs --esm
./node_modules/.bin/electron .erb/scripts/extension-runtime-smoke.cjs
./node_modules/.bin/electron .erb/scripts/extension-native-host-smoke.cjs
```

`extension-native-host.json` records real child-process acceptance: missing host,
forbidden origin, missing executable, OS spawn refusal, clean/nonzero/signal exit,
invalid JSON/length, UTF-8 and split responses, final response before exit, frame
and module-worker requests, and permission refusal. Failed ports dispatch once,
pass the port, expose a scoped `runtime.lastError`, and reject subsequent writes.
Explicit disconnect does not emit a local event. Authority fixtures additionally
verify launch timeout and cancellation for both dependency bundles.

`extension-runtime-messaging.json` compares a session without any
ElectronChromeExtensions adapter with a separate session using Kudium's adapter.
Both reject worker startup self-messages and native callback requests with no
receiver. Both expose native callback `runtime.lastError` only during the callback.
The compatibility layer previously copied the runtime object and lost Chromium's
dynamic error property. A forwarding getter now preserves its native lifetime;
adapter-generated errors temporarily override the getter and restore it afterward.

## Bitwarden limitation

Bitwarden 2026.10.2 still reports “Could not establish connection. Receiving end
does not exist.” Its worker and onboarding popup load. A temporary, disposable
copy of its background bundle was instrumented to trace rejected requests without
logging payloads; the traced command was `getUserPremiumStatus` in the field
qualification constructor, invoked while constructing the background application.
The installed package was left unchanged. The native/adapter fixture reproduces
the relevant sender-exclusion behavior, not full Bitwarden operation in Chrome.

No successful premium response is fabricated and no missing-receiver error is
suppressed. The Bitwarden check remains incomplete pending an extension-level
resolution and real vault/unlock/autofill/OTP acceptance. Desktop vendor pairing
also remains unverified. These tests use disposable profiles and hosts; they do
not establish OS passkey, iCloud, or signed installer acceptance.
