# AI workflow evaluation

November 8, 2026. Local checks and exploratory live workflows now cover the
connected Gemini 3.1 Flash-Lite model. Live testing found and fixed streaming
compatibility and long-page retrieval problems. Broad provider quality and cost
improvements are not yet established. See the [live findings](gemini-live-findings.md)
and [numeric samples](../benchmarks/ai-workflow-gemini-live.json).

## Repeatable runner

From `apps/browser`, run:

```sh
./node_modules/.bin/electron .erb/scripts/ai-workflow-evaluation.cjs --fixture
./node_modules/.bin/electron .erb/scripts/ai-command-receipts-smoke.cjs
```

The first runner uses the production AI loop, disposable real Electron pages, and
a scripted compatible provider. Three rounds cover a simple query, form filling
and observed status, a long article with an answer at its end, and two-turn
continuity. Synthetic usage is deliberately marked in the JSON report. The
second runner uses actual node-pty processes to check successful exit, failed
exit, and interruption independently of model claims.

Live mode reads `KUDIUM_AI_EVAL_CONFIG`, the path to a JSON file with an array:

```json
[
  {
    "endpoint": "https://api.openai.com/v1",
    "model": "YOUR_SELECTED_COMPATIBLE_MODEL",
    "keyEnv": "KUDIUM_EVAL_OPENAI_KEY"
  },
  {
    "endpoint": "https://api.anthropic.com/v1",
    "model": "YOUR_SELECTED_CLAUDE_MODEL",
    "keyEnv": "KUDIUM_EVAL_CLAUDE_KEY"
  }
]
```

Supply credentials through the named environment variables; do not put keys in
the configuration or commit them. Running without `--fixture` makes paid API
requests against those explicitly selected providers:

```sh
./node_modules/.bin/electron .erb/scripts/ai-workflow-evaluation.cjs
```

Optional `rates` fields specify USD per million tokens: `input`, `output`,
`cachedInput`, `cacheWrite`. Use rates verified for the selected model and cache
TTL. Without rates, cost stays unavailable. Estimates cover only reported usage,
never the full invoice. Chat naming, failed/fallback attempts and paused segments
are excluded. `usageComplete` checks successful request coverage and whether
extra attempts occurred; it does not include chat naming or certify total billing.

The runner stores correctness, token/cache counts, request attempts, streaming
fallbacks, first text time, and elapsed time. It records setup usage separately
for continuity. It saves no credentials, prompt/response text, or user profile.
Fixture reviews are auto-accepted and exclude human approval time. Fixture page
network requests are restricted to the disposable localhost server. This is a
small repeatable baseline; extend it with long-context corrections, project edits
and observed verification, refused review, failures, and restart recovery before
making broad reliability claims. Use at least three repetitions, label cold/warm
runs, and inspect failed samples rather than averaging them away.

## Native capability assessment

Official documentation was opened and checked for this assessment:

| Candidate | Fit with the current app | Work needed before comparison |
| --- | --- | --- |
| [OpenAI tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) | Responses API with supported models; the current compatible transport uses Chat Completions. Native discovery appends loaded tools to context to preserve caching. | Add an explicit Responses adapter and complete output-item/stream/recovery support. Group deferred tools into small namespaces. Keep local execution and permission enforcement. |
| [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction) | Responses-only context-management protocol with opaque encrypted compaction items. These cannot be converted into ordinary chat summaries. | Persist canonical response items and compaction state in encrypted checkpoints, bind them to provider/model, and preserve exact user constraints outside summarized state. Use `store:false`; handle standalone compact output as the canonical next window. |
| [Claude tool search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) | Available for documented Messages API models; versioned regex/BM25 tools plus deferred definitions differ from the app's current client discovery. | Gate by documented model/API support. Preserve server tool/reference blocks through streaming and recovery before enabling native search. |
| [Claude context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) | Model-dependent beta context-management strategies can clear older tool results and thinking. Current pruning preserves more evidence conservatively. | Gate beta headers and strategies. Exclude critical receipts, unresolved results, and private-data boundaries from clearing; test cache invalidation and pause/restart. |

Decision: keep provider-neutral discovery and pruning as the production default.
Native features are candidates for an isolated capability-gated adapter, not flags
to add to arbitrary compatible endpoints. No native provider comparison has run.

Compare baseline, native tool search only, native compaction only, then both on
the same selected model and fixture set. Match task scope, context, permission
policy, and cold/warm cache conditions. Count discovery/compaction requests and
fallback attempts in total cost. Promotion requires equal or better correctness,
no false successful completion, no repeated effects after recovery, and a measured
end-to-end cost or latency benefit. Record negative results too.
