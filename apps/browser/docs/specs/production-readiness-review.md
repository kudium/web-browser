# TouchBox production readiness review

Current privacy scope (user-confirmed November 7): approved websites may process
shared saved data through their own services. Recipient-specific disclosure and
AI action review remain required. Universal downstream network containment is
outside scope; historical unchecked entries demanding it are superseded.

Owner: Kudium. This review tracks the full Arc comparison, customization,
security, optimization and cleanup request. Production readiness is unproven
until the release checks below have evidence.

November 6 performance/security implementation is tracked in
`performance-security-production.md`. Current before/after transport and early
tab closure evidence, history persistence baseline and current quality gates are
in `../benchmarks/production-improvements-2026-11-06.md`. Earlier results below
remain historical; open release requirements are not closed by this follow-up.

## Arc research

Earlier inspected behavior and implementation are tracked in
`arc-inspired-browser-experience.md`. On November 4, Arc's native interface was
retrieved again. It exposes a dedicated Extensions menu in its macOS menu bar.
Opening that menu timed out twice in the native automation; its contents, action
pinning and popup placement have not been verified in this review. No personal
tabs or preferences were changed.

- [ ] Inspect extension menu, pin/unpin controls, action placement, right-click,
  popup dismissal and narrow-window behavior in Arc.
- [ ] Inspect folder context menus and drag/reorder in a disposable space.
- [ ] Compare profile switching, keyboard traversal and website/browser shortcut
  priority; document each observed behavior before choosing TouchBox changes.

## Extension toolbar findings and fixes

TouchBox places extension actions beside Preferences at the top right. Its
Electron dependency previously retained the old profile observer when React
changed the partition attribute. `connectedCallback` subscribes and
`disconnectedCallback` releases the observer, while `attributeChangedCallback`
only fetches state. Keying the element by profile ensures both lifecycle callbacks
run on profile switches. Same-profile tab changes keep the observer.

- [x] Reconnect action-list lifecycle on login-profile changes.
- [x] Bound extension row width, prevent icon shrinking, retain horizontal scroll
  access, and add keyboard focus outlines.
- [x] Regression test verifies element replacement, same-profile reuse and cleanup.
- [ ] Verify real dependency in-flight state races during rapid profile switching;
  its shared renderer action cache and untagged update events need further review.
- [ ] Native popup bounds at screen edges, profile switches and multiple monitors.
- [x] Persistent pinning and searchable icon/name picker with inline pins.
- [ ] Inline per-extension permission/access diagnostics (native management currently
  exposes access and error details).
- [ ] Real installed extensions: popup, context menu, disabled/uninstall, keyboard
  focus, scrolling, light/dark and narrow windows.

## Customization and usability

- [x] Glass/solid chrome preference and existing OS accessibility fallback.
- [ ] Complete shortcut catalog and per-action/site priority (existing spec).
- [x] Extension pinning/order preference and reset semantics (native menu).
- [ ] Review all preference labels against actual behavior, empty states,
  keyboard navigation, focus restoration and narrow-window layouts.
- [ ] Packaged material verification (native-window-materials.md).

## Security and release gates

- [ ] Audit trusted UI IPC authorization, input validation, URL protocols,
  permission origin/frame attribution and external navigation.
- [ ] Audit extension routing/access revocation, native messaging, popup lifetime
  and profile isolation, including race cases.
- [ ] Verify passkey/Apple entitlement boundaries; do not claim pending vendor
  integration works (passkeys-and-browser-security.md).
- [ ] Verify opt-in iCloud sync, conflict handling and sensitive-data boundaries;
  dedicated TouchBox sync API remains planned per user instruction.
- [ ] Review production dependency vulnerabilities and supported Electron release.
- [ ] Packaged app startup, signing/notarization, updates and recovery behavior.
- [ ] Full unit/type/lint gates plus appropriately scoped desktop regressions.

## Optimization and cleanup

- [x] Remove obsolete commented window/titlebar and unsafe isolation alternatives
  from main window creation; active configuration remains intact.
- [x] Audit unused modules by references and build entrypoints; remove confirmed
  retired components/types and reduce development-only packaged catalog data.
- [ ] Profile idle CPU/GPU, launch time and tab/extension growth with 1/10/50
  sessions, comparing materials on/off. No blanket performance claim yet.
- [ ] Audit subscriptions, timers, IPC listeners and native view/popup disposal.

## Verification from this pass

- `npm test -- --runInBand`: 37 suites / 90 tests passed, plus native-messaging
  framing/error and external-link routing regressions.
- TypeScript, targeted ESLint for changed TypeScript files and production build
  passed. Whole-project lint has not been rerun in this pass.
- `--move-tab-session-only`: cross-site transfer uses destination cookies,
  shared-profile transfer preserves live view, and new links use the new group.
- These checks do not verify actual multi-extension scrolling or rapid async
  observer races; those requirements remain open above.

## Permission and dependency hardening

- [x] Pending website permission answers recheck the global block policy.
- [x] Document navigation or WebContents destruction denies a pending request
  exactly once; late prompt answers cannot persist approval. In-page navigation
  preserves the document. Listener cleanup is tested.
- [x] Site-level decisions changed during a prompt take precedence.
- [x] Update production transitive dependencies: adm-zip 0.5.18 → 0.6.1 and
  follow-redirects 1.16.1 → 1.16.2 using explicit npm overrides and lockfile.
  This addresses audited ZIP allocation/extraction and credential redirect flaws.
- [x] `npm audit --omit=dev`: zero reported production vulnerabilities after the
  updates (previously three high-severity package entries). Audit coverage is not
  a guarantee of security; dev dependencies and release support remain separate.
- [x] TypeScript, production build and all 38 suites / 95 tests pass, including
  permission races and browser behavior. Native messaging/external-link checks pass.
- [ ] Live extension install/popup/storage check with patched ZIP dependency.

Whole-project lint found five pre-existing formatting/import-spacing failures;
only formatting was fixed in the affected check script and test files. Rerun
result is recorded when complete. The wider IPC/frame, extension race and
packaged release audits remain open.

`npm run lint` now passes the whole-project style and TypeScript gate. The live
extension harness initially returned `user_cancelled` at consent before extraction;
it had no automation for the current custom consent dialog. The harness now stubs
only install/remove decisions in its disposable profile, like other integration
checks. Consent UI remains covered separately; this is an extraction/storage test.

The corrected live harness installed uBlock Origin Lite with adm-zip 0.6.1 and
passed toolbar popup bounds and profile-A storage assertions, then failed on an
outdated all-app menu label. The label was updated to the current session wording
and the complete check rerun. The real worker still reports missing
`chrome.commands.onCommand`, an existing Electron compatibility limit; installation
and popup checks must not be described as verified ad blocking.

Final live rerun waited for an enabled Install button rather than clicking a
currently disabled control; the remote store never enabled it within 30 seconds.
The complete live check therefore remains pending. Earlier successful installation,
popup bounds and storage provide limited compatibility evidence for the patched
ZIP library, not full extension acceptance. No real user profile was modified.

Manual ESLint on the optional `.cjs` smoke script reports 19 style issues (existing
poll loops and harness style, including the new readiness loop). The supported
`npm run lint` gate passes but does not include this CJS harness. Harness lint
cleanup remains separate work; the live remote-store failure is not counted as a
passed test.

## Trusted-window navigation boundary

- [x] Main/settings/utility windows remain on their exact app document URL;
  renderer navigation and redirects to different paths, views or origins are
  prevented. Same-document hash changes remain usable.
- [x] App-window popup links route only HTTP, HTTPS and mailto through the OS;
  arbitrary local files, script/data/custom schemes and embedded URL credentials
  are rejected. Failed OS launches are handled without unhandled rejections.
- [x] Guard is installed before the app document loads. Website WebContentsView
  navigation and extension popup paths retain their separate browser handling.
- [x] Unit checks and actual Electron events verify renderer navigation rejection,
  safe popup routing, file popup rejection, hash changes and no extra window.
  Reusable `.erb/scripts/window-navigation-smoke.cjs` now runs with desktop tests.
- [x] Production build, whole-project lint/types and 39 suites / 97 tests pass.

This closes the unrestricted app-window external opener and app-document
replacement gaps. It does not close the broader IPC/frame/extension review.
The real Electron smoke uses a local HTTP fixture and disposable userData; packaged
file-document startup is still part of the release verification gate.

## Sidebar organization follow-up

Arc inspection was attempted again; the native tool reported that macOS is locked.
An unlock request is pending while independent implementation continues.

- [x] Persist collapsed folders and spaces locally across reloads/restarts, using
  shared bounded/validated presentation storage with safe malformed-data fallback.
  This state does not alter session identities, cookies or synced content.
- [x] Folder Right arrow expands, then focuses the first contained session when
  already expanded; Left arrow collapses. Enter/Space retain button behavior.
- [x] Collapsed folders show their chevron at rest; expanded folders reveal it on
  hover/focus. Native context menus and drag placement remain intact.
- [x] Electron organization check verifies persistence after renderer reload and
  keyboard expand/enter/collapse with four-column favorites, preserved folder
  session identity and narrow layout.
- [ ] Full up/down tree traversal, child-to-parent keyboard movement and nested
  folder behavior remain pending; the current control is not a full ARIA tree.

The space-title Electron check also verifies collapsed-space persistence after
reload, then native menu/rename and responsive layout behavior. Whole-project
lint/types and production build pass for this sidebar change.

## Arc extension menu and TouchBox toolbar

Arc's Extensions menu was successfully opened after unlock. Observed: installed
extensions form a compact list, followed by “Add Extension…” and “Manage
Extensions…”. A subsequent extension action was interrupted by changed UI state;
popup geometry, pinning and folder menus remain unverified. Screenshot capture
was unavailable for Arc. No extension access or user configuration was changed.

- [x] Inspect Arc's top-level extension-menu list and add/manage grouping.
- [x] TouchBox dedicated Extensions toolbar button opens the native management
  menu directly, using the selected session's effective login profile.
- [x] Add live Appearance preference “Show extension icons in toolbar”; hiding
  icons removes the action-list observer but retains the management button.
- [x] Native command rejects untrusted renderer requests. Empty selection can
  still expose installed-extension management without launching a page view.
- [x] `--extension-toolbar-only`: icon hiding/restoration applies live, native
  management menu opens, website stays visible, controls fit a narrow window.
- [ ] Per-extension pin/unpin and action launch from the management list remain
  pending. Hidden action icons can be restored through Appearance; the button
  currently exposes management rather than emulating every vendor popup.

TypeScript, production build and whole-project lint pass; focused browser,
preference, toolbar lifecycle and settings tests pass. Existing multi-extension
popup/installation and rapid profile-switch race gates remain open.

## Extension action state and dead-code cleanup

- [x] Fix dependency action cache to use profile + extension identity, rather than
  sharing one extension-ID cache across profiles.
- [x] Tag action updates with their profile; lists reject foreign-profile updates.
  Drop stale/out-of-order replies and replies after unsubscribe; clear caches on
  unsubscribe and preserve per-tab title/badge precedence.
- [x] Reproducible compatibility patch for CJS/ESM and development/packaged
  dependency trees, invoked by existing install/dev/build/test patch runner.
  Unexpected dependency source fails with a review requirement; patch is idempotent.
- [x] Actual dependency source regression covers concurrent profiles, out-of-order
  replies, unsubscribe/reconnect races, scoped rendering and per-tab metadata.
  It runs with `npm test`; actual remote-extension multi-profile IPC stress remains
  part of the live acceptance gate rather than implied by this VM regression.
- [x] Remove unused `useScreenList` and its obsolete ScreenManager list methods,
  event and key constants. Preserve live last-app-ID and last-URL restoration.
- [x] Remove unreferenced generic helper module (including unused Google favicon
  downloader) and its sole Axios dependency. Remove unused blanket storage reset
  helpers. Searches across app, tests and scripts found no callers; saved storage
  data was not deleted.
- [x] Current gate: all 40 suites / 100 tests, native messaging, external links and
  extension action state regressions, whole-project lint/types and production build
  pass. Production dependency audit remains zero reported vulnerabilities.

The compatibility patch is an adapter to the reviewed dependency version, not a
complete replacement extension engine. Further extension API compatibility,
profile-race live stress, packaging and Arc research gates remain pending.

Patched-dependency Electron toolbar check passes (native menu, live icon toggle,
website visibility, narrow layout). Axios removal also removed follow-redirects
from the entire dependency tree; its now-unused override was removed after
`npm ls follow-redirects` confirmed no installed consumers. adm-zip's security
patch override remains required for extension extraction.

## Permissions-store hot-path optimization

Every browser state publication previously synchronously read/parsed the entire
site-settings file, including loading and media events. The main process now
loads this small store once per userData path and serves independent copies from
memory. Atomic writes update the cache only after rename succeeds.

- [x] Remove repeated filesystem reads/parsing from state and permission lookups.
- [x] Validate loaded permission choices and mute booleans; malformed values
  cannot become grants. Missing/corrupt files start with no grants.
- [x] Copy returned permission maps so callers cannot mutate the cached store.
- [x] Save failure preserves the prior cached and durable permission decision.
- [x] Regression: 1,000 lookups read the file once; profile/origin isolation,
  deny-to-allow updates, failed save, invalid values and prompt races pass.
- [x] Local benchmark: 1,000-site fixture / 3,000 lookups: old synchronous
  read+parse 1,509 ms; cached lookup 5.26 ms, excluding initial cache load.
  This measures lookup CPU/I/O cost, not whole-browser navigation or GPU cost.
- [x] Whole-project lint/types, focused permissions/browser tests and build pass.

Site settings changes through TouchBox apply immediately; manual edits to this
internal JSON file require restarting TouchBox. No live external-file editor or
watcher is provided, and no file I/O is added to the hot lookup path.

Electron `--site-settings-only` passes: responsive dialog, connection details,
reversing blocked permissions, profile isolation, real playback indicator,
mute/unmute and media-stop behavior.

## Shortcut customization follow-up

Current sources already register history, downloads and bypass-cache refresh.
This pass addresses independent alternate editing rather than duplicating those
existing actions.

- [x] Add alternate bindings without replacing the existing combinations.
- [x] Remove an individual binding; keep other alternates and support up to four.
- [x] Retain duplicate/platform/reserved-key validation, capture suppression,
  reset and explicit replacement controls. Add mode does not offer destructive
  “Unassign all”. Clear dialog text distinguishes add from replace.
- [x] Register Open extensions menu as an initially unassigned bindable action.
- [x] Unit checks cover adding, duplicate rejection, independent removal and
  four-binding limit; full current gate is 40 suites / 103 tests plus native
  messaging, external-link and extension-state regressions.
- [x] Whole-project lint/types and production build pass.
- [x] Electron shortcut check verifies live add/remove persistence, shifted
  brackets, remapping, capture/save and narrow preferences. Capture inspected.
- [ ] Import/export, localized/layout labels, per-action/site priority and wider
  split-view action management still require implementation/verification.

Electron toolbar check additionally passes a custom Alt+E Extensions binding from
actual website WebContents focus, opening the native management menu; it restores
the fixture bindings afterward and retains live website visibility.

## Saved-layout recovery

- [x] Invalid saved JSON or records no longer prevent layout startup; valid
  sibling tabs retain their session and shared-profile identities.
- [x] Preserve damaged original lists under local `.recovery` keys before
  replacing them. If the backup cannot be saved, refuse the overwrite and keep
  startup name migration usable.
- [x] Reconstruct missing spaces and folders using the original referenced IDs,
  so retained tabs remain reachable from the sidebar.
- [x] Show a dismissible recovery notice with a Copy recovery data control.
- [x] Unit checks cover corrupt lists, malformed profile identities, orphaned
  folders/spaces and failed backup during migration.
- [x] Electron `--storage-recovery-only` verifies the exact retained tab is
  visible inside its recovered folder, original backups match, and its saved
  login identity is unchanged. Page metadata may legitimately change its title.
- [x] Full unit gate: 41 suites / 110 tests, plus native messaging, external-link
  and extension-state regressions. Whole-project lint/types and production build
  pass; focused dialog/recovery checks and desktop recovery pass after final edits.
- [ ] Packaged startup/recovery and broader user-data migration remain release
  gates. This recovery protects sidebar layout; it does not recover corrupted
  cookie databases or provide a general backup service.

The user authorized continuing the code review while Arc's interface is
unavailable. Unobserved Arc folder menus and extension popup behavior remain
research items, rather than inferred acceptance results.

## Extension catalog and mutation audit

- [x] Reject malformed extension identity/enable/scope/profile/exclusion records
  independently. Healthy siblings remain available; malformed scopes and truthy
  non-boolean enable fields cannot widen session access. Duplicate IDs do not
  override the first valid policy. Legacy catalogs without scope retain their
  historical global-install behavior.
- [x] A failed store uninstall rejects that caller but no longer poisons the
  shared mutation queue. Later uninstall and policy operations can proceed.
- [x] Regression checks cover malformed policies, healthy sibling retention,
  legacy compatibility and a disk-write failure followed by a successful retry.
- [x] Full lint/types, build and 41 suites / 111 tests pass, with the existing
  native messaging, external-link and extension-state source regressions.
- [x] Electron extension-toolbar check passes native menu opening, live icon
  visibility, narrow layout, website visibility and custom shortcut activation.

Arc was accessible for live folder/extension menu inspection in this pass.
Observed pin controls and folder actions are recorded in the Arc experience spec.
Full extension site-access enforcement, popup authentication, real multi-extension
stress and packaged release checks remain open.

## Extension window lifecycle

- [x] Browser disposal detaches extension profile ownership, clears captured
  renderer/window callbacks, install targets and pending install records, and
  removes the active-window association.
- [x] Unavailable profiles are omitted from UI actions; periodic updates choose
  an available owner rather than retaining the first closed window.
- [x] Install/uninstall prompts recheck the requesting owner after awaiting
  consent, rejecting late answers after ownership is released or replaced.
- [x] Reopening binds fresh callbacks to the existing session engine, avoiding
  duplicate extension routers/listeners. Releasing an old owner does not clear
  callbacks registered by a newer owner.
- [x] Tests verify callback detachment, late install denial, engine reuse and
  browser-disposal integration. All 42 suites / 114 tests pass; lint/types,
  production build and Electron extension-toolbar checks pass.
- [ ] Live close/reopen with installed extensions and quantitative session/window
  memory-growth profiling remain required. Persistent session engines deliberately
  survive window closure; this change does not claim full session reclamation.

## Extension pinning and order

- [x] Native management menu exposes Pin to toolbar, Move icon earlier/later and
  Show all extension icons. Explicit empty pin lists hide every action; the
  Extensions button stays available. New extensions stay unpinned once an explicit
  list is selected; reset restores automatic visibility.
- [x] Validate, deduplicate and persist a bounded ordered extension-ID list in
  preferences. This changes presentation only, not installation or site access.
- [x] Apply visibility/order to dependency-rendered action buttons through its
  open shadow root. Keep native popup behavior and profile reconnection. Observe
  newly loaded buttons and disconnect the observer during cleanup.
- [x] DOM focus order matches displayed order; reset restores original action
  order. Weak references track initial order without retaining removed buttons.
- [x] Unit preference/render checks and Electron native-menu checks cover
  pin/unpin, persistence, reorder/reset, hidden controls and narrow layout. The
  Electron pinning fixture uses synthetic catalog/actions, not installed-extension
  authentication. Full suite: 42 suites / 116 tests, plus source regressions.
- [x] Inline searchable picker with live extension icons, names and pin buttons.
- [ ] Verify pinned real-extension popups and profile switches under live stress.

## Dead-code and resource cleanup

- [x] Build-entrypoint import graph rooted at main, preload and renderer, plus
  repository reference searches, confirmed unused MainTabMenu and its props,
  Popular app-catalog component/types, settings layout types, debounce hook and
  ignored Main prop types. Removed those seven modules and the obsolete Direction
  type, catalog-tab event and sidebar-tools CSS.
- [x] Preserve live settings app-list/filter styles. Keep tested sync encryption
  and snapshot modules despite their pending runtime integration; declarations
  such as vendor.d.ts are not runtime dead code.
- [x] Replace the retired catalog assets with ten name/icon/slug records in
  `.erb/fixtures/sidebar-preview-apps.json`. The screenshot fixture retains all
  referenced entries. Its 1,725-byte data file is outside release resources.
- [x] Remove 6,736,271 bytes of unused catalog/category files from `assets`, which
  electron-builder otherwise copies via `extraResources: ./assets/**`. This is
  unpacked resource size; no compressed installer or startup timing claim.
- [x] Full 42 suites / 116 tests, source regressions, lint/types and production
  build pass after source cleanup. Script syntax and fixture/packaging-path checks
  pass after the resource change.
- [x] Electron space-title smoke passes compact layout, collapse, native options,
  rename and responsive behavior after removing unused sidebar CSS.

## Local packaged app and release tooling

- [x] Resolve package-manager mismatch: both manifests now select npm 12.2.0,
  matching the npm dependency/lockfile workflow. The previous pnpm selection
  failed dependency collection because its configured executable was missing.
  Node engine prerequisites match npm 12.2.0's published requirements
  (`^22.22.2 || ^24.15.0 || >=26.0.0`).
- [x] Build a local unsigned macOS arm64 directory app using electron-builder
  26.15.3 / Electron 45.0.0, with publishing disabled and signing explicitly null.
- [x] Inspect real bundle: `com.kudium.touchbox`, main/preload/renderer entries
  present, retired catalog absent from resources and development fixture excluded.
- [x] Launch actual packaged executable with disposable `--user-data-dir`.
  Inspector evidence confirms that profile, ready/visible/non-loading main window,
  bundled file-document URL, rendered workspace sidebar and extension control.
  Quit the test instance cleanly; the user's profile was not used.
- [x] Fix observed updater rejection when a local directory build has no
  app-update.yml. Skip absent metadata and development builds; handle updater
  error events/rejected checks, and start once per app lifecycle.
- [x] Fix notarization API usage: pass required Team ID and remove obsolete
  appBundleId. CI macOS release hooks require nonempty APPLE_ID, APPLE_ID_PASS
  (app-specific password), and APPLE_TEAM_ID. Missing credentials or failed
  submissions fail the hook; explicit local builds still skip notarization.
- [x] Regression checks for release credential boundaries and update failures;
  full 44 suites / 120 tests, source regressions, lint/types and build pass.
- [ ] Developer ID signing, notarization submission/stapling, Gatekeeper install,
  x64 packaging, real update metadata/delivery and packaged recovery remain open.

The local unsigned launch reported macOS sandbox-extension warnings, although its
window rendered. Signing and distribution behavior is not inferred from this
local test. No application was uploaded or published.

## Requesting-frame permission attribution

- [x] Empty requesting URLs may fall back to the current page only when Electron
  explicitly identifies a main-frame request. Missing subframe URLs are denied
  without reading or inheriting the parent page's saved grant.
- [x] Permission checks use Electron's reported securityOrigin when supplied
  (media/device checks), rather than an embedding page origin. Empty or opaque
  reported origins are denied rather than replaced with the parent's origin.
- [x] Centralize the check handler alongside the request handler, retaining
  profile/origin policy, global block override and pending-navigation defenses.
- [x] Unit checks cover parent-grant/subframe isolation, main-frame fallback,
  media security-origin attribution and empty/opaque denial. Full suite is
  44 suites / 122 tests, plus existing source regressions.
- [x] Electron `--frame-permissions-only` observes a real cross-origin child
  geolocation request and denies it despite the parent's saved grant. It confirms
  no prompt and no changed decisions, using local fixtures/disposable userData.
  Chromium routes this geolocation request through the request handler, so the
  smoke accepts observed request or check attribution; it does not infer media
  behavior from a geolocation result.
- [ ] Live camera/microphone/device and service-worker permission matrices remain
  open; this check does not exercise OS device prompts or real hardware access.

## Window-command and broadcast IPC boundary

- [x] Require registered live app WebContents and the exact main frame for window
  creation/close and cross-window event broadcasts. Website/extension WebContents
  and nested frames cannot use these handlers.
- [x] Validate window request shape, view and intent. Use main-owned presets;
  renderer options cannot override preload, Node integration, sandboxing or other
  security/window defaults. Failed creation is handled rather than becoming an
  unhandled rejection.
- [x] Close the requesting app window rather than whichever window is focused.
- [x] Broadcast only one known event per message, with a 256 KiB serialized-size
  limit and malformed/circular payload rejection. Preserve live app/space updates.
- [x] Remove the unused app-data-path bridge, its preload channel, renderer startup
  request and unused global type. It had no consumers and exposed a stale path.
- [x] Unit authorization/malformed-data tests and actual Electron IPC test pass.
  The live test uses generated local files and disposable userData; an unregistered
  test window deliberately has a test-only IPC bridge to exercise rejection.
- [x] Add `window-commands-smoke.cjs` to the optional desktop gate. Full suite:
  45 suites / 124 tests plus source regressions; production build and lint/types
  pass. Source subframe rejection is unit-tested; live IPC exercises whole windows.
- [ ] Remaining specialized IPC handlers, payload schemas, and extension router
  exposure still require their own audit; this does not close the full IPC gate.

## History deletion persistence

- [x] Browsing-history clear/remove atomically save the proposed list before
  committing cached records or broadcasting success. Failed saves retain prior
  memory/disk state and reject the caller.
- [x] Download-history clear/remove use the same commit order; invalidate
  thumbnails and pending progress-write timers only after success. Active download
  records stay during clear, and downloaded files are not deleted.
- [x] Automatic download progress persistence retains its nonfatal error handling,
  so a history-file failure does not cancel an active transfer.
- [x] Unit tests simulate rename failure for both clear and remove and compare
  cache and durable contents. Existing success/file-preservation assertions pass.
- [x] Real Electron history/download sidebar checks inject a local save failure,
  verify visible error feedback and retained records, then restore writes and
  verify successful retry. Expected IPC errors appear in the harness output.
- [x] Correct the smoke fixture's EventBus dependency compilation after IPC
  hardening. Full 45 suites / 124 tests, lint/types and production build pass.
- [ ] Full history/download payload and file-path audit remains open; this closes
  the observed false-success deletion behavior, not the entire data/privacy gate.

## Download thumbnail resource bounds

- [x] Replace the unbounded native thumbnail map with a 128-entry LRU cache.
  Cache eviction does not delete history records or downloaded files.
- [x] Share in-flight generation for identical records across callers/windows.
  Failed/unavailable icons remain retryable rather than becoming cached failures.
- [x] Clear/remove invalidate pending work; older completions cannot repopulate
  the cache or overwrite a fresh request. Validate completed record/file presence
  before consulting the cache.
- [x] Tests verify eviction/recency, shared requests, retry and clear/remove races.
  All 46 suites / 128 tests, source regressions and lint/types pass.
- [x] Production build and Electron download-sidebar check pass, including native
  thumbnail results from concurrent requests and null after clearing the record.
- [ ] Whole-browser CPU/GPU/memory profiling and native generation concurrency
  limits remain open. This bounds retained entries and deduplicates work; it does
  not claim measured full-app performance or a byte limit on thumbnails.
- [ ] Verify actual packaged artifact resources, signing and startup as part of
  the release gate; a build configuration check does not prove a shipped package.


### Shortcut transfer (2026-11-04)

- [x] Keyboard Shortcuts preferences export a versioned JSON snapshot and import
  through a file picker, with a scrollable per-action review before replacement.
- [x] Reject oversized (>64 KiB), malformed, unsupported, incomplete, unknown-action,
  conflicting and system-reserved bindings before saving. Mod adapts to the receiving
  platform; explicit Control/Meta bindings retain their meaning and are revalidated.
- [x] Cancel and failed persistence preserve existing settings; failed saves can retry.
  No cookie, credential or session data is included in shortcut exports.
- [x] Unit/UI checks cover portable round trip, invalid files, review, cancellation,
  save failure/retry and downloadable Blob cleanup. Full suite: 46 suites, 131 tests.
- [x] Whole-project lint/types, production build and Electron `--shortcuts-only`
  pass; the desktop smoke checks existing navigation/remapping/capture at narrow width.
- [ ] Manually verify native file selection/download and keyboard focus in a packaged
  build. Future action-registry changes need a versioned migration; incomplete older
  snapshots currently fail explicitly rather than silently restoring defaults.


### Compact extension picker (2026-11-04)

- [x] Extensions toolbar button and custom shortcut toggle an anchored, searchable
  picker, with icons/names, inline accessible pin toggles and Add / Manage actions.
  Hidden toolbar icons remain accessible in the picker. The popup closes on action
  activation, outside click, Escape, or tab change; workspace snapshots keep the
  native website from covering the controls.
- [x] Reuse actual engine-rendered action buttons instead of duplicated icons, so
  badge state, per-tab titles, context menus and popup anchors retain their behavior.
  DOM rows remain stable during search and pinning; observers disconnect on cleanup.
- [x] Catalog metadata includes only validated IDs/names, without installation paths.
  Automatic-to-explicit pin changes preserve extensions assigned to other profiles.
- [x] 47 suites / 133 tests pass. Lint/types and production build pass.
- [x] `--extension-toolbar-only` now installs two real local MV3 extensions in a
  disposable profile. It verifies picker search, inline pin persistence, hidden
  toolbar access, shortcut activation, narrow layout/name visibility, actual popup
  activation in the expected Session using real Tab/Enter input, native management,
  order/reset and DOM focus order. Enter/Space explicitly activate the engine button;
  icon/name duplication does not add an extra keyboard stop. This replaces the previous synthetic-only pinning smoke.
- [ ] Third-party authentication extensions, multi-monitor/edge popup bounds,
  rapid profile-switch races, long lists, dark mode and full keyboard traversal
  still require wider runtime verification. Local fixtures do not prove compatibility
  with iCloud Passwords or all Chrome APIs.


### Preference and browser IPC boundaries (2026-11-04)

- [x] Restrict preference broadcasts to live trusted app windows. Preference IPC
  fails closed if no trusted-window predicate is registered; extension/site windows
  do not receive settings metadata.
- [x] Download-directory selection applies to the latest preferences after the OS
  dialog, preserving concurrent changes. Reject invalid paths and results from a
  closed/untrusted requester. Cancel returns current preferences.
- [x] Recheck requester and original session/owner after clear-cache/data consent;
  released or reassigned profiles cannot execute late destructive consent. Reset
  consent also rechecks the requesting app window.
- [x] Validate layout arrays, IDs, profile metadata, duplicate slots, finite/bounded
  geometry and optional fields before any view mutation. Validate command names,
  IDs, URL/search text and permission choices before calling native APIs. Malformed
  trusted renderer messages no longer throw during partial view reconciliation.
- [x] 48 suites / 138 tests pass; whole-project lint/types and production build pass.
- [x] New `--ipc-boundaries-only` Electron gate checks malformed layouts/commands
  against existing live views and an actual untrusted window with the app preload
  deliberately exposed. Preferences, reset, menus, confirmations and history reject;
  untrusted commands cannot navigate app views or receive preference broadcasts.
  Expected denial errors in Electron logs are part of the test.
- [x] `--organization-only` passes with validated layouts: 26 favorites, four
  columns/scrolling, folder drops preserving sessions, collapse persistence, keyboard
  traversal and narrow layout.
- [ ] This gate does not complete the whole IPC audit: download file-target validation,
  native menu payload/lifecycle limits, extension-engine IPC routes and remaining
  browser-command consent races still need their own checks.


### Browser clear-data consent and extension storage (2026-11-04)

- [x] Browser-menu session clearing rechecks its original WebContents, requesting
  main frame and live window after confirmation. Closed, replaced or moved tabs
  cannot execute late consent; cancellation has no effect. Recheck again after
  clearing before reloading so a replacement tab is not reloaded.
- [x] Preferences and browser-menu clearing share `clearSessionSiteData`. Clear
  website cookies, localStorage, IndexedDB and service workers while excluding
  installed extension origins. This corrects the previous browser-menu use of
  unrestricted `clearStorageData`, which erased extension storage.
- [x] Page-cookie clearing reloads only its original live WebContents after the
  asynchronous cookie operation, avoiding an unrelated replacement tab.
- [x] Six delayed-consent scenarios cover live original tab, cancel, closed
  window, changed login session, changed frame and a move while clearing is already
  underway. The last case preserves the authorized clear but skips reloading either
  tab. Full suite: 48 suites / 144 tests.
- [x] Electron `--browser-data-consent-only` installs a real local extension and
  sets website cookies/localStorage, extension chrome.storage.local and another
  session's cookie. The actual browser clear command removes website data, reloads
  the page, retains extension storage and preserves the other login session.
  Await the reload before inspecting storage: cookie removal alone does not prove
  the complete asynchronous clear operation has finished.
- [x] Whole-project lint/types, production build and the native clear-data gate pass.
- [ ] More destructive-operation races and all website storage types still need
  broader native verification; the local extension fixture does not prove every
  third-party password extension's storage/authentication compatibility.


### Native UI request validation and lifetime (2026-11-04)

- [x] Parse/copy complete native menu requests before building an OS menu. Reject
  malformed/sparse entries, invalid types/state/IDs, duplicate IDs, oversized labels,
  more than 200 nodes or depth beyond five. Validate array lengths before allocating
  the copied list; menu responses contain only a validated string ID or null.
- [x] Fix declarative menu compiler ID reuse: every item receives its own ID even
  when it has no callback. Choosing an informational item cannot run a later action.
- [x] Replace pending menus per requesting WebContents; cancel on window closure,
  renderer destruction or main-document navigation. Ignore stale selection and
  remove lifecycle listeners on all normal completion/cancellation paths.
- [x] Confirmations and image selection watch the original requesting document.
  Late results after closure/navigation return cancellation, including navigation
  that retains the same main-frame object. Watchers are disposed after completion.
- [x] Validate image chooser output as an absolute regular-file path within the
  existing 5 MiB byte limit before decoding; successful images return a resized
  32×32 data URL. Unit checks cover missing/relative/nonfile/oversized selection,
  valid resizing and rejected late selection. Decoder/resource profiling remains open.
- [x] Native Electron `--native-ui-boundaries-only` rejects invalid menus/prompts,
  returns valid selections, cancels replaced menus and closes pending native menus
  on a real app reload without retaining their navigation listener. Expected denial
  errors in its logs are part of verification.
- [x] `--folder-actions-only` still passes for real native menus, copy feedback,
  cross-space moves preserving shared login identities and folder-ID collision repair.
- [x] Full suite: 50 suites / 150 tests; whole-project lint/types and production
  build pass.
- [ ] Native image selection still needs packaged macOS chooser coverage, and native
  menu/document lifetime checks do not complete the broader extension IPC audit.


### Download history and file targets (2026-11-04)

- [x] Validate persisted download IDs/names/absolute paths, MIME strings, timestamps,
  integer byte counters and states. Keep healthy siblings; first valid ID wins so
  duplicate records cannot confuse selection or thumbnail caching.
- [x] Preserve the exact original bytes of malformed/partly invalid history in a
  private recovery file before allowing later history writes. Content-keyed copies
  are reused only after byte comparison; altered copies are not overwritten.
  Failed recovery preservation or oversized/unreadable history prevents overwriting
  the original. Automatic download progress persistence retains its nonfatal failure
  handling so transfers themselves can proceed.
- [x] File open/reveal and thumbnails require a completed record whose current target
  is a regular file. Reject missing files, directories and final-component symlinks;
  revalidate before consulting the thumbnail cache. Renderer IDs cannot become paths.
- [x] Validate download action/thumbnail arguments and keep broadcasts restricted to
  trusted UI. Metadata clearing still does not delete downloaded files or recovery copies.
- [x] Safe filename fallback for empty/control-only/dot names; automatic destination
  selection recognizes existing dangling symlinks as collisions. Displayed download
  names follow the actual save path, including suffixes and Save As renames.
- [x] Unit/filesystem checks cover recovery byte preservation/reuse/failure, duplicate
  filtering, symlink/directory targets, malformed arguments, safe names and rename
  tracking. Full suite: 51 suites / 155 tests.
- [x] New Electron `--download-history-boundaries-only` verifies native record loading,
  recovery bytes, deduplication, file icon resolution, symlink/directory rejection,
  malformed IPC and metadata-only clearing. `--downloads-sidebar-only` retains its
  responsive sidebar and deliberate save-failure/retry checks.
- [x] Whole-project lint/types and production build pass.
- [ ] Add visible recovery/status guidance and test oversize/native chooser paths in a
  packaged build. Path validation is checked at operation time; it does not claim an
  immutable file identity or solve every local filesystem race. Thumbnail decoder
  resource profiling, long histories and the broader history audit remain open.


## Bounded release follow-up (2026-11-04)

Use [release-checklist.md](release-checklist.md) for the current release gates.

- [x] Download recovery status is visible in the sidebar with collapsed details and
  an optional Finder action. Clear hides a recovered notice only after persistence succeeds.
- [x] Recovery status/Finder target and blocked preservation tests; UI tests for
  collapsed details and unavailable files; native IPC status before/after clearing.
- [x] Full unit suite: 53 suites / 160 tests. Lint/types and production build pass.
- [x] Electron downloads sidebar, download-history boundaries and native UI boundaries pass.
- [ ] Direct-download signing: no Developer ID Application identity in the local
  signing inventory. Signed/notarized/Gatekeeper/update release verification remains open.

The older combined recovery/native-chooser checkbox above is partly superseded:
visible recovery guidance is complete; packaged chooser and resource profiling remain open.

## Private recovery and control ownership follow-up

See `../benchmarks/production-improvements-2026-11-06.md`,
`../benchmarks/ai-private-recovery.json` and
`../benchmarks/ai-control-isolation.json` for current measured evidence.

- [x] Actual encrypted private/legacy checkpoint restore requires review before
  provider inference; declined/oversized context sends zero inference requests.
- [x] Refused review preserves the encrypted checkpoint and original expiry for
  explicit retry; accepted retry completes; Stop discards the checkpoint.
- [x] Built-in new chat, continuation and manual saved task preserve external
  pause; due scheduled work remains deferred until explicit external Resume.
- [x] Actual provider recovery, handoff/window recreation and full MCP smoke pass.
- [ ] Usable large-context review, downstream saved-data transmission controls,
  installed CSP, broader IPC and signed/packaged cross-platform gates remain open.

## Production UI CSP follow-up

- [x] Emitted scripts receive SHA-256 CSP hashes and integrity attributes; arbitrary
  inline/event/local scripts cannot call the app bridge in the runtime fixture.
- [x] Actual emitted-file runtime blocks fetch/beacon, form/object/frame loads
  and base rewrites; altered script bytes fail integrity with HTML unchanged.
- [x] Production Edit group rendering/styles, extension picker/icons/popups and
  Developer editor/sidebars remain functional; development template compiles.
- [x] 129 suites / 639 tests, whole-project lint/types and production build pass.
- [ ] Installed ASAR/signing/update authentication, remaining input and IPC audits
  remain separate requirements. Dynamic styles and legacy/custom image URLs have
  explicit allowances; UI image loads can still contact web destinations.

Evidence: `../benchmarks/renderer-csp.json` and the production improvement report.

## Favicon resource follow-up

- [x] Stream response size limits before full allocation; abort rejected, obsolete,
  navigated/removed/discarded and disposed requests. Four active operations per owner.
- [x] Preflight supported PNG/JPEG dimensions before nativeImage decoding; real
  oversize/declared/chunked/gzip, supersession and normal image fixtures recorded.
- [x] 130 suites / 659 tests, lint/types, build, production audit and full native
  opener/download workflow pass. See `../benchmarks/favicon-resources.json`.
- [ ] Broader image-format/platform checks, native decoder CPU/RSS and whole-app
  resource/latency measurements remain open. The four-slot limit makes all-icons
  completion slower in the measured fixture; no general UI speedup is claimed.

## Page capture follow-up (November 7)

See `../benchmarks/page-capture-2026-11-07.md`: nine tested stale/canceled capture
operations now reject, six existing export destinations remain intact, malformed
crop rejects, and registration replacement works. Document/source ownership spans
async capture and save selection; private temporary export checks precede rename
dispatch. Focused tests (2 suites /15 tests), lint/types, build and separate native
renderer/main capture UI pass. This supersedes the tested capture-lifetime item;
decoder/native resource containment, path races, crash durability, downstream
private-data containment and signed/cross-platform release gates remain open.

## Image preflight follow-up (November 7)

`../benchmarks/image-preflight-2026-11-07.md` documents image dimension checks
before native decoding in AI attachments and page captures, plus the capture
base64 allocation bound. Four actual attachment decoder dispatches become zero
with controlled hostile-header fixtures; normal native PNG still works. Header
limits do not sandbox decoders or bound original Chromium capture allocation.
Space-icon file reads, download thumbnails, animation/container/native-resource
limits and signed/cross-platform gates remain open.

## Local images follow-up (November 7)

See `../benchmarks/local-images-2026-11-07.md`: icon/thumbnail sources now use
bounded asynchronous descriptor reads and validated buffers/private snapshots.
Two source replacements decode the original bytes; stale thumbnail completion
rejects; oversized/malformed inputs avoid native image decoding. Eight requests
peak at four thumbnail pipelines, and 128 pending IDs are bounded. Real app ICNS
import now works. Unit (140 suites /709 tests), lint/types, build and scoped
production preload checks pass. Temporary snapshots add I/O; no whole-app speed,
decoder sandbox, complete format/platform or crash-cleanup claim is made. OS file
icon resources, downstream private-data containment and signed release gates remain
open.

## Saved-data downstream action review (November 7)

See `../benchmarks/private-outbound-2026-11-07.md`. Full access no longer bypasses
local website-action review once saved facts enter an AI context. Six tested
unsafe Chromium/socket transmissions become zero, including a fake provider
encoding approved data into a URL and an MCP controller recreation. Approved
form entry and public Full-access navigation still work. MCP disclosure markers
persist; private generated task instructions retain their review requirement.
This supersedes the tested missing action-review floor, not network containment.

Next required network work must compose with the existing advancedPreferences
request rules rather than replace them. Arm enforcement before private bytes
reach website code; bind reviews to actual request destinations and immutable
payload/selected-field identity. Cover redirects, descendant frames, shared
profiles and unowned service-worker requests, with bounded pending reviews and
revocation before dispatch. Establish how existing WebSocket/WebRTC channels are
closed or constrained, and retain the policy while DOM/hooks/worker storage can
still contain released values, including Stop/restart. Plain webRequest hooks
cannot establish all-channel containment. Test intentionally approved form/login/
upload workflows and hostile transformed facts at socket boundaries before
claiming exact recipient control. Native Enter delivery, private attachments/
user input/general website facts, marker power-loss durability and signed release
gates also remain open.

## Private navigation destination boundary (November 7)

See `../benchmarks/private-navigation-2026-11-07.md`. Native main-frame redirects
now wait for bound local review in private AI contexts, while shared request
rules preserve preference blocking. Denied same-origin and cross-origin redirects
each change from one destination request to zero. Approved POST 307 retains its
body/cookie; public navigation, two-hop redirects and a sibling sharing the profile
remain functional. Stop and changed/restored consent cancel pending dispatch.
All 142 suites /722 tests pass; final lint/types/build evidence is recorded with
the benchmark. This closes only the tested private main-frame redirect gap.
Descendant/worker/existing-channel containment, private new-tab/history socket
fixtures, general private-data provenance, native Enter delivery, durability and
signed/cross-platform release gates remain open. Production readiness is unproven.

## Private navigation dispatch authorization (November 7)

See `../benchmarks/private-navigation-dispatch-2026-11-07.md`. Retain consent,
controller, host/document and target/profile/scope authorization before initial
review through native tab creation. Recheck synchronously at the native allow
callback, including the first approved URL. Three stale-authorization socket
cases each change from one destination request to zero. Native private new-tab,
Back, Forward and Reload redirect reviews and approved/public navigation pass.
This supersedes the missing native new-tab/history fixture item above for the
controlled createTab callback; full renderer/extension creation remains open.
All 142 suites /726 tests, lint/types and production build pass. Descendant/worker/
existing-channel containment, general data provenance, native Enter delivery,
durability and signed/cross-platform release gates remain open.

## Native Enter behavior (November 7)

See `../benchmarks/enter-key-2026-11-07.md`. Enter now carries carriage-return
text, and keyboard input revalidates its observed target after focus. The native
MCP fixture changes from 0/14 to 14/14 successful submissions/POSTs, restores a
textarea newline, honors canceled/default-prevented actions and blocks a field
changed during focus before any key command. Modifier/text tests, all 142 suites
/727 tests, lint/types and production build pass. This closes the listed native
Enter cases; original pointer UnknownVizError, broader sidebar focus, interruption/
frame/physical-input coverage, data containment and signed/platform gates remain
open. One renderer evaluation is added; no whole-app speedup is claimed.
