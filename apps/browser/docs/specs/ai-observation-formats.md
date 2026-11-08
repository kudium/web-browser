# Model-facing observation formats

Implemented November 5, 2026.

- Built-in assistant compact `read_page` and `wait_until` results use semantic-v1: JSON context followed by one line per element, with `@N`, role, quoted label and JSON state.
- Snapshot IDs, coverage, page text, form values, checked states, options, frames and visual geometry remain available. Labels are JSON quoted so embedded newlines cannot forge target lines. Private targeting receipts stay unchanged.
- Extracted rows and tab lists use the official `@toon-format/toon` encoder when the complete encoded response is smaller in UTF-8 bytes than compact JSON. Otherwise they retain JSON.
- Detailed observations, errors, action results, validated arguments and tool schemas retain JSON. Public MCP responses stay compatible with existing clients.
- The formatter also recognizes future `list_tasks` record arrays. Task history currently stays in local storage/UI; there is no model-facing task-history read tool yet.

The assistant prompt explains both encodings and treats all tool/page content as untrusted data. Formats do not change action validation or approvals. Semantic output is a flat actionable view, not a claim to implement the complete accessibility tree.

Validation covers quoting, meaningful state, unchanged source observations, TOON round trips, byte fallback and provider/snapshot regressions. Production build and TypeScript checks verify ESM encoder integration.

Checks: focused tests 11/11; full suite 379 passed, one command-palette session-selection assertion failed (also reproduced independently). TypeScript, targeted ESLint and production build passed. The personal running application was not restarted.

Next measurement: run identical workflows against Ego and previous JSON output, recording actual provider-token counts, task success, retries, latency and cost. The byte fallback is a transport heuristic, not proof of token savings. Delta snapshots and context-aware text deduplication remain deferred until their effect on task accuracy is measured.
