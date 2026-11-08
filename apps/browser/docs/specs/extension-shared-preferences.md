# Shared extension onboarding and preferences

Status: proposed implementation plan.

## Intended behavior

“All sessions” grants an extension access to every eligible session. Website cookies, authentication, extension browsing caches and website-specific state remain isolated. Extension code still starts separately in each session: a single instance cannot provide complete coverage of isolated Electron sessions without a substantial architecture change.

For supported extensions, Kudium Browser will remember successful onboarding once and share only reviewed, non-sensitive preferences across sessions. Unknown extensions retain their current isolated behavior. The UI will explain both access scope and settings-sharing scope.

## Threat model and boundary

An extension, a website, or an extension update may attempt to read another session’s history, credentials or identifiers through a shared store. Session IDs are not authentication. Only the main process can decide which keys are shared; no webpage or extension may expand that list.

Never share cookies, tokens, native-messaging credentials, account IDs, localStorage, IndexedDB, storage.session, caches, browsing history, detection results, tab IDs, URLs, hostname lists, analytics consent, telemetry identifiers or permission grants. Do not copy storage directories. Do not proxy all chrome.storage.local calls to a global store. Do not alter a vendor manifest or extension source to bypass onboarding.

## Phase 1: infrastructure and a Wappalyzer onboarding adapter

1. Add an adapter registry keyed by the actual installed extension ID and a reviewed version range, with a schema version and exact allowlisted storage keys. Check installed identity against the trusted extension catalog. Unknown versions disable the adapter until reviewed.
2. Add a main-process shared preference store keyed by extension ID, with atomic writes, bounded value sizes and strict primitive/schema validation. Use a bounded serialized queue. Never log values. Encryption is required if a future reviewed key is sensitive; this initial store contains no secrets.
3. Add a lifecycle hook after extension identity is registered but before its background worker runs or accesses storage. This is a prerequisite to prevent the welcome-page race. Inspect Electron and electron-chrome-extensions lifecycle ordering and prove it with a startup test before choosing the hook. If the available hooks cannot seed storage in time, do not inject after startup and claim the problem is fixed; implement a narrowly scoped compatibility-layer hook or report the limitation.
4. For Wappalyzer 6.12.8, the inspected code reads the top-level storage.local key `version`; when absent it opens its installation page. It also checks `upgradeMessage` for version changes. Review the exact storage schema and startup flow before enabling an adapter. Record an app-level onboarding marker only after the extension successfully starts and saves its real version. Seed the reviewed version marker for later sessions from that successful state. Do not fabricate success or copy the whole extension cache.
5. Concurrent first sessions use a per-extension bootstrap lock: one session establishes successful onboarding, then others can seed the marker. On timeout/failure, leave isolated behavior intact and expose a diagnostic. No session waits indefinitely.
6. Preserve upgrade semantics. A real extension version change can show its update notice once for the app; do not always seed the newest version and silently suppress all updates. Persist the last successfully initialized version and test downgrade/reinstall/reset behavior. If reliable one-time update behavior requires a second key or event hook, review it independently.
7. Separate onboarding from consent. Never seed `termsAccepted`, privacy choices or analytics settings without explicit user intent and a reviewed adapter. Never suppress an arbitrary extension-created tab based solely on its URL or text.

## Phase 2: selected non-sensitive preferences

For each supported extension, review individual preference keys and offer “Share supported extension settings across sessions.” Start with off for settings migration. Show the exact setting names; sharing onboarding does not imply sharing preferences or consent.

Read/write interception must verify the extension identity, owning WebContents/session and allowed access scope in the main process. Handle get, set, remove, clear and onChanged consistently: global changes affect only approved keys, clear does not erase another session’s isolated state, and events are delivered only to eligible extension contexts. Untrusted renderer IPC cannot name another extension or session. Define conflict handling as ordered last-write-wins for simple preferences and make migrations atomic.

No silent bulk migration from existing sessions. When values differ, ask which session should supply the initial shared preferences. Preserve all unapproved state and custom user settings. Do not restore cleared session data merely because a global onboarding marker exists: session data clearing and app-level shared-settings reset need explicit, documented semantics.

## Phase 3: maintenance, controls and rollout

Provide “Reset shared extension onboarding/settings” separately from “Clear this session’s website data.” Uninstall removes that extension’s app-level shared records; disabling or restricting access revokes shared-store access immediately. Version-incompatible adapters fail closed and preserve local data. Profile deletion removes subscriptions and pending work.

Roll out Wappalyzer onboarding behind a feature flag. Then add individually reviewed settings, followed by other adapters. iCloud Passwords and other credential extensions stay entirely isolated unless their vendor-supported model explicitly permits a reviewed integration.

## Required validation

- One welcome page across concurrent new sessions after a successful initial setup; none on restart with existing onboarding state.
- Real initialization failures remain visible; failed initial setup never marks onboarding complete.
- Legitimate update notice behavior survives upgrades, retries, downgrades and reinstall.
- Session A cookies, authentication, Wappalyzer hostname caches and detection results never appear in B.
- Only allowlisted settings propagate; unknown keys, wrong types, oversized values, wrong extension IDs, stale contexts and webpage IPC fail closed.
- Setting removal/clear, onChanged events, policy revocation, uninstall and resets have tested behavior.
- Unknown extensions and unreviewed versions retain isolated behavior without data loss.
- Measure cold-start time, worker count and store I/O with 1, 10 and 50 sessions. Reuse extension files and app-level preference metadata, but do not instantiate unopened session workers just to seed settings.

Implementation should begin with lifecycle-ordering and isolation tests, then the small Wappalyzer onboarding adapter. Acceptance requires both reduced welcome-page repetition and proven isolation; hiding the symptom alone is insufficient.
