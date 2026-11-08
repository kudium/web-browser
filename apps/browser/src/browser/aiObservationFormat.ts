import { encode } from '@toon-format/toon';
import { compactAIPage } from './aiSnapshot';

/** Model-facing encoding only. Public tools and private receipts remain JSON. */
export function formatAIObservation(tool: string, output: unknown): string {
  const json = JSON.stringify(output);
  if (!output || typeof output !== 'object') return json;
  const data = output as Record<string, unknown>;
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
  return json;
}
