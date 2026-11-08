# TouchBox release checklist

Privacy scope confirmed November 7: approved websites may process shared saved
data through their own services. Local disclosure and AI action reviews remain
required. Strict all-channel downstream network isolation is not a release gate;
earlier unchecked entries asking for it are superseded.

This is the bounded release checklist. Older unchecked Arc comparison notes are
historical; use this checklist for release status. Optional feature parity does
not block a release that clearly scopes unavailable features.

## Current implementation

- [x] Finish download recovery API and compact sidebar notice, with details
  collapsed by default and a main-owned recovery-file Finder action.
- [x] Preserve downloaded files and recovery copies when clearing history.
- [x] Cover recovery status, blocked writes, Finder target, and collapsed UI in tests.
- [x] Full unit suite: 80 suites, 346 tests passed (2026-11-05).
- [x] Whole-project lint and TypeScript checks passed (2026-11-05).
- [x] Electron native-menu payload and document-lifetime boundary checks passed.
- [x] Production build passed (2026-11-05).
- [x] Electron downloads sidebar: responsive widths, toggle, shortcut, save failure/retry.
- [x] Electron download boundaries: recovery/deduplication, native icons,
  malformed IPC, replaced targets, and metadata-only clear.
- [x] Revalidated Electron downloads sidebar and download-history boundaries,
  untrusted IPC rejection, and cross-origin iframe permission isolation (2026-11-05).
  These run against the local Electron runtime, not a signed release package.

## Release verification still required

- [x] Five packaged Electron fuse settings; native default/hardened attack checks,
  actual packaged UI/preload, website isolation, worker history persistence, CSP
  and tab cleanup pass on local unsigned/ad-hoc macOS arm64 (2026-11-07).
  See [evidence](../benchmarks/electron-fuses-2026-11-07.md). This is a bounded
  local check, not signed release verification.
- [x] Packaged Chromium port/pipe restrictions with native before/after checks and
  local startup execution (macOS arm64, 2026-11-07). Production-payload observer
  checks preserve workspace/preload/history/CSP/isolation coverage without CDP.
  See [evidence](../benchmarks/packaged-debugging-2026-11-07.md).
- [ ] Signed cookie-encryption migration and unavailable-Keychain recovery;
  file-protocol privilege review;
  external/unpacked resources and other-platform runtime verification.

- [ ] Signed arm64 and supported x64 builds; notarization, stapling, Gatekeeper,
  clean install, restart, and real update from a previous release.
  Local signing inventory: Apple Distribution/Development identities are present;
  no Developer ID Application identity was found for direct-download distribution.
- [ ] Real Apple Passwords extension: installation, login/autofill, native messaging,
  restart, session switching, uninstall, access revocation, popup placement.
- [ ] CPU/GPU/startup/memory measurements with 1/10/50 sessions, materials on/off,
  long download histories and thumbnail decoding. Passing smoke tests is not profiling.
- [ ] Extension IPC/native messaging and live camera/microphone/device/service-worker
  permission audit, including denied-to-allowed changes and document lifetime.
- [ ] Packaged keyboard navigation, native chooser, narrow layout, light/dark,
  inactive window, accessibility fallback and multiple-monitor verification.

## Feature availability gates

- [ ] iCloud sync: two-Mac conflict/reconnect/deletion tests and sensitive-data boundaries.
- [ ] Native iCloud passkeys: Apple approval, entitlement and actual integration verification.
  Keep unavailable capabilities clearly marked until verified.
- [ ] Dedicated TouchBox encrypted sync API: specification only; backend implementation
  remains deferred by user request.

## Optional follow-up

- [ ] Nested folders, custom folder icons and fuller keyboard tree navigation.
- [ ] More shortcut controls and extension site-access diagnostics.
- [ ] Further Arc interaction refinements.
- [ ] Genuine Apple Liquid Glass when supported by native/Electron APIs.

## Attachment import evidence (November 7)

- [x] Eight stale picker/add handler cases reject with zero retained attachments;
  normal imports and native AI/Preferences lifecycle regression pass. See
  `../benchmarks/ai-import-boundary-2026-11-07.md`.
- [x] Selected-file reads/stats are asynchronous and bounded with descriptor cleanup.
- [ ] Verify private attachment bytes at renderer IPC/provider/upload destinations
  and native image decoder containment.
- [x] Current-source unsigned/ad-hoc macOS arm64 package passes scoped
  fuse/debugging/observer checks; signed untouched-release and other platforms remain open.

## Saved-data approval lifetime evidence (November 7)

- [x] Nine stale saved-data fill/document-upload cases block before website
  private request bodies; normal fill, file input and pending chooser succeed.
  See `../benchmarks/ai-private-fill-2026-11-07.md`.
- [x] Retain vault and document bindings through pending native upload completion.
- [x] Verify temporary secure-input request/reuse document lifetime for eight
  native collection/reuse cases; see `../benchmarks/ai-private-input-2026-11-07.md`.
  Broader DOM/network races and physical OS session lock remain unverified.
- [ ] Enforce/review downstream private-context website destinations and provider
  injection with socket-level destination evidence.

## App-owned IPC inventory and tested lifetime boundaries (November 7)

- [x] Enumerate 47 fixed channels plus dynamic input and generated preload surfaces.
  See `../security/ipc-inventory-review-2026-11-07.md`.
- [x] Runtime-bound the three generic preload channel methods.
- [x] Block seven tested stale group/preference mutations across native waits.
- [ ] Complete per-subaction/dependency IPC review, including group removal,
  composer Save, personal-agent/MCP changes, capture and decoder boundaries.

- [x] Block nine tested stale composer Save requests through encrypted vault
  persistence and capability discovery; preserve normal private/AI-access saves.
  See `../benchmarks/ai-composer-save-2026-11-07.md`. This supersedes composer
  Save's tested lifetime item above; broader IPC/release gates remain open.

- [x] Retain configuration document/service ownership across MCP/agent native
  waits; verify nine stale requests, competing rotation and three real loopback
  client/tool requests during restart. See `../benchmarks/mcp-ownership-2026-11-07.md`.
  Full external agent integration, file races, IPC branch audit and release gates
  remain open.

- [x] Implement and verify group deletion document/target binding, all unshared
  profile selection, durable intent/checkpoints, native process-restart retry,
  and completed-ID retirement; see `../benchmarks/group-removal-2026-11-07.md`.
- [ ] Verify group deletion interruption at every step, disk-full/permission
  failures, extension/session writers, conflict/corruption recovery UI and
  signed/cross-platform durability.

- [x] Capture lifetime/export commit: nine stale/canceled cases reject; six
  destinations preserved; native renderer/main UI passes. See
  `../benchmarks/page-capture-2026-11-07.md`.
- [ ] Verify capture decoder/resource and path races, abrupt-crash cleanup, and
  signed/cross-platform behavior. Rename/clipboard dispatch cannot be rolled back.

- [x] Preflight AI attachment/capture image dimensions before native decode and
  bound capture Buffer conversion. Four controlled rejected fixtures avoid decoder
  dispatch. See `../benchmarks/image-preflight-2026-11-07.md`.
- [ ] Complete icon/thumbnail file-resource boundaries, animation/container limits,
  decoder containment and platform validation.

- [x] Local icon/thumbnail bounded reads, native decoder preflight/snapshots,
  four active/128 pending thumbnail limits and stale requester rejection verified.
  See `../benchmarks/local-images-2026-11-07.md`.
- [ ] Verify OS file-icon/native decoder resources, full animation/container limits,
  crash/power-loss snapshot cleanup and signed/cross-platform behavior.

- [x] Enforce a saved-data action-review floor including Full access; verify six
  unsafe transmissions become zero, approved form entry, public navigation,
  consent restoration/Stop and persisted MCP/task markers. See
  `../benchmarks/private-outbound-2026-11-07.md`.
- [ ] Enforce actual accepted-action/hook network destinations and existing
  channels; test workers/frames/shared profiles, Stop/restart and private task
  scheduling. General private-input/attachment flow and native Enter delivery
  remain unverified. Marker power-loss and signed/cross-platform gates remain open.

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

- [x] Hold private navigation authorization from before initial review through
  creation and native dispatch; three stale-authorization cases send zero
  destination requests. Verify native new-tab/Back/Forward/Reload redirect
  reviews, approved new-tab and public navigation; see
  `../benchmarks/private-navigation-dispatch-2026-11-07.md`.
- [ ] Verify the full renderer/extension new-tab handshake, all-channel
  containment, native input delivery, durability and signed/cross-platform gates.

- [x] Restore tested native Enter submissions and textarea newline; verify 14/14
  approved attempts, denied/canceled behavior and post-focus target validation.
  See `../benchmarks/enter-key-2026-11-07.md`.
- [ ] Resolve original pointer UnknownVizError and broader sidebar focus; verify
  interruption, all frame layouts, physical input and signed/platform gates.
