# Browser completeness checklist

Status: implementation started. This is a delivery checklist, not a claim that
every feature below is absent or that every website can be supported.

## Goal and delivery rules

Make Kudium dependable as a primary browser while retaining its Spaces, separate
logins, project tools and assistant. Prioritize compatibility, protection and
recovery before adding new reading features.

- Reuse existing sessions, permission handling, downloads, sync and glass surfaces.
- Fix browser capabilities generally; do not add website-specific user-agent rules.
- Preserve the actual Chromium version. Never claim APIs, codecs or DRM that the
  installed runtime cannot provide.
- Test with disposable profiles and fictional data. Record runtime versions and
  individual pass/fail results. A skipped or untested check is not a pass.
- Run locally. No hosted Actions, publication or version bump is part of this work.
- Website changes and installer releases require their own validation.

## Current foundation

Spaces and separate login sessions, private windows, extension integration,
password management, sync scheduling, Picture in Picture, tab sleeping and Task
Manager already have implementations. Their existence does not establish complete
coverage or production readiness. Platform passkeys require the patched runtime;
stock-runtime installers must not advertise them as verified native support.

## 1. Website compatibility — first delivery

### Automated local baseline

- [x] Preserve real Chromium identity across documents, cross-site frames, workers
  and fresh private sessions using the existing identity regression.
- [x] Retain the actual Electron host token for compatible provider sign-in flows.
  On 2026-11-17, reproduced Google's insecure-browser rejection with the stripped
  identity, then verified user-assisted Gmail sign-in and the loaded Gmail app
  after retaining it. WhatsApp's public linking page also passed. See
  `apps/browser/.erb/scripts/browser-signin-acceptance.cjs` for repeatable public
  entry checks; this does not certify every account or provider.
- [x] Add one documented command for the baseline and structured result artifacts.
- [x] Exercise the production browser backend and its actual login sessions.
- [x] Verify two tabs sharing a login share cookies, localStorage and IndexedDB.
- [x] Verify a separate login on the same origin cannot read those records.
- [x] Verify private sessions cannot read regular data or retain it in a new family.
- [x] Verify service-worker registration, interception and cached responses after reload.
- [x] Verify document, iframe, dedicated-worker and service-worker identities agree
  with HTTP headers and the actual runtime version.
- [x] Verify IndexedDB transactions and WebCrypto round trips in regular/private tabs.
- [x] Verify multipart uploads arrive unchanged and live event streams receive updates.

Acceptance: the command exits nonzero on any failed required check, writes a JSON
report with runtime versions and named results, and uses no real accounts or remote
providers. Storage tests operate on the same origin across different sessions.

### Broader compatibility coverage

- [x] Chromium file-input plumbing: trusted click, single/multiple file bytes,
  cancellation without losing the prior selection, folder approval and cleanup.
- [ ] Native OS Open sheets: select, cancel, multiple files and directory restrictions.
- [x] Download again after forced quit: original login context, fresh complete
  transfer and collision-safe destination without changing the partial file.
- [x] Live interrupted-download Resume: real HTTP byte-range continuation in the
  original session, validated server metadata and refusal of changed partial files.
- [x] OAuth-style cross-site redirect, form POST, return message, preserved opener
  identity and automatic child-tab closure using synthetic pages.
- [ ] Downloads: complete, cancel, resume where supported, interrupted recovery and
  filename/path handling without overwriting unrelated files.
- [ ] Popups and redirects: form POST, opener messaging, OAuth-style return flows
  and navigation while a permission prompt is open.
- [ ] Camera/microphone: allow, deny, revoke and OS-level denial; report actual
  device checks separately from fake-device tests.
- [x] Independent camera/microphone choices, legacy-choice migration behavior,
  fake-device allow/deny and revocation after reload through the production backend.
- [ ] Screen sharing: source picker, cancellation, revocation and ending a capture.
- [x] Browser-owned glass source picker: explicit selection, cancellation, visible
  controls, stale-source refusal and navigation/owner lifetime guards. Source-list
  fixtures are synthetic; real OS capture remains pending.
- [ ] WebSocket reconnect, worker reconnect and offline/online transitions.
- [ ] WebAuthn: security keys, iframe restrictions and native passkeys only with a
  supported runtime; test cancellation and account selection.
- [ ] PDF viewing/printing, browser zoom, keyboard input and clipboard permissions.
- [ ] Assess codec and DRM requirements, distribution rights and supported runtime
  options. Publish an honest support matrix before promising protected streaming.
- [ ] Maintain a manual representative-site matrix for messaging, conferencing,
  productivity, shopping and streaming. Test navigation without purchasing,
  sending messages or modifying real accounts.
- [ ] Include the local baseline in the existing local release validation once its
  runtime/artifact dependencies are established. Keep hosted workflows disabled.

Acceptance: failures identify a capability and reproduction, rather than silently
spoofing a newer browser. Manual sign-in/payment/DRM checks remain marked unverified
until performed; local fixtures cannot certify a provider integration.

## 2. Browsing protection

- [ ] Specify a phishing/malware reputation provider: licensing, update cadence,
  offline behavior, false-positive handling and exactly what data leaves the device.
- [ ] Implement navigation/download verdicts with bounded latency, cache expiry
  and explicit unavailable states; never imply a file was scanned when it was not.
- [ ] Add accessible warning pages with the origin, reason, return action and a
  deliberate temporary bypass. Do not render untrusted website text as HTML.
- [ ] Replace the small tracking list with maintained compatible filter lists,
  atomic updates and rollback to the last valid version.
- [ ] Provide per-site protection controls and clear breakage recovery.
- [ ] Test redirects, iframe requests, private sessions, exceptions, expired lists,
  provider timeouts and false positives with synthetic fixtures.

Acceptance: no page contents, credentials or full browsing history are sent to a
provider. Private browsing follows a documented disclosure policy. Reputation
warnings, tracker blocking and antivirus scanning are described separately.

## 3. Crash recovery and workspace backups

- [ ] Audit existing persistence and startup migration before adding another store.
- [ ] Define a versioned snapshot of Spaces, groups, saved tabs, navigation state
  where available, active selection and window layout. Exclude secrets and private tabs.
- [ ] Write snapshots atomically; retain a bounded number and validate on restore.
- [ ] Record clean shutdown versus interrupted shutdown without marking a crash
  as clean during startup.
- [ ] Offer recovery preview, selective restore and dismissal without deleting
  the last good snapshot. Load recovered tabs lazily.
- [ ] Add export/import with schema validation, preview, duplicate handling and
  rollback if application fails. Explain sensitive URLs in exported files.
- [ ] Test process kill during writes, corrupt/truncated snapshots, disk-full,
  schema migration, interrupted restore and multiple windows.

Acceptance: recovery restores the last valid saved workspace after forced quit;
private data never appears in snapshots. Unsaved website form state is not promised.

## 4. Reader Mode and translation

- [ ] Reader Mode: article detection, extraction, safe sanitization and source link.
- [ ] Adjustable type size, width and theme using shared preferences; preserve the
  original page and its scroll position when entering/leaving Reader Mode.
- [ ] Translation: choose provider/local capability, supported languages and an
  explicit disclosure before sending page text externally.
- [ ] Original/translated toggle; never translate editable forms, credentials or
  payment fields. Handle dynamic content without repeatedly submitting it.
- [ ] Test malformed articles, right-to-left content, code, tables, images and
  pages where extraction/translation is unsupported.

Acceptance: both features have clear unavailable/error states and can return to
the original page without losing user edits or navigating away.

## 5. Resource controls

- [x] Task Manager: metrics, filtering/sorting, stop/close actions, shared-process
  confirmation, protected browser interfaces and private-session isolation.
- [ ] Extend existing tab sleeping with configurable idle thresholds and per-site
  exceptions; keep active calls, downloads, editors and unload guards resident.
- [ ] Define energy-saving behavior against measured CPU/power baselines, not just
  a toggle. Honor OS power settings and accessibility preferences.
- [ ] Show sustained-usage indicators with sampling/hysteresis to avoid flicker.
- [ ] Persist exceptions without storing private tab metadata.
- [ ] Test wake/reload, navigation state, active media, downloads, editors and
  multi-window shared sessions under sustained load.

Acceptance: automatic savings never use Task Manager's destructive force-end path
and never silently discard protected work. State exactly what page state can return.

## 6. Sync status and recovery

- [ ] Audit existing account/iCloud transports and encryption enrollment independently.
- [ ] Show last successful sync, pending work, connection failures and retry action.
- [ ] Show connected devices and revoke access with well-defined key behavior.
- [ ] Specify conflict resolution and deletion/tombstone semantics, including offline
  devices and group moves. Avoid resurrecting deliberately removed tabs.
- [ ] Document encryption-key backup, lost-key recovery and limitations; never promise
  server recovery of data that the server cannot decrypt.
- [ ] Test two-device edits, offline reconnect, revoked device, expired authentication,
  retry backoff, key rotation and interrupted enrollment.

Acceptance: errors are actionable, private sessions are excluded, and transport
success is not reported as completed decryption/application on the receiving device.

## 7. Accessibility and UI consistency

- [x] Keep the AI permission shield visible and its menu usable at composer widths
  from 240px to 520px; only the scope dropdown chevron collapses.

- [ ] Audit address bar, sidebar, Preferences, dialogs, downloads, Task Manager and
  assistant for keyboard access and meaningful accessible names.
- [ ] VoiceOver: reading order, selected tabs, live status announcements and focus
  return after dialogs/context menus.
- [ ] Contrast, reduced transparency/motion, text scaling and 480px window layouts.
- [ ] Reuse shared glass material with an opaque accessibility fallback. Ensure
  readable foreground contrast over different backgrounds.
- [ ] Replace duplicated controls with shared primitives when behavior matches.
- [ ] Preserve regression evidence for high-impact flows, including keyboard-only
  navigation and actual VoiceOver checks.

Acceptance: important actions work without a mouse, focus remains visible, menus
can be dismissed, and interface content is not clipped at supported window sizes.

## Implementation record

First slice completed on 2026-11-16: the native compatibility baseline passed ten
production-session checks plus the separate global identity regression on macOS
Apple Silicon. The suite uses the real browser backend with a disposable smoke
shell; account/update/theme services in that shell are not part of this baseline.

From the repository root, run `npm run build:browser` followed by
`npm run test:browser:compatibility`. From `apps/browser`, use `npm run build` and
`npm run test:compatibility`. A desktop graphical session is required. The runner
removes `ELECTRON_RUN_AS_NODE` for child apps and applies a two-minute timeout per
suite. Required check failures exit nonzero.

Artifacts: `apps/browser/release/local-compatibility-<timestamp>/` contains
`compatibility-suite.json` (suite exit results) and `compatibility-results.json`
(named native checks, runtime versions and limitations). Set
`KUDIUMBROWSER_SMOKE_OUTPUT` to choose an artifact directory. These artifacts are
local evidence, not publication or certification of all websites.

Second slice completed on 2026-11-16: Downloads now offers **Download again** for
inactive interrupted/cancelled transfers with valid source metadata. It starts a
fresh download in the original login, preserves partial files and strips retry URL
metadata from renderer responses. New regular records keep validated retry metadata
in the owner-only history file; private records keep it only in memory. Older
records without a source URL require downloading again from the website. Expired
links or revoked login sessions can still require returning to the website.

The baseline now includes eleven production-session checks (including the
OAuth-style flow), a two-process SIGKILL/download recovery test with persistent login
cookies, and file-input selection/abort/folder checks. Seventeen focused download
unit/UI tests also passed. The file-input test drives Chromium's chooser through
CDP, not the macOS Open sheet. Actual device permissions and byte-range continuation
after restart remain unverified/unimplemented respectively.

Additional reports: `download-recovery-results.json` and `file-input-results.json`
record runtime versions, checks and limitations alongside the suite results.

Third slice completed on 2026-11-16: site settings expose independent Camera,
Microphone and Screen sharing controls while honoring older combined media choices.
Screen sharing requires an explicit source selection on every request, checks
site/global blocks and cancels when the requester navigates or closes. The shared
glass dialog uses an opaque accessibility fallback. This picker grants video only;
system audio is not included. macOS camera/audio entitlements and usage descriptions
are prepared, but a signed installer and real hardware have not been tested.

Live interrupted downloads with a valid unchanged partial file and a strong ETag
or Last-Modified validator can Resume through Electron's interrupted-download API.
The native fixture verifies a real HTTP Range request and complete file bytes in
the original login session. Continuation metadata stays in memory; after restarting
the browser, Download again remains the recovery path. Modified/replaced partial
files are rejected rather than overwritten.

Validation: source build and TypeScript passed, nine focused test suites passed
80 tests, and all five native compatibility suites passed. The production-session
suite now has thirteen checks, including independent device decisions and blocked
screen capture. The real source-picker UI test uses synthetic source enumeration,
checks visible controls, explicit selection, Cancel and navigation cleanup; it
writes `screen-sharing-picker-results.json` and a screenshot. The separate native
private-window regression also passed. Fake devices and picker fixtures do not
verify OS recording approval, real screen pixels, camera hardware or signed bundles.

Next slice: actual OS picker/device permission checks and supported capture
termination behavior. Then implement browsing protection and workspace recovery
against their acceptance criteria above.

Responsive permission fix verified on 2026-11-16: the native layout check first
reproduced the hidden shield at 420px, then passed at 240, 260, 320, 380, 420 and
520px after narrowing the CSS selector. The permission menu opens with all three
modes at each width. Run from `apps/browser` with
`env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron .erb/scripts/browser-ui-smoke.cjs --ai-composer-layout-only`
after building. Screenshots and `ai-composer-layout-results.json` are written to the
local smoke output directory. This checks visibility/layout/menu access, not
provider permission enforcement or actual VoiceOver behavior.
