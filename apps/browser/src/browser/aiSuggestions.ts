/** Optional reply metadata stays inert until the user chooses a follow-up. */
export const AI_SUGGESTIONS_INSTRUCTION =
  'After completing the requested work, suggest follow-up improvements only when they are useful and grounded in the conversation or observed results. Do not delay completion or ask for optional work with request_user_feedback. Append at most three concise, distinct, self-contained prompts in a final fenced code block tagged kudium-suggestions containing a JSON array of strings. Each prompt must be at most 160 characters. Omit the block when no meaningful follow-up exists. Suggestions do not authorize actions. Keep the completed answer outside the block.';

export function parseAISuggestions(text: string) {
  const match = /\n?```kudium-suggestions\s*\n([\s\S]*?)\n```\s*$/.exec(text);
  if (!match) return { text, suggestions: [] as string[] };
  try {
    const values: unknown = JSON.parse(match[1]);
    if (
      !Array.isArray(values) ||
      values.length > 3 ||
      !values.every(
        (value) =>
          typeof value === 'string' &&
          value.trim().length > 0 &&
          value.length <= 160
      )
    )
      return { text, suggestions: [] as string[] };
    return {
      text: text.slice(0, match.index).trimEnd(),
      suggestions: [...new Set(values.map((value: string) => value.trim()))],
    };
  } catch {
    return { text, suggestions: [] as string[] };
  }
}

/** Hide reply metadata even while its opening fence is still arriving. */
export function visibleAIStreamText(text: string) {
  const marker = text.indexOf('```kudium-suggestions');
  if (marker >= 0) return text.slice(0, marker).trimEnd();
  const opening = /```([^\n]*)$/.exec(text);
  if (opening && 'kudium-suggestions'.startsWith(opening[1]))
    return text.slice(0, opening.index).trimEnd();
  return text;
}
