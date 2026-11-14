# Browser completion checklist

Updated November 14, 2026. This is the implementation backlog, not a claim of
release readiness. Checkmarks mean the stated scope has evidence; unfinished
native, production and platform acceptance stays unchecked.

## Existing essentials

- [x] Tabs, groups, spaces and independent/shared website login profiles.
- [x] History, downloads, printing, find-in-page and browser imports.
- [x] Website permissions, basic tracking protection and extension installation.
- [x] Local Personal Data, AI tools and workspace features.
- [ ] Complete fresh-install, update and crash-recovery acceptance for these flows.

## 1. System passkeys and Apple credentials — high priority

- [x] Chromium virtual WebAuthn registration/discoverable authentication in regular
      and private sessions; external signature, challenge, origin and RP-hash checks,
      tampered-data rejection, user verification, cancellation and iframe policy.
- [x] Account picker with document/ancestor navigation, closure and renderer-crash
      cancellation; keep it open for same-document changes and unrelated iframes.
- [x] Electron 45 browser API patch prepared and verified to apply cleanly.
- [x] Prepare full pinned Electron 45.0.0 source, depot_tools, arm64/x64 release GN
      configurations, local sync/build/verification commands and a stock-runtime
      rejection probe. Fix source version validation and platform availability;
      patch application/idempotence checked on a fresh pinned worktree.
- [ ] Sync Chromium dependencies, compile and package patched Electron for macOS
      arm64 and x64. Current preparation has roughly 11 GiB free; the local
      sync/build guard requires 100 GiB. See `../passkeys.md`.
- [ ] Obtain/verify Apple-approved browser entitlement and provisioning.
      Apple Developer portal checked November 14, 2026 via ego-browser: Kudium
      Browser's Web Browser Public Key Credential Requests request `XDL783F4J3`,
      submitted November 8, remains **Submitted** in its request history. Approval
      is not yet shown; no capability or request was changed during this check.
- [ ] Verify real passkey registration, existing credentials, provider choice,
      signatures, originating subdomains, iframe policy, cancellation and profiles.
- [ ] Integrate verified custom runtimes into local release tooling.
- [ ] Verify iCloud Passwords pairing, autofill, generated passwords and OTPs.
- [ ] Add security-key PIN support or explicitly document supported key types.

System passkeys stay with the credential provider and are shared across login
profiles. See `../passkeys.md`. Electron source builds are currently blocked by
insufficient local free disk space. User-authorized old-build cleanup on November 14
removed roughly 6 GiB of generated output and left approximately 14 GiB available;
this remains insufficient for the Chromium checkout and build. Latest verified
release artifacts and historical installers are retained. A prepared patch is not
a working runtime. See `../benchmarks/old-build-cleanup.json`.

## 2. Private browsing — first implementation milestone

- [x] File → New Private Window and keyboard shortcut.
- [x] Visible private identity, URL/search input and back/forward/reload controls.
- [x] Fresh in-memory sessions isolated from regular cookies and storage.
- [x] Popups remain in the same private session; synthetic opener flow verified.
- [x] Private page views stay outside normal history, restoration, sync and
      automatic Personal Data autofill.
- [x] No automatic regular-profile extensions, site hooks or external MCP access.
- [x] Private identity uses the existing address toolbar, clear of window controls.
- [x] Existing Chat/sidebar UI with isolated private AI sessions, provider defaults,
      memory-only conversations, drafts, checkpoints, permissions and task history.
- [x] Exclude private sessions from the global persistent download tracker.
- [x] Reuse the existing Downloads sidebar with session-only progress/history and
      pause, resume, cancel and metadata clearing. Regular/private lists, events,
      file access and recovery information are isolated; saved files survive closing.
- [x] Private downloads request a destination even when regular downloads save
      automatically; verify actual file transfer with controlled fixture selection.
- [x] Verify actual macOS Save-dialog selection/cancellation, file contents and
      saved-file preservation after private browsing closes.
- [x] Clear session storage/cache and stop pending downloads after the last related
      private window closes; do not clear while a popup remains open.
- [x] Verify isolation, final-window cleanup and private UI in real Electron.
- [x] Reuse camera/microphone/location website prompts with memory-only decisions;
      real Chromium requests, denial/repeat handling and final cleanup verified with
      controlled dialog responses and fake media devices.
- [x] Verify actual website location/media dialog interaction and remembered denials.
- [ ] Verify OS permission grants and actual camera/microphone/location providers.
- [x] Reuse the existing private tab management, navigation and find/zoom/context-menu implementations.
- [x] Verify private find-in-page and zoom through the production browser IPC.
- [x] Native private page/link context menu, standard Save/Print menu entries and real
      context-menu tab creation in the same private session.
- [x] Private beforeunload cancellation preserves the live page; confirmed tab
      unload destroys it and leaves temporary tab metadata (controlled dialog answers).
- [x] Public SauceDemo login in a fresh private session, exclusion from regular
      tabs, final-window cookie cleanup and preservation of regular authentication
      through production browser views with controlled page actions.
- [ ] Complete OAuth, WebAuthn, beforeunload and download acceptance on real sites.

Private mode reuses `BrowserWorkspace`, `Main`, the existing address bar/sidebar,
normal tab creation and popup adoption. Its workspace manager and browser
session are isolated; no separate private renderer or preload is used. Site
permission/mute decisions stay in memory, and private workspace/AI events do not cross into
regular windows. Private Chat uses the configured provider and session-only API
key when available; its conversation state never reads or writes normal chats.
Upload scratch files and explicitly enabled external connector configuration use
an isolated temporary directory removed on close. AI provider requests retain the
provider’s normal data handling; private mode controls local browser storage.

Current evidence: 77 focused tests across downloads, website permissions, site
settings, AI routing, memory-only stores, message queues, private lifecycle,
passkey wiring and browser attachment pass. TypeScript and the production build
pass. The existing `ai-smoke.cjs` now models deferred tool discovery and current
message queuing. All five modes pass: basic read/type/click/navigation, vision,
structured extraction, provider retry/recovery and human handoff/window recovery.
They verify stale-action refusal, takeover/queue pausing and untrusted IPC denial.

`private-browsing-smoke.cjs` uses the production renderer/backend with a local
provider and disposable encrypted-store fixture. It verifies private AI page
reads, existing Chat/sidebar UI, provider changes/session-only keys, concurrent
regular/private responses, request/history isolation, fresh empty private chats,
scratch cleanup, badge placement, private tabs and cookies, and OAuth-style
popup state/code messaging. It now also verifies real Chromium geolocation and
camera/microphone denial requests, repeat decisions, memory-only site settings,
find/zoom, real downloads, the existing Downloads sidebar, pause/resume, final
cancellation and saved-file preservation. It additionally verifies trusted native
right-clicks/link actions, guarded-tab unload and signed virtual WebAuthn assertions
in the private session. The shared WebAuthn fixture selects only its disposable
virtual account and verifies assertions with Node crypto outside the renderer.
A second local origin exercises nondelegated iframe Permissions Policy. Session markers are shared across the
fixture's generated modules, and dialog exports use a writable facade so
controlled responses actually replace the bundled function. The shared-shell
capture was visually inspected.

The default smoke controls dialog responses and download destination selection;
background throttling is disabled only in that fixture to run on a locked Mac.
The `--private-only --native-private-dialogs` mode was also run on an unlocked Mac
with the real production permission dialogs and native macOS Save panels. Native
UI interaction denied location and camera/microphone access, saved the disposable
file, and canceled a second Save panel. The test verified remembered denials,
file contents, absence of a canceled file, history isolation and final cleanup.
This mode retains normal page background throttling and allows time for native
interaction; it does not stub the permission dialogs or choose the saved path.

The regular Downloads and virtual WebAuthn smokes pass. The regular
`--windows-only` smoke now passes on the unlocked Mac with actual foreground
focus, live-view reparenting, draft preservation and the new-window shortcut.
Its optional `--simulate-focus` mode remains available for locked/headless runs.
General fixture visits select stable tab IDs instead of mutable display labels.

Actual device/OS grants, real account/OAuth-provider compatibility and native
passkeys remain open. The Electron source build still needs more disk capacity
(this Mac had approximately 9 GiB available during this continuation) and
Apple-approved browser entitlement/provisioning.

Private browsing prevents Kudium from saving browsing history and session data;
it does not hide traffic from websites or network operators. Do not advertise
anonymity or guaranteed removal of operating-system traces.

## 3. Extension and website compatibility — high priority

- [x] Preserve store-tab-only compatibility hints, privacy header rules and custom
      user-agent preferences; add “Install this extension…” to the existing Extensions
      menu on registered store detail tabs using the owned package-review installer.
- [ ] Make Google's own Add/Remove page controls reliable across store responses;
      eligibility gating remains intermittent. The native menu is the verified path.
- [x] Live uBlock Origin Lite download/install, readable review/catalog names,
      toolbar popup/placement, per-profile storage, All Groups enablement, reload and
      selected-profile removal (controlled review in disposable macOS profiles).
- [x] Resolve uBlock Origin Lite worker startup: share compatibility APIs across
      Chromium's distinct `browser`/`chrome` namespaces; verify classic/module workers,
      real command metadata, ordinary-site containment and isolated profile storage.
- [x] Verify actual uBlock filtering: six enabled native rulesets, tracker redirected
      to its bundled inert resource and no tracker server request; the same endpoint
      succeeds in an unextended regular profile and a private session.
- [x] Verify native-messaging transport with a real disposable host: frame one-shot,
      persistent port, module-worker requests, UTF-8/split-frame handling, manifest
      permission rejection and ordinary-site containment. Reject failed API promises
      and disconnect rejected native ports without logging extension payloads.
- [x] Reflect failed one-shot/adapter callbacks through scoped `runtime.lastError`;
      verify denial and removal immediately after the callback with a real host fixture.
- [x] Report native connection permission refusals through scoped `runtime.lastError`
      during `onDisconnect`; pass the disconnected port, dispatch once, clear the
      error afterward and avoid local events for explicit `port.disconnect()`.
- [x] Preserve native-host launch/exit/timeout and malformed-response reasons through
      promise rejection and scoped port `runtime.lastError`; reject disconnected
      port writes and deliver a final stdout response before process closure.
      Real child-process cases and CJS/ESM authority regressions pass.
- [x] Preserve Chromium's dynamic `runtime.lastError` for native callback APIs;
      verify no-receiver errors and cleanup against unmodified Electron sessions.
- [x] Trace Bitwarden 2026.10.2 startup error to `getUserPremiumStatus` sent by its
      worker during constructor initialization. A minimal native/adapter comparison
      reproduces the same sender-exclusion rejection; no fabricated response added.
- [ ] Address Bitwarden's startup self-message compatibility and complete real vault
      sign-in, unlock, autofill, OTP and vendor desktop pairing. Its actual worker
      and onboarding popup render, but the startup error remains.
- [ ] Test a representative real-extension matrix, including password managers,
      content blockers, toolbar actions, workers and native messaging.
- [x] Reject unexpected native extension identities without changing catalog identity;
      restore failed/partially applied installs before the next queued mutation.
- [x] Disposable native install recovery checks: changed package key, navigation
      after loading, native load failure and partial All Groups failure; cleanup and
      successful retry verified. Startup/update identity rejection has regression tests.
- [ ] Complete durable install/update crash recovery, hung native acknowledgment,
      retained-package cleanup and signed cross-platform acceptance.
- [x] SauceDemo published-account login, authenticated reload, shared-group session
      and isolated-group authentication rejection using production browser views.
- [x] KudiTrust user-authorized test account: password sign-in, authenticated reload,
      shared-group login, isolated-group rejection, private login/final cookie cleanup,
      regular-session preservation and sign-out propagation. Seven checks pass;
      see `../benchmarks/kuditrust-acceptance.md`. Google/passkey controls are present;
      their authentication flows remain unverified.
- [x] Actual HTTPS multipart upload to a public test server using a generated
      disposable file and controlled file selection; verify server confirmation.
- [x] Public video decoding/playback and two-peer WebRTC negotiation, remote
      audio/video tracks, inbound RTP bytes, decoded frames and hangup with fake devices.
- [x] Load Google/Microsoft sign-in and Zoom test entry documents and controls.
- [x] Load Stripe's cross-origin hosted checkout inputs in an explicit test session.
- [x] Verify Stripe hosted-field input through Chromium's input protocol and inspect
      the actual native checkout window. Main-WebContents character injection was
      a harness routing failure; focused iframe input accepts all test values.
- [x] Replay main-frame login, upload and WebRTC controls with Chromium mouse events
      in native page views while the Mac is unlocked.
- [x] Correct diagnostic workspace captures to include visible WebContentsView page
      surfaces; inspect composed captures and the actual native checkout screenshot.
- [ ] Complete Stripe test payment confirmation, wallet/3DS coverage, authenticated
      provider OAuth/popups and provider meeting acceptance.
- [ ] Complete broader OS-input/permission and native-overlay visual acceptance;
      Chromium mouse-event replay and composed captures do not establish OS grants.
- [ ] Investigate Widevine licensing/distribution and protected streaming;
      support remains unverified, not assumed from Chromium rendering.

Extension/update evidence: 51 focused tests across 11 suites pass on macOS arm64.
There are 17 owned native-install cases, including the native-menu path, plus
store frame/access checks and real frame/worker host acceptance. Live uBlock
installation, worker, filtering and isolated storage pass. Bitwarden's worker and
onboarding render, but startup messaging and the broader account/extension matrix
remain open. See
`../benchmarks/extension-install-recovery.md` and
`../benchmarks/extension-live-store.md`.

Public-site coverage and its limits are recorded in
`../benchmarks/real-sites-acceptance.md` and the matching JSON report. The runner
returns a failure exit code when any required check is incomplete. Demo credentials,
generated uploads and test payment data stay in disposable profiles; these checks
do not use personal accounts or charge cards.

## 4. Release and recovery — high priority

- [ ] Signed fresh install and upgrade acceptance on each supported platform.
- [x] Guard update state against unsolicited/wrong-version download completion,
      stale progress after readiness and nonfinite progress; preserve retry and
      explicit install behavior. Set the updater's no-downgrade policy explicitly.
- [ ] Verify authenticated updates, failed update recovery and downgrade policy
      with actual signed installed versions and update feeds.
- [ ] Verify crash recovery, protected-storage/key changes and cookie recovery.
- [ ] Complete remaining privileged IPC/native dependency review and GPU/focus tests.
- [ ] Reconcile older release checklists with current evidence before publishing.

Use the repository's `docs/build-and-release.md`; no hosted workflow dispatch,
publication or version bump is authorized by this implementation backlog.

## 5. iCloud workspace sync — medium priority

- [x] Native CloudKit bridge and encrypted store adapter exist.
- [ ] Connect bridge, scheduler/change feed, recovery keys and Preferences UI.
- [ ] Complete schema/environment deployment and valid app provisioning.
- [ ] Signed two-Mac tests: offline, concurrent edits, account changes, revocation,
      deletion, quota failures and tampered snapshots.

## 6. Privacy and reading improvements — medium/optional

- [ ] Maintained tracking/content-blocking filter lists and per-site controls.
- [ ] Reader mode with accessible typography and article extraction.
- [ ] Page translation with an explicit provider and data-disclosure model.

Implementation order: private browsing first while native passkeys await runtime
capacity, then credential/extension compatibility and release acceptance. Expand
the optional reading features after the essential browsing flows are dependable.
