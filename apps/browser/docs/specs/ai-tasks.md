# AI Tasks and developer automation

## Goal

Make TouchBox a practical browser automation workspace: save a task, run it now or on a schedule, inspect its result, and take control whenever needed. External coding agents can continue using MCP for browser verification alongside their own file and terminal tools.

## Product design

The AI sidebar has Assistant and Tasks views. Tasks use compact rows, an explicit New task form, and expandable run history. A task contains a name, instructions and a schedule (manual, once, or interval). Provider/model/key stay in AI Preferences. No credentials in task forms.

A saved task starts a fresh conversation using its instructions. The current browser session is the execution environment in milestone 1; tasks must discover tabs before acting. One controller owns the browser at a time. Existing approval, page activity, takeover, Stop and human handoff apply. Scheduling never grants additional permission for purchases, account changes or messages.

## Milestones

1. **Persistent browser tasks — implement first.** Save/delete tasks; manual run; one-time and interval schedules; enable/disable schedules; encrypted local storage; bounded run history with completed, failed, paused, stopped and interrupted results; sidebar management. Schedule runner operates only while TouchBox and its browser window are open, a key is configured, and no controller/checkpoint/human takeover owns the session. Coalesce missed interval runs rather than replaying a backlog. Show schedule dates in local time; persist timestamps in UTC. A restart records in-flight work as interrupted and does not replay it automatically. Continue a paused browser task using the existing checkpoint within its expiry.
2. **Named agents and durable jobs.** Agent profiles with reusable instructions, explicit session assignment and provider selection; queued jobs; longer encrypted checkpoints; explicit retry/resume semantics after restart and notification preferences. Keep credentials separate. Add completion/attention notifications and deep links to task/tab. A task result is a model report, not proof of arbitrary website correctness.
3. **Developer workspace terminal.** Explicit selected workspace; commands, bounded output, cancellation, timeout and process cleanup; trusted local approval; separate command permission from browser permission; no shell access from page content. Integrate a dev-server/build/test workflow before granting unattended shell execution. Prefer existing external coding agents over duplicating an IDE.
4. **Web monitoring and integrations.** Saved extraction baselines, change detection, quiet notifications, task templates, MCP task management with explicit authorization, exportable run artifacts, deployment triggers. Outbound messaging requires user authorization.
5. **Multiple agents.** Separate browser sessions and task ownership, concurrency budgets, isolated histories, conflict prevention and coordinated handoff. No simultaneous controllers in one session.

## State and scheduling

A task definition is separate from its run records. Runs transition running → completed/failed/paused/stopped/interrupted. Definitions may be disabled without deleting history. A manual run does not change a future schedule. Once schedules disable after dispatch; intervals set the next time from dispatch and never flood missed work. If a controller is busy, due work remains due. Human takeover pauses execution and blocks scheduled work until explicit resumption. Stop discards the browser checkpoint. Paused work never auto-resumes.

Bound definitions to 100 and history to 20 runs per task. Save encrypted data atomically with restrictive file permissions. Reject invalid timestamps, intervals below one minute and oversized instructions. No API keys in task records. On persistence failure, show an error rather than falsely report saving. Closing the window disposes the scheduler and aborts active work. This is an in-app scheduler, not an OS background service.

## Acceptance checks for milestone 1

- Create a task, reload/restart and see its definition and result history.
- Run it against a deterministic local provider and observe actual browser effects.
- Due schedules execute once; interval misses coalesce; busy/human-control/key-unavailable states defer execution.
- Restart converts running history to interrupted; no automatic replay.
- Deleting or changing the schedule state of running/paused work is refused. Editing task definitions is deferred; create a replacement task.
- Pause/resume keeps the same run; Stop marks it stopped; failure does not look completed.
- Tasks IPC is available only to the trusted main browser renderer; page/foreign-window calls fail.
- Test scheduling/state/persistence and UI paths; run TypeScript/lint and build.

## Implementation status

Milestone 1 is implemented: encrypted task definitions/history, trusted Tasks IPC, compact sidebar Tasks view, manual/once/interval execution, schedule enable/disable, same-run Continue and Stop, fresh browser observation for saved tasks, and interruption handling. Restarted interrupted schedules disable until explicitly enabled. A schedule storage failure stops the scheduler and reports an error rather than retrying endlessly. The first version uses the configured provider and current session. Definition editing and rich artifact history are deferred.

Validation: 85 unit suites / 373 tests passed, including schedule coalescing, unavailable sessions, once dispatch, overlap prevention, paused run continuity, interrupted restart/disposal, history bounds, encryption and UI controls. TypeScript and targeted ESLint passed. Native `.erb/scripts/ai-visible-actions-smoke.cjs --saved-task` verified saved-task browser effects and encrypted storage; `--saved-task-handoff` verified a paused saved task resumes the same run; `--saved-schedule` verified actual one-time scheduler dispatch, completed history and schedule disabling. All modes also reject foreign-window Tasks IPC. These use disposable profiles and a deterministic provider, not the personal app or a live Gemini task. Production build refreshed. Whole-process restart of this Tasks UI and physical mouse takeover remain separate manual checks.

Milestones 2–5 remain planned: named agent profiles, queued durable jobs, notifications, session assignment, terminal tools, monitoring integrations and multiple agents. No OS background scheduler or terminal execution is exposed. The running personal TouchBox instance was not restarted to load this implementation.

## Natural-language task creation

The form now defaults to a plain-language request. AI generates a draft name, browser instructions and timing; the user reviews it before Save task. More options hides name and schedule/date overrides. Requests without a time remain manual; ambiguous or unsupported timing produces a clarification instead of an invented schedule. Generation calls the configured provider without browser tools executing or saving anything.

The `create_task` browser/MCP tool lets chat create a saved task after a local confirmation showing the concrete name, instructions and schedule. Saving future work does not execute it now. The tool is available even with no selected webpage; external clients do not require a model key in TouchBox. Draft generation in the form requires the configured AI key.

Timing now includes one-time ISO dates with timezone offsets, anchored intervals with an optional first run, and daily HH:mm schedules in the computer’s local timezone. Daily next-run calculation follows local calendar dates across clock changes; delayed intervals preserve their start anchor. Other calendar rules require clarification and are not implemented.

Validation for this follow-up: 85 suites / 375 tests passed. TypeScript, targeted ESLint and production build passed. `.erb/scripts/ai-task-creation-smoke.cjs` verifies AI draft, daily timing, clock context, ambiguity, confirmed chat creation, encrypted persistence and no immediate future-task execution. `.erb/scripts/ai-task-form-smoke.cjs` verifies optional fields start collapsed and the focused name input stays inside the scroll clip at widths 300/380/580 pixels; screenshot `/tmp/touchbox-task-form.png` was inspected. These use disposable profiles and a deterministic provider, not a live Gemini request. The running personal app was not restarted.
