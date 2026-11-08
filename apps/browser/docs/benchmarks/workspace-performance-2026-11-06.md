# Workspace profiling and unused AI activity layer

November 6, 2026. Raw reports: `workspace-performance.json` and
`ai-activity-lifecycle.json`. Production readiness remains unproven.
Quality gates, failures and current source identities are in
`ai-activity-verification.json`.

## Result and implementation

The AI activity layer allocated a sandboxed renderer and a 50 ms interval at
browser startup, even without an AI task. It now creates the renderer on first
activity and runs the interval only while active. Handoff/Stop clears the interval;
resume reuses the loaded view. Disposal is idempotent and late activity cannot
recreate a disposed layer. Sandbox, input absorption and explicit takeover remain.

The actual old/new constructor test measures unused renderers **1 → 0** and
unused intervals **1 → 0**. The after native test verifies first-use pointer
feedback, rejects synthetic takeover clicks, accepts native trusted clicks,
maintains bounds/z-order, reuses the view and cleans up. Source/probe hashes and
runtime versions are recorded. The old constructor comes from Git revision
`de2eae3bdf2f346d66dc91a6ef5aeda9581c0603`, without changing the checkout.

## Whole-app observations

The profiler runs unchanged production main/renderer bundles in a disposable
staged layout with the production preload copied to Electron's unpackaged preload
path. Each fresh process uses its own prepared userData; profile seeding and
bundle copying are excluded from startup. Websites are local static 200-row pages
in independent login profiles. There are 30 warm selections and three one-second
idle intervals at each lazy, all-visited and tabs-closed stage. One-tab selections
are reselect controls, not real switches. Bundle identities are recorded.

The before run completed **26 of 30** planned cases: five launches per appearance
at one tab, four at 10 and 50. A fifth-repeat child timed out after initial page
readiness; frame disposal followed watchdog termination. Its cause is unverified.
Remaining cases are missing, not passed. No full rerun was attempted.

| Tabs | Before first-page startup median, glass / solid | Warm preference reads per 30 switches | All-visited summed working sets, glass / solid |
| --- | --- | --- | --- |
| 1 | 851 / 816 ms | 0 (reselect control) | 0.79 / 0.79 GiB |
| 10 | 836 / 851 ms | 600 / 600 | 1.80 / 1.79 GiB |
| 50 | 1,043 / 1,065 ms | 3,000 / 3,000 | 5.98 / 5.98 GiB |

Every successful launch created only the selected website view; saved tabs remain
metadata. Closing tabs removed all website views. At 50 profiles, application
`web-contents-created` listeners were 51 while the window existed and 50 after
window destruction. The dependency creates one extension router per persistent
profile. This establishes retained listeners, not an unbounded leak or the amount
of memory they retain. The solid-chrome preference changed CSS but native vibrancy
remained `sidebar`; a complete native materials comparison is still open.

A short after check used one 10-tab launch per appearance. All-visited summed
working sets were 1,563 / 1,567 MiB, compared with before medians of roughly
1,839 / 1,836 MiB. The unused activity renderer was absent from the contents
inventory. These are limited after observations, not a proven physical-memory
saving or a general startup/switching speedup. Preference reads remained 600.

Working-set sums double-count shared memory. GPU values measure the GPU process's
CPU/RAM, not hardware GPU utilization or VRAM. Static local pages do not represent
every real website. The after probe bounds double-requestAnimationFrame waits
and excludes timed-out presentation samples; the earlier before probe did not.
Consequently no before/after rendering-latency claim is made. Process-cold launches
do not imply a cold filesystem cache, fresh installation or signed ASAR execution.

An earlier partial attempt also stopped when the progress logger assumed the
one-tab reselect case produced IPC reads; zero-event counters are now handled.
That original partial result remains in `previousRuns`.

## Verification and next work

- Full unit suite: **132 suites / 667 tests passed**.
- Whole-project lint/types and production build passed.
- The new `ai-activity-lifecycle-smoke.cjs` constructor/lifecycle test passed
  before/after; its after checks run with `npm test -- --desktop`.
- The original `ai-activity-smoke.cjs` input regression is preserved unchanged
  and remains in the desktop checks. It fails with `UnknownVizError` on both
  baseline and current activity implementations. The cause is unresolved; this
  comparison does not establish a new regression, and the input gate is unverified.
- The broader AI-sidebar smoke initially failed at manual HTTP configuration:
  the fixture had not opened the explicit manual setup section. It also attempted
  model discovery using a synthetic key at a remote provider. The fixture now
  opens that section and uses a local model-discovery endpoint. A subsequent
  attempt waited on the new-origin approval; that single approval is now stubbed
  and restored locally. The final rerun reached takeover but failed its native
  webpage-focus assertion (`hostFocused: false`) despite its existing native
  activation calls. The cause is unverified. This broader smoke remains failed;
  its focus/handoff gate is not closed by the isolated activity-layer checks.

Next measured priorities are the repeated synchronous preference reads, native
solid-material behavior and persistent extension-router lifecycle. The broader
IPC/private-data and packaged-release gates remain open. Avoid repeating the
whole profiling matrix until an implementation needs that scope of comparison.

Reproduce the short check with `node .erb/scripts/workspace-performance.cjs after
--quick`; run the full matrix by omitting `--quick`. Native constructor comparison:
`Electron .erb/scripts/ai-activity-lifecycle-smoke.cjs --before`, followed by the same command
without `--before`. No saved-data format or migration changed.

November 7 follow-up: preference caching is now implemented and separately
documented in `preferences-2026-11-07.md`. The short production `.confirmation`
run records zero preference-file reads in both appearances, compared with 600
in each earlier `.after` run. Native materials and extension-router work remain
open; this follow-up makes no startup or memory improvement claim.
