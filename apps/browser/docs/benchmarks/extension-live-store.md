# Chrome Web Store and uBlock acceptance — November 14, 2026

Google's frontend sometimes still disables Add to Chrome and shows Switch to
Chrome on Electron 45 / Chromium 156 despite the store-only compatibility hint.
Do not treat Google's page controls as reliable. On a registered store detail tab,
the existing Extensions menu now offers **Install this extension…**. It invokes
the same document-bound installer as store IPC: remote package verification,
immutable permission review, target-profile ownership and queued rollback remain
in effect. Unregistered tabs, wrong owners and non-store/detail URLs cannot use it.
No separate install UI or bypassed consent path was added.

The live fixture passes with uBlock Origin Lite 2026.1110.1816 on macOS arm64.
The latest run uses the native menu for installation and the existing Group Access
menu to remove access from Account A while preserving Account B. The report records
`installVia` and `removeVia` so native-menu coverage is distinguishable from Google's
page-button coverage. Review answers are controlled and all profiles are disposable.

The actual worker now starts without errors. Chromium exposes distinct `browser`
and `chrome` objects; uBlock chooses `browser`, while the dependency originally
populated only `chrome`. The reproducible preload patch shares the implemented
compatibility namespaces with both objects. Classic and module worker fixtures
verify command metadata through real IPC, frame APIs, profile storage separation
and absence of extension APIs on normal websites. Promise-based calls now reject
transport/authorization failures. Callback callers receive scoped lastError that
is removed after the callback. Native-port disconnect error details remain open.

Actual filtering also passes. Six native rulesets are enabled. A controlled site
requests a tracker domain mapped to the local fixture server. The installed profile
redirects it to uBlock's `noop.txt`, and no tracker request reaches the server.
An unextended regular profile and a private session reach the same endpoint and
receive the expected body. The site uses a mapped fixture hostname because uBlock
exempts localhost initiators. This verifies real native filtering rather than a
simulated blocker. The result and source hashes are in `extension-live-store.json`.

`extension-native-host-smoke.cjs` separately launches an actual disposable native
host and checks frame/worker one-shot messages, persistent-port ordering, UTF-8 and
split responses, permission refusal, scoped callback errors and website containment. Its evidence is in
`extension-native-host.json`. It does not verify any vendor's desktop pairing.

The live Bitwarden fixture renders its onboarding popup and runs its worker, but
records an unhandled startup messaging error. Its strict acceptance remains failing;
vault sign-in, unlock, autofill, OTP, content scripts and desktop pairing are open.
The optional live fixtures do not replace actual account tests or signed installers.
