# Public-site acceptance

November 14, 2026, macOS arm64, Electron 45 / Chromium 156. The matching JSON
records the latest run, per-check results, runtime and source hashes. This is
production renderer/backend execution in disposable profiles, not packaged release
or native passkey acceptance.

Latest unlocked native-view replay: nine of ten checks passed. Main-frame controls
use Chromium mouse events, and Stripe's focused cross-origin fields accept every
dummy shipping/test-card value through `Input.insertText`. Main-WebContents
character injection was the cause of the earlier hosted-field input failure.
The enabled Pay control was activated, but no successful-payment confirmation
arrived. A separate actual native Pay click also left the checkout unchanged.
Payment confirmation remains incomplete; the JSON includes resulting page text
and submit-control diagnostics. The runner correctly exited 1.

Run from `apps/browser`:

```sh
npm run test:real-sites
```

The runner exits 1 if any check is incomplete. Optional `--inspect` retains the
disposable app and exposes local CDP port 9222; close that fixture after inspection.
Use `npm run test:real-sites -- --native-clicks` with the Mac unlocked for Chromium
mouse-event replay in native page views. Private sign-in and automated checkout
submission still use controlled activation. Default actions use controlled page
activation and focused input; they do not establish OS chooser or OS-input acceptance.
`--checkout-only` limits the run to Stripe and writes a separate
`stripe-checkout-acceptance.json`, preserving the general suite's report.

The suite uses SauceDemo's directly published demo credentials to check actual
login, reload, shared and separate regular sessions, private login, cookie cleanup
and regular-session preservation. It uploads only a generated text file to the
public multipart test endpoint, decodes MDN's public video and checks actual
WebRTC negotiation, received audio/video, RTP bytes and decoded frames on the
public two-peer sample. Camera/microphone sources are fake; permission routing
uses the production backend.

Google and Microsoft coverage stops at sign-in entry documents. Zoom coverage
stops at the test entry page. No personal account, authenticated provider OAuth,
external meeting app or provider meeting is exercised.

Stripe coverage distinguishes hosted test-form loading from payment confirmation.
Fixture input is allowed only in hosted frames carrying explicit `pk_test_` and
`cs_test_` keys; submission additionally requires `__isDemoMode=true`. Dummy shipping
details and Stripe's published 4242 test card are used. Real charges, wallet
authentication and 3DS are outside this test.

Earlier native-click runs were interrupted by a locked Mac. The black page regions
in `BrowserWindow.capturePage()` output also persisted after unlock: that capture
omits the native page layers. `capture-workspace-fixture.cjs` now composes the shell
and visible native page surfaces into explicitly labeled diagnostic images.
Composed login/checkout captures were reviewed, and the actual native Stripe window
was separately inspected through CUA. The real checkout page and its focused inputs
render correctly. Composed images are not OS screenshots or showcase assets.

Native extension connection handling has separate evidence in
`extension-native-host.json`: real host framing, frame/worker messages, permission
refusal, scoped callback/port errors and explicit-disconnect event semantics.
