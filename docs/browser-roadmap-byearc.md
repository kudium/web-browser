# Browser feature delivery checklist

Source: https://byearc.com/browsers/kudium/ (reviewed 2026-11-17).
The listing describes stable 1.0.17 and source 3702e5c; some extension evidence
predates the working uBlock fixture. A partial comparison score does not imply
that an existing feature should be replaced.

## Required delivery

- [ ] Built-in protection: maintained ad/tracker lists, local matching, atomic
  cached updates, unavailable/stale status, per-site exceptions and breakage recovery.
  Compose with existing request rules; never replace permission/security hooks.
- [ ] Extension reliability: run actual MV3 worker/filtering and password-manager
  fixtures; report implemented API coverage and unresolved vendor behavior.
- [ ] Seamless workspace sync: stable identities, deletion/conflict semantics,
  device status and incremental reconciliation without overwriting local work.
  Preserve encryption and manual recovery; never sync cookies or local project paths.
- [ ] Link routing: ordered hostname rules with optional subdomains, target Space
  and group, enabled state and a testable preview. Missing destinations fall back
  safely; changing an external link's destination must not alter its URL.
- [ ] Native passkeys: package the supported runtime for arm64/x64, verify browser
  entitlement, registration/authentication/cancellation and security-key PIN behavior.
  The patched Chromium/Electron build tooling conservatively checks for 100 GB
  free for source, dependencies and intermediate files. This is not a measured
  minimum or installer size. This Mac currently has 19 GB free.
- [ ] Peek: temporary link preview with URL, close and keep-tab actions; reuse the
  source login and permission handling, preserve the source page and discard preview
  state on close. No privileged browser bridge is exposed to website scripts.
- [ ] Clean link copying: shared URL utility, page/link context menus, remappable
  Command/Control+Shift+C, signed URL preservation and exact remaining query bytes.
- [ ] Automatic PiP: opt-in preference, playing-video selection, muted-loop exclusion,
  return-to-tab cleanup, manual-player preservation and rapid-switch race tests.
- [ ] Diagnostics opt-in: default off, preserve saved choices, accurate privacy copy.

## Follow-up features

- [ ] Nested collections with consistent move/import/export/search behavior.
- [ ] Optional Space default login; retain group-level overrides and existing cookies.
- [ ] Live folders, beginning with GitHub pull requests and RSS; explicit connection,
  polling limits, stale state and disconnect controls.
- [ ] Small external-link window with a keep-in-workspace action.
- [ ] DRM: document the licensing/runtime route before promising protected playback.
- [ ] Crash recovery and atomic versioned workspace backups (existing completeness spec).
- [ ] Reputation protection, Reader Mode and translation (existing completeness spec).

## Validation and publication

Use disposable profiles, local fixtures and public pages. Full account sign-ins
need a separate authorized check. Test actual browser surfaces and lifecycle errors,
not only appearance or successful installation. Never use hosted Actions.
Completed source changes, successful local builds and published installers are
separate statuses; installer publication requires the release workflow.
