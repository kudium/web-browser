# Assistant tool discovery

The provider receives a compact directory derived from registered tools. Detailed optional schemas load by capability family or short intent query. Unclassified registered tools remain directly available, so adding a tool cannot silently hide it.

Capability membership, keywords and workflow bundles live in `apps/browser/src/browser/aiToolCapabilities.ts`, next to provider schemas. When adding an optional tool, add its capability membership there. Regression coverage checks that every provider tool is directly available or advertised in the directory.

Only the latest user prompt triggers automatic workflow loading. Website content and tool observations do not trigger automatic loading. Loading exposes schemas; it never executes an action or changes scope/review rules. Common hook, scheduling and research-note requests load narrow bundles. Exact-name searches load the named tool; hook configuration also loads hook reading. Other searches load at most three strong matches, with named-family loading available as a fallback.

Hook runtime guidance is supplied only when configuration tools are loaded. Setup has a 10-second timeout; ongoing work should register callbacks and return. Hooks run in an isolated DOM world and require a page reload after saving. Completion status verifies setup, not ongoing scrolling.

Local usage records include discovery calls, empty search results and cumulative schema characters supplied per completed inference attempt. Characters are not provider tokens or billing savings. Counters exclude provider transport retries and do not detect model refusals that never attempted discovery.

Focused regression cases cover auto-scroll TikTok, automatic scrolling, hook creation, price monitoring, task scheduling, notes, empty search, recovery and capability coverage. These are deterministic routing tests. Real-model generation and TikTok execution still require a live acceptance check: ask for a hook, confirm the review, check the saved source and reload, then verify actual scrolling and runtime errors. Do not infer successful website automation solely from schema availability.
