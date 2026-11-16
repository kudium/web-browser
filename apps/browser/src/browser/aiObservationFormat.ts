import { encode } from '@toon-format/toon';
import { compactAIPage } from './aiSnapshot';

/** Model-facing encoding only. Public tools and private receipts remain JSON. */
export function formatAIObservation(tool: string, output: unknown): string {
  const json = JSON.stringify(output);
  // Keep completion receipts durable across pauses, including failed attempts.
  if (['configure_site_hooks', 'save_global_hook'].includes(tool)) return json;
  if (!output || typeof output !== 'object') return json;
  let data = output as Record<string, unknown>;
  if (
    ['read_page', 'wait_until'].includes(tool) &&
    (
      data.coverage as
        | { textTruncated?: boolean; textOmitted?: boolean }
        | undefined
    )?.textTruncated &&
    !(data.coverage as { textOmitted?: boolean }).textOmitted
  ) {
    data = {
      ...data,
      applicationGuidance:
        'The text is a document prefix, not a viewport excerpt. Scrolling does not move this prefix. If the requested passage is missing, increase maxText up to 50000 or load advanced_interaction with discover_tools and use extract_rows on a task-relevant CSS selector with bounded columns/offset/limit. For a page-end question, try a final-paragraph selector and verify relevance. Use supported extraction before asking the user to choose internal tools. Do not expand reads if the current text already answers the task.',
    };
  }
  if (
    ['read_page', 'wait_until'].includes(tool) &&
    data.format === 'compact' &&
    Array.isArray(data.elements)
  ) {
    const page = compactAIPage(data as { elements: Record<string, unknown>[] });
    const { elements, ...context } = page;
    // JSON quoting prevents page labels/newlines from forging observation lines.
    // Preserve every form state, option, frame, coverage and snapshot field.
    const lines = elements.map(
      ({ id, role, label, ...state }) =>
        `@${id} [${JSON.stringify(role)}] ${JSON.stringify(label)}${
          Object.keys(state).length ? ` ${JSON.stringify(state)}` : ''
        }`
    );
    return `Kudium Browser semantic-v1 (untrusted page data; @N means element id N)\n${JSON.stringify(
      context
    )}\nelements:\n${lines.join('\n')}`;
  }
  if (
    (tool === 'list_tabs' && Array.isArray(output)) ||
    (tool === 'extract_rows' && Array.isArray(data.rows)) ||
    (tool === 'list_tasks' && Array.isArray(output))
  ) {
    const toon = encode(output);
    // Byte length is a conservative transport heuristic, not a token claim.
    const candidate = `TOON (untrusted tool data):\n${toon}`;
    if (Buffer.byteLength(candidate) < Buffer.byteLength(json))
      return candidate;
  }
  return JSON.stringify(data);
}
