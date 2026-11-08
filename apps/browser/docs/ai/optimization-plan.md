# AI flow improvement plan

Reviewed and started November 8, 2026.

## Objective

Reduce context overhead and waiting time while preserving task completion quality,
user constraints, browser target freshness, disclosure review and pause/resume.
Measure provider usage before making cost or latency claims.

## First delivery: implemented

- **Measure usage.** Replies expose an expandable AI usage panel with actual
  provider input/output tokens, cache reads/writes when supplied, completed model
  requests, tool calls and elapsed time. Counts cover the agent run, including
  discovery. Chat naming, failed retries and earlier paused segments are excluded.
  Missing usage is shown as unavailable, not an estimated zero. Numeric counters
  stay with the encrypted conversation; no remote analytics or prompt logging.
- **Defer optional tools.** Keep core browsing tools and a `discover_tools`
  function available. Load project, skills, tasks, personal data, customization,
  downloads and advanced interaction families when requested by the model.
  Discovery performs no action and changes no permissions. Definitions persist
  within a run and are reconstructed from checkpoint calls on recovery.
- **Preserve cache prefixes.** Keep core instructions stable, place the changing
  clock afterward, and use an explicit ephemeral breakpoint on the first Claude
  system block. Other compatible endpoints receive no provider-specific flags.
  New tool-family discovery changes the catalog and can reset cache reuse; after
  discovery its order stays stable.
- **Read smaller page context first.** Built-in `read_page` defaults to compact
  format and 6,000 text characters; explicit requested format and limits remain
  supported. Encourage targeted element lookup and row extraction. Public/MCP
  page defaults remain unchanged.
- **Trim superseded observations.** Above a 64,000-character heuristic, shorten
  large older page/tab/options/frame observations only when a newer successful
  read exists for the same target. Keep a marked historical excerpt. Preserve
  user messages, tool-call/result protocol, private data, effects, errors and
  unsuperseded results. This is conservative pruning, not semantic summarization
  or a guarantee of fitting every model's context window.
- **Improve progress.** Use readable activity labels, retain only the latest
  transient status in the UI, and exclude old suggestion metadata from history
  sent on subsequent requests.

Local baseline: 59 full tool definitions, 35,169 serialized schema characters.
Initial deferred catalog: 22 definitions (including discovery), 9,160 characters.
That is about 74% fewer schema characters initially; it is not a measured token,
API bill or latency reduction. Discovery adds a model roundtrip and loading every
family can cost more than eager loading for short tasks. Compare end-to-end runs.

## Second delivery: implemented

- **Streaming replies.** Native Claude and compatible Chat Completions can stream
  text while inference runs. The parser assembles complete tool calls, usage and
  reasoning before returning a payload to the executor. Partial text is transient,
  excluded from saved chat/checkpoint history, cleared on interruption/retry and
  replaced by one final reply. Suggestion metadata is hidden until completion.
- **Compatibility fallback.** Providers that explicitly reject streaming, or emit
  structured reasoning deltas the parser cannot preserve, fall back once to the
  complete JSON transport under the same deadline. Ordinary API failures are not
  mistaken for incompatibility. This extra inference can cost tokens; failed
  attempts remain excluded from the displayed usage totals.
- **Protocol checks.** Require completion markers, closed Claude content blocks,
  valid complete JSON tool arguments and unique IDs. Preserve native Claude
  thinking signatures and compatible reasoning text. Reject truncated responses
  before executing tools, in both streamed and nonstreamed modes. Stop cancels
  a stalled reader; completion does not wait for the network connection to close.
- **Conversation continuity.** Replace six-message/4,000-character cuts with a
  24,000-character soft budget of whole messages. Retain the original user request,
  latest user message and latest assistant reply, then recent exchanges and earlier
  user constraints as space allows. Those essential messages can exceed the soft
  budget. Display an explicit omission notice; do not invent a summary. This can
  use more input tokens than the old cutoff in exchange for retaining constraints.
- **Completion evidence.** Remove the verb regex that rejected requests such as
  “create a plan” when no browser action occurred. Track observations, applied
  effects, verified file-write receipts, command launches, inspected output,
  tool errors and unresolved dialogs. Before finishing, an unreviewed command
  triggers one request to inspect its existing terminal rather than restart it.
  Final unresolved commands/dialogs or a failed final tool flag the run as needing
  attention. Work performed details distinguish an applied action from verified
  completion; they are not an independent judge of the whole task.
- **Reading during streaming.** Auto-scroll follows the reply while the reader
  stays near the bottom, and stops when they scroll up. Partial text does not
  repeatedly announce through the screen reader live region; final replies do.
- **Drafting during work.** The existing composer already accepts and saves a
  next-request draft during a run. Its working-state placeholder now explains
  that behavior. Sending the draft remains a deliberate user action.

Recovery reconstructs tool receipts without replaying effects. The third delivery
below adds actual command-scoped exits; legacy receipts still have unknown status.

Validation uses controlled fragmented SSE fixtures, native Claude signatures,
UTF-8 chunk boundaries, incomplete streams, truncation, cancellation, fallback,
whole-message history, command receipts, dialogs and sidebar partial/final state.
These tests do not constitute live provider/model quality or cost benchmarks.

## Remaining interaction and memory work

- Evaluate durable task notes against long-chat corrections and unresolved work.
  Assistant-maintained notes may be wrong or omitted by the model.
- Broaden model-independent verification of browser goals. An applied click alone
  does not prove a workflow succeeded.
- Evaluate explicit queueing or mid-run steering separately from editable drafts.
- Measure total billed tokens separately from successful agent-request counters.
  Attempt/fallback counts and first-text timing are now available.

## Third delivery: implemented

- Commands and saved action scripts run in a dedicated login-shell command
  process, rather than being written into an interactive shell. A command receipt
  identifies its process, start/end time, status and exit code. Stopped processes
  and unfinished processes restored after restart are interrupted, never successful.
  Interactive terminal input still works separately. Command processes do not
  inherit an existing interactive shell's state. A successful exit is process
  evidence, not proof that all requested product behavior works.
- Command tracking requires matching receipt IDs and reviewed output. An open
  shell or a success-looking log cannot certify completion. Nonzero exits and
  interruptions remain visible even after later successful observations. Legacy
  commands without receipts remain unconfirmed. Recovery never replays commands.
- A built-in chat-only `update_task_memory` tool maintains decisions, unfinished
  work and source references. Each list has at most eight 400-character notes,
  with a 6,000-character serialized cap. Notes persist in encrypted chats, survive
  context omission, and can be inspected/cleared in the sidebar. They are assistant
  context, not system instructions, Personal Data, permissions or current state.
  Current user instructions win. The original request is retained when the
  100-message history rolls over. This does not preserve every intervening
  constraint forever; important notes and sources still need verification.
- Usage now includes actual HTTP attempt counts, streaming fallbacks, successful
  requests reporting usage, and first nonempty model-text time. Token totals
  still omit failed/fallback attempts, naming and prior paused segments. The UI
  explicitly describes these limits rather than presenting a complete bill.
- Added a disposable workflow evaluator and real process smoke test. The fixture
  evaluator passed 12/12 checks; real process success/failure/interruption passed.
  These establish local implementation/harness behavior, not live model quality.
  [Evaluation instructions and native capability assessment](workflow-evaluation.md)
  describe the provider setup, measurements and remaining comparison work.

## Subsequent delivery: provider-native capabilities and evaluation

Exploratory live Gemini validation is now recorded in
[live findings](gemini-live-findings.md). Streaming usage and complete unindexed
tool calls work with the connected provider; truncated observations guide
targeted recovery. Saved notes survived restart; a context omission during note
replacement led to stronger preservation guidance. This remains a small sample,
with no established cross-provider or total-billing savings.

1. Add a capability-gated OpenAI Responses adapter, then evaluate native tool
   search, compaction and structured output. Keep compatible Chat Completions
   transport available for other endpoints. Model/API compatibility must be
   explicit; do not send Responses-only fields to existing endpoints.
2. Evaluate Claude native tool search and context editing using supported models
   and API versions. Compare these against provider-neutral discovery/pruning.
3. Evaluate a short stable core prompt plus loaded workflow instructions. Retain
   enforcement in application code and ensure safety requirements do not disappear
   when a workflow is deferred.
4. Benchmark provider/model choices for browser tasks rather than automatically
   changing the user's chosen model. Consider cheaper chat naming or deterministic
   naming separately; record its usage independently.
5. Run a repeatable fixture suite: simple tab query, navigation/form interaction,
   long page summary, project edit plus verification, long conversation, refused
   review, disconnected provider and paused/restarted task.

Compare completion rate, false success, repeated actions, input/output/cache
tokens, discovery calls, total model rounds, time to first text and time to verified
completion. Keep cost claims tied to provider pricing and real reported usage.
Retain fixtures with synthetic data and controlled review; live evaluations use
explicitly selected accounts and task scope.

## Research used

- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching):
  structure stable shared context for reuse and measure cache behavior; fewer
  context tokens and cheaper cached tokens are different optimization targets.
- [OpenAI tool search](https://developers.openai.com/api/docs/guides/tools-tool-search):
  deferred tools are discoverable on demand; the documented native integration
  uses Responses/Agents APIs rather than the app's current compatible transport.
- [Claude tool context management](https://platform.claude.com/docs/en/agents-and-tools/tool-use/manage-tool-context):
  combine deferred tools, caching, old-result editing and programmatic calling
  according to the source of context pressure. Discovery trades a lookup round
  for a smaller initial catalog.

The delivered implementation follows these principles across existing providers.
Native API migrations and model changes are separate evaluated deliveries.

Streaming protocol references checked for the second delivery:

- [OpenAI streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Claude streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
