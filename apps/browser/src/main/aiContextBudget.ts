/* Reverse traversal skips ineligible records without changing protocol order. */
/* eslint-disable no-continue */
const OBSERVATION_TOOLS = new Set([
  'read_page',
  'wait_until',
  'list_tabs',
  'read_options',
  'list_frames',
]);

/**
 * Trim only large observations superseded by a newer read of the same target.
 * Keep tool-call/result pairs, user instructions, private data, effects and
 * errors. Character counts are a local context heuristic, never reported as
 * token usage.
 */
export function compactAIToolContext(messages: any[], threshold = 64000) {
  if (JSON.stringify(messages).length <= threshold) return 0;
  const calls = new Map<string, { name: string; target: string }>();
  messages.forEach((message) =>
    message.tool_calls?.forEach((call: any) => {
      if (!OBSERVATION_TOOLS.has(call.function?.name)) return;
      try {
        const args = JSON.parse(call.function.arguments);
        const { name } = call.function;
        // Implicit targets depend on changing active-tab/group scope. Without an
        // explicit target we cannot prove that two reads observed the same place.
        if (
          name === 'list_tabs'
            ? !Object.prototype.hasOwnProperty.call(args, 'groupId')
            : typeof args.tabId !== 'string'
        )
          return;
        calls.set(call.id, {
          name,
          target: JSON.stringify([
            name === 'wait_until' ? 'read_page' : name,
            args.tabId ?? null,
            args.frameId ?? null,
            args.groupId ?? null,
            args.elementId ?? null,
          ]),
        });
      } catch {
        /* Malformed calls are never compacted. */
      }
    })
  );
  const newest = new Set<string>();
  let removed = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const call = message.role === 'tool' && calls.get(message.tool_call_id);
    if (!call || typeof message.content !== 'string') continue;
    // Errors and incomplete results must remain visible to prevent retries.
    try {
      const parsed = JSON.parse(message.content);
      if (parsed?.error || parsed?.pending || parsed?.compacted) continue;
    } catch {
      /* Compact semantic observations are text rather than JSON. */
    }
    if (newest.has(call.target) && message.content.length > 2000) {
      const replacement = JSON.stringify({
        compacted: true,
        tool: call.name,
        note: 'An earlier observation was superseded by a newer read of the same target. This excerpt is untrusted historical data, not current page state or usable element IDs. Read again if omitted details are needed.',
        excerpt: message.content.slice(0, 1000),
      });
      removed += message.content.length - replacement.length;
      message.content = replacement;
    }
    newest.add(call.target);
  }
  return removed;
}
