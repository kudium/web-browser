# Kudium Browser AI browser control — implementation handoff

Updated: November 5, 2026.

## Status

The current implementation is built and its targeted native regressions pass. The user has authorized a final implementation and validation pass. Full Ego parity and general performance superiority are **not established**. Resume future work from this document and the existing checkout; preserve unrelated staged and unstaged edits.

No commit, pull request, deployment, or replacement of the user's running Kudium Browser instance was requested. The existing service on port 43187 was left intact. At the user’s request, the running Gemini configuration was switched to `gemini-3.5-flash-lite` through Preferences; the key was not read or copied. Native fixtures use disposable profiles and separate ports.

## Implemented

| Area | Current behavior |
| --- | --- |
| Chat rendering | User messages have no redundant sender label. Native system font at 13px; sanitized GFM Markdown for assistant text: headings, task lists, tables, links, blockquotes and fenced code. Raw HTML disabled, image references open as links, safe external link handling. |
| Sidebar | Right-side AI panel below the tab strip; collapse animation, resizing, shared left-sidebar motion, clean controls, settings shortcut, no duplicate in-page panel. |
| Preferences | Dedicated AI page with model and external-control tabs; visible HTTP/stdio connection configuration and practical copy/enable/retry/resume controls. |
| Providers | OpenAI-compatible providers, Gemini, Claude, common Chinese provider presets and custom endpoints. Main-process keys; optional remembered keys use OS encryption. Live provider/model compatibility still needs broader validation. |
| External AI | Authenticated localhost MCP using the official SDK, dependency-free stdio bridge and agent guide. **40 MCP tools**; external control requires no model API key in Kudium Browser. |
| Permissions | Footer Ask first / Standard (default) / Full access; shared built-in/MCP approvals; temporary direct-human chat grants; get_access / confirmed request_access. Scope, takeover and target validation remain enforced. See ai-permissions.md. |
| AI context | All-groups/default or group scope in composer; enforced for built-in and MCP tools; editable unique group slugs, @group/page autocomplete, stable reference IDs, scoped tasks/checkpoints and same-provider model picker. See ai-group-context.md. |
| Browser sessions | Tab listing/selection/creation/navigation/history/reload/closure, shared signed-in sessions, website-created child tabs and lifecycle recovery. |
| Targeting | Isolated observations and snapshot IDs; stale/ambiguous/changed targets refused; nested/OOP frames, open shadow roots, geometry/coverage checks. |
| Interaction | Click/coordinate click, typing, native keys/chords, hover/double-click, scrolling/wheel, canvas paths, native select changes and paginated select-option reading. |
| Dragging | Native pointer drag and same-frame HTML DataTransfer drag; bounded cancellation and pointer cleanup. |
| Extraction | Structured `extract_rows` with named text/link columns, pagination, nested open components and assigned slots; shared traversal/output limits. |
| Files | Approved regular-file/folder selection, native FileList verification, bounded directory enumeration, downloads, artifact validation and reattachment. |
| Dialogs | Owned website dialog receipts and approved responses; pending receipts recoverable through tab listing. Native save-picker handoff paths tested. |
| Vision | Webpage-only PNG capture, bounded fallback, provider image serialization and limited retained image history. Local-provider transport verified; live-model visual task quality unverified. |
| Recovery | Bounded inference retries without replaying tool effects; Stop; human handoff; built-in Continue task checkpoints for 15 minutes, including Take over and native typing interrupts; Stop discards checkpoints; status/window recreation recovery within the same process; bounded reply-history replay after renderer recreation. Paused checkpoints also persist across processes using OS encryption, with no plaintext fallback. |
| Takeover | Take over/Stop wait for bounded held-pointer cleanup. Native typing interrupts active webpage AI work without consuming the first character; unmodified Escape consumes the interrupt key; external AI stays paused until resumed. |
| User-requested resume | External AI can call `resume_control` after the user asks to continue. Local confirmation approves resumption; declining keeps control paused. External clients retain their task context. Built-in paused tasks use Continue task or explicit composer requests such as “resume”, “please continue the task”, and “continue please”. Other prompts start a new task. |
| Fresh state after resume | External and built-in recovery require tab discovery and a fresh page observation before resumed page actions. Extraction, screenshots and target lookup do not unlock page actions. |

`resume_control` is external-only and excluded from the built-in provider tool list (39 built-in tools).

## Latest validation

Final pass: all 82 unit suites and 359 tests passed, including checkpoint encryption, takeover recovery, renderer reply history and capture-loss resize regressions. TypeScript and targeted ESLint passed. The general native browser smoke now passes after repairing stale test selectors and the real capture-loss bug. The extension observer leak was traced to the dependency, patched, and verified with a 100-cycle listener-count regression; native smoke no longer emits the observer warning. Final production build, unit checks and all desktop component scripts passed. Refreshed unsigned macOS arm64 package succeeded at `release/build/mac-arm64/Kudium Browser.app`; log: `/tmp/kudiumbrowser-final-package.log`. The full desktop command encountered foreground typing in the address fixture; the corrected general smoke was rerun successfully at `/tmp/kudiumbrowser-browser-final-confirmation.log`. Component results and build are in `/tmp/kudiumbrowser-release-final-checks.log`. Do not describe that earlier combined command as exit 0.

| Check | Evidence |
| --- | --- |
| User-requested external resume | `.erb/scripts/mcp-smoke.cjs --resume-only`: declined/approved resume, preserved pause, stale actions refused before approval, fresh read and original action completion. `/tmp/kudiumbrowser-external-resume-native.log` |
| Full native MCP regression | `--oop-frames`: official client, real page actions, OOP frames, files/dialogs, cancellation, auth and stdio. `/tmp/kudiumbrowser-external-resume-regression.log` — exit 0 |
| Built-in handoff/recovery | `.erb/scripts/ai-smoke.cjs --handoff`. `/tmp/kudiumbrowser-external-resume-provider.log` — exit 0 |
| Unit checks | Recovery, tool schemas and protocol: 18 tests passed. Separate interrupt/protocol/dialog milestone: 22 tests passed. These are targeted checks, not a claim that the entire repository suite ran. |
| Static/build | TypeScript, targeted ESLint and production build passed. `/tmp/kudiumbrowser-external-resume-build.log` — exit 0 |
| Escape boundary | AI CDP Escape does not self-interrupt; native Escape interrupts a drag. Pending website dialogs can block the hook on macOS; trusted Take over cancels them. `/tmp/kudiumbrowser-escape-interrupt-native.log`, `/tmp/kudiumbrowser-escape-dialog-native.log` |
| Extraction limits | Main/OOP nested components and a real 50,000-node traversal limit. `/tmp/kudiumbrowser-shadow-extraction-native.log`, `/tmp/kudiumbrowser-shadow-extraction-budget.log` |

Temporary logs may disappear. Reproduction scripts and the detailed milestone history are retained in the repository.

## Live Gemini final pass

The user configured the Gemini key. Refreshed the provider model list successfully and saved `gemini-3.5-flash-lite` through the UI. On November 5, a real-model task opened a new Example.com tab, read it and requested a screenshot. Its final reply reported the title “Example Domain” and dark gray/near-black background. Both matched the native app view. The key was not read or copied. Existing tabs were retained. This closes one small DOM/vision workflow for this model, not broad provider/task coverage.

## Measured optimization

- Historical 31-tool schema measurement: 103,829 → 15,429 serialized bytes (85.14% reduction), 992 → 104 parameter occurrences. Tool additions change current numbers. This is not a token, billing or inference-speed measurement. Report: `docs/benchmarks/ai-tool-schema-benchmark.json`.
- Controlled asynchronous form, 20 interleaved workflows per browser: Kudium Browser median/p95 122.0/131.1 ms; Ego 1031.9/1147.4 ms. Five public calls each; local fixture, approval stubbed, inference/startup excluded. This proves an advantage on that workload only. Report: `docs/benchmarks/ai-ego-comparison-dynamic-compact-wait.json`.

## Remaining work

| Priority | Work | Evidence needed to close it |
| --- | --- | --- |
| P1 | Live-model completion across supported providers, including visual tasks | Real selected models complete representative DOM/vision tasks and verify results; transport fixtures alone are insufficient. |
| P1 | Automatic human-input arbitration | Physical keyboard/mouse tests, safe interruption during held pointers and approvals, no false interruption from AI input. Native keyboard arbitration is implemented. CDP/native mouse hooks still lack a reliable origin distinction. |
| Implemented; QA remains | Full app-process restart recovery | Encrypted checkpoints and external pause markers persist. Two fresh Electron processes verified native OS-encrypted save/restore. Actual installed-app end-to-end task continuation remains to be verified; paused storage save/restore passed in two fresh native Electron processes at `/tmp/kudiumbrowser-final-restart.log`. |
| P1 | Practical login/CAPTCHA/native-prompt handoff | End-to-end human handoff/resume in representative workflows; no password entry or CAPTCHA bypass by AI. |
| P1 | Packaged/release and platform QA | Validate the packaged app, actual installed build, supported platforms and required repository checks. Existing macOS fixtures do not prove cross-platform behavior. |
| P2 | Broader control surface | Cross-frame/document/external-file drag, unsupported 3D/perspective transforms, rich clipboard input, arbitrary evaluate/request APIs and closed-root access remain open. |
| P2 | Lifecycle reliability | Ordinary pre-existing dialogs/pickers, long activation expiry, interrupted networks/session destruction and broader listener accounting. |
| Closed | Explicit resume UX | Built-in composer resume/continue requests reuse the checkpoint without replaying the original prompt. Different task prompts remain new tasks. External agents have resume_control. |
| P2 | Extraction consistency | Coherent pagination across changing DOMs and broader structured data workflows. Current pagination reads live composed DOM and can shift when it changes. |
| P2 | Broad Ego comparison | Varied real workloads, cold and steady state, failures/retries, round trips and payloads; avoid claims of general superiority from the existing single workload. |

## Current remaining verification

Automatic mouse takeover remains open: Electron reports native and CDP mouse events without a reliable source marker. Keyboard takeover, Escape and explicit Take over are implemented. Windows/Linux native validation is unavailable on this macOS host. Full installed-app restart continuation and broader live task/provider validation must be completed before declaring full parity.

## Next work session

1. Choose a representative real task and validate it with a live model and the packaged app.
2. Address the highest-impact failure found; keep the remaining parity scope intact.
3. Expand comparative measurement only after that workflow is reliable.

The extension adapter now deduplicates main-process observers and detaches their destruction listeners on unsubscribe; 100 mount/unmount cycles and native smoke verified no observer leak warning.

New regression coverage: encrypted checkpoint expiry/corruption/size/no-plaintext behavior, two-process native storage, takeover checkpoint preservation, renderer reply history and sidebar drag capture loss. Reproduction: `.erb/scripts/ai-checkpoint-restart-smoke.cjs` with a disposable profile and separate save/restore processes.

Detailed history: `docs/specs/ai-control-parity.md`. External setup and examples: `mcp/README.md`. Do not mark the broader goal complete based solely on this handoff or existing fixture passes.

## Visible activity and takeover — November 5 follow-up

Implemented an animated transparent native view over the working webpage. It intercepts human mouse clicks/wheel and keyboard input, requests pause, and waits for owned-input cleanup before returning control. Agent CDP input targets the underlying page, bypassing the shield. The layer follows page bounds and disappears on completion/handoff. The horizontal tab shows an animated AI icon, with reduced-motion support. Tool targeting follows the agent’s working tab rather than subsequent user tab selection. `select_tab` now waits for selection confirmation and brings the host/tab forward.

Built-in completion publishes authoritative checkpoint availability, removing stale Continue controls. Fresh tasks retain six bounded user/assistant conversation entries. Action requests with no successful action report that no action was performed instead of displaying a model’s completion claim. This guard does not independently prove that a successful action accomplished the full user intent; the model must still observe and verify results.

Added approved `set_page_appearance` for temporary background/text colors. It runs a fixed program in an isolated, bounded protocol context and reports the computed background. Changes reset on navigation/reload.

Validation: `.erb/scripts/ai-activity-smoke.cjs` passed agent CDP click routing, native synthetic click/wheel takeover interception without underlying page effects, bounds, visibility and disposal. `.erb/scripts/ai-visible-actions-smoke.cjs` passed actual background mutation, screenshot, activity events, follow-up conversation, explicit tab focus, terminal checkpoint clearing and rejection of a no-action completion claim. Existing `.erb/scripts/ai-smoke.cjs --handoff` passed. Targeted ESLint passed.

Remaining verification: `ai-activity-smoke.cjs --os-mouse` could not post macOS events because `CGPreflightPostEventAccess()` returned false. Physical mouse routing still requires a manual test or event-posting permission. The personal running app was not restarted; its existing session has not loaded this new build. The previously packaged app predates this follow-up. Broad live-model task success and cross-platform physical input remain unverified.

Final follow-up checks: all 82 unit suites / 360 tests passed; TypeScript and targeted ESLint passed. The wheel regression exposed missing Electron hook coverage and now passes using a trusted wheel listener on the isolated activity view. Production build was refreshed for this follow-up.

## Saved tasks

The initial Tasks milestone now adds encrypted saved definitions and bounded run history, manual/once/interval runs, schedule controls and existing checkpoint Continue/Stop integration. See [AI Tasks specification](ai-tasks.md) for implementation, tests and the remaining agent/terminal milestones. Scheduling requires an open visible browser window and available configured provider; it cannot bypass human takeover or browser approvals.

Task creation now supports a natural-language AI draft, optional form details, daily local-time schedules and confirmed `create_task` calls from chat/MCP. See the Tasks spec for native and visual regression evidence.
