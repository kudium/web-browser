# Gemini live workflow findings

November 8, 2026. Tested the user's connected `gemini-3.1-flash-lite` through
Google's OpenAI-compatible endpoint in the running Kudium app. Only disposable
localhost page content and synthetic chat notes were used. Credentials stayed
in the app. Measurements are the app's provider counters and rounded UI times.

| Workflow after fixes | Observed result | Input / output tokens | Requests / attempts | Time |
| --- | --- | --- | --- | --- |
| Simple query | Correct answer | 2,317 / 2 | 1 / 1 | 1 s |
| Form fill and Apply | Independently observed input and resulting status | 27,649 / 355 | 7 / 7 | 9 s |
| Code at end of 700-paragraph article | Correct code without user help | 29,111 / 180 | 5 / 5 | 6 s |

All three completed samples had zero streaming fallbacks. The form and article
reported 7,931 and 1,980 cached input tokens respectively. This is an exploratory
sample, not a randomized benchmark or evidence that every workflow is optimized.

## Fixes driven by live failures

- Google documents `stream_options.include_usage` for its compatible endpoint.
  Request it there so streamed replies report usage. Arbitrary compatible
  endpoints continue to receive no unsupported usage flag.
- Gemini emitted complete tool calls without delta indices. The initial parser
  rejected them before execution. Normalize complete, uniquely identified calls;
  ambiguous fragments/mixed formats fall back before any tool runs. Preserve
  opaque provider message/tool metadata, including signatures. A fallback-only
  intermediate form sample used five fallbacks and 11 attempts; the normalized
  sample used zero and seven. The earlier sample was resumed, so its 15-second
  time is not a matched baseline or reliable percentage improvement.
- The article task repeatedly scrolled and reread the document-text prefix, then
  asked which tools to use. It succeeded after an extraction hint. Truncated page
  observations now explain the prefix and targeted extraction recovery. A clean
  repeat found the final code in four tool calls without assistance. The earlier
  105-second sample includes waiting for assistance and must not be compared as
  pure model latency. An accidentally contaminated prompt is excluded in JSON.
- Durable notes survived an Electron restart. A follow-up recalled the label,
  applied a language correction and cleared resolved work, but omitted the label
  from the replacement notes. Memory guidance now puts stable project identifiers
  in decisions and moves relevant context out of resolved entries before deletion.
  A fresh two-turn repeat after another restart preserved the label and source,
  updated the language, and cleared resolved work. Its follow-up used 5,250 input
  and 69 output tokens, two requests, zero fallbacks, and about two seconds.
  Assistant-maintained memory remains fallible. Restart recall also had retained
  chat history; it does not isolate long-context memory effectiveness.

## Cost and remaining validation

Using Google's standard paid text rates ($0.25/M input, $1.50/M output,
$0.025/M cached input), the reported-usage estimates are about $0.00058 for the
query, $0.00566 for the form, and $0.00710 for the article. These are not invoices:
the user's tier is unknown, naming/failed/fallback requests and earlier paused
segments are omitted, and cache storage charges are excluded.

The simple query's 2,317 input tokens for a two-token answer and the form's seven
requests leave room to reduce fixed context and redundant observations. Measure
any smaller prompt/tool catalog against task correctness before promotion.

Next comparisons need at least three repetitions per condition, controlled
cold/warm caches, and additional configured providers. Include project edits,
long-chat omissions and corrections, refused review, and provider disconnection.
Native OpenAI Responses compaction/tool search and Claude native tool search
remain assessed candidates; no native comparison or adapter was delivered here.

Sources checked:

- [Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)

Full samples, failed criteria and measurement limits are retained in
[the numeric report](../benchmarks/ai-workflow-gemini-live.json).
