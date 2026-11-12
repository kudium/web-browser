# Hooks: implementation and verification checklist

Goal: a user can choose a useful enhancement, enable it, see the result, and
recover when it fails. Code remains available without being the entry requirement.

Status: implementation delivered for all six work areas. Automated and native
verification are recorded below. Remaining unchecked items are live AI/provider
and broad website verification. API guide: [Using page hooks](hooks.md).

## 1. Reliable execution foundation

- [x] Give each hook execution its own identity, cancellation signal and cleanup registry.
- [x] Expose documented cleanup helpers through the runtime and IntelliSense.
- [x] Stop owned timers/listeners/observers and remove injected CSS on disable,
      replacement, navigation and tab closure.
- [x] Handle same-document navigation, including back/forward and SPA route changes.
- [x] Make route reruns explicit; prevent overlapping runs and duplicate effects.
- [x] Keep before-load semantics truthful: a route change is not a document load.
- [x] Attribute logs, errors and Activity outputs to the correct hook and run.

Acceptance:
- [x] Repeated runs leave one auto-scroll control and one owned timer.
- [x] Disabling a visual preset restores the page without requiring a reload.
- [x] Matching routes run; nonmatching routes clean up; back/forward works.
- [x] Slow or failed runs cannot publish stale completion status.

## 2. Presets without a code prerequisite

- [x] Add a compact preset picker with descriptions and previews where useful.
- [x] Include dark mode, accent colors, image URLs, auto-scroll and Activity examples.
- [x] Offer simple settings for presets that need them; validate required input.
- [x] Install a preset as a named, independently toggleable hook.
- [x] Enable and run it with one explicit action; avoid duplicate installs.
- [x] Keep custom JavaScript and existing saved examples accessible.
- [x] Explain site-dependent limitations briefly, behind hints where possible.

Acceptance:
- [x] A first-time user enables an enhancement without opening code.
- [ ] Presets work on representative static and dynamic pages.
- [x] Disable removes effects; reinstall does not stack controls or observers.

## 3. Save, run and feedback

- [x] Add an atomic Save & Run command: run only after persistence succeeds.
- [x] Preserve Save without running; make enable-and-run explicit for disabled hooks.
- [x] Show unsaved, saved, waiting, running, successful and failed states accurately.
- [x] Explain when a stage requires a reload and preserve page targeting.
- [x] Keep actions compact and reachable without scrolling the code.

Acceptance:
- [x] A failed save never executes the draft.
- [x] Saving and immediately running uses the newly saved code.
- [x] Disabled and nonmatching hooks never appear to have executed successfully.

## 4. Useful errors and AI repair

- [x] Include hook, stage, run and source location in runtime errors.
- [x] Link an error to the relevant editor line; preserve useful stack details.
- [x] Offer Fix with AI with the selected source and relevant error context.
- [x] Show a proposed diff and let the user apply or reject it.
- [x] Keep unrelated hooks and edits out of the repair.

Acceptance:
- [x] Syntax, runtime and timeout errors have distinguishable explanations.
- [x] Source locations account for the runtime wrapper.
- [x] AI repair never silently applies or runs generated code.

## 5. Recovery and history

- [x] Persist a bounded version history per hook, including timestamp and name.
- [x] Identify the last successfully executed version separately from the last save.
- [x] Add Restore previous version with a preview and clear confirmation.
- [x] Preserve recovery after restarting the browser.

Acceptance:
- [x] Recover from a broken save and verify the restored behavior.
- [x] Failed runs do not replace the last working version.
- [x] Restoring one hook does not change others or their enabled state.

## 6. AI setup from an outcome

- [x] Add a compact Ask AI entry point from the hooks page and preset picker.
- [x] Supply the current site and selected hook context; let users state an outcome.
- [x] Generate a reviewable hook name, target, stage, code and required settings.
- [x] Explain what triggers the hook and how to disable it before enabling.
- [x] Reuse the review/apply flow from AI repair.

Acceptance:
- [ ] “Notify me when this price changes” produces a reviewable setup.
- [ ] Required selectors or missing page information prompt useful clarification.
- [ ] Generated Activity links and source references point to the correct page/hook.

## 7. Finish and verify

- [x] Verify compact layout, narrow windows, light/dark themes and keyboard navigation.
- [x] Verify existing custom hooks and saved examples remain usable.
- [x] Run TypeScript, targeted lint and meaningful runtime/UI regression tests.
- [x] Exercise the complete choose → enable → run → inspect → disable → restore flow.
- [x] Update hook API documentation and completion declarations together.
- [ ] Record shipped highlights for the next requested release; publication is separate.

## Verification evidence

- 70 tests passed across 11 suites. Jest covers lifecycle cancellation, stale results, image cleanup, timeout cleanup,
  timer ownership, durable save failure, restart recovery, retained working versions,
  preset re-enabling, selected-hook restoration, AI prompt preparation and code diffs.
- Native Electron smoke test passed with sandbox and context isolation enabled:
  initial execution, CSS injection/removal, owned intervals, route filtering,
  back navigation, before-load semantics and live cleanup.
- Browser fixture reviewed with ego-browser at wide and 400/420px widths in light
  and dark themes. Verified preset installation and AI outcome prompt preparation.
  Corrected crowded tabs, header wrapping and overlapping controls during review.
- Live model generation, model repair quality and results on complex third-party
  sites remain a separate acceptance pass. Existing local AI review is reused.
- TypeScript passed. Hook-specific lint passed; broader touched-file lint still reports existing errors in Main.tsx and ai.ts.
- No release or publication was performed.

## Baseline before implementation

- Existing examples inserted source into the editor; the new Presets picker installs named hooks directly.
- Save and Run were separate; Save & Run now persists atomically before reloading.
- The preload executes before/after-load code and CSS, with a callback timeout.
- Added cleanup ownership, route lifecycle, version recovery and editor entry points for reviewed AI setup/repair.
- The compact editor and hint buttons are already implemented; they do not
  satisfy the lifecycle or first-use acceptance checks above.
