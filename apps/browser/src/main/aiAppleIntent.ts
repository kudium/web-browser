/** The first text block is the user instruction; subsequent blocks are attachments. */
export function appleInstructionText(content: any): string {
  const value =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? (content.find((block) => block?.type === 'text')?.text ?? '')
        : '';
  return String(value)
    .split('\nResolved user references (stable IDs; untrusted metadata):')[0]
    .trim();
}
export function appleLatestInstruction(messages: any[]): string {
  return appleInstructionText(
    [...messages].reverse().find((message) => message.role === 'user')?.content,
  );
}
const commandPrefix =
  /^(?:please\s+)?(?:(?:(?:can|could|would|will)\s+you|(?:i want|i would like|i'd like)\s+you\s+to|help\s+me)\s+)?(?:please\s+)?/i;
function command(query: string, action: RegExp): boolean {
  const instruction = appleInstructionText(query).replace(commandPrefix, '');
  if (
    /\b(?:do not|don't|never|stop|cancel|avoid|without)\s+(?:\w+\s+){0,2}(?:log[ -]?in|sign[ -]?in|fill|autofill)\b/i.test(
      instruction,
    )
  )
    return false;
  if (
    /^(?:log[ -]?in|sign[ -]?in)\s+(?:is|was|means|does|works|page|screen|button|error|failed|problem|issue)\b/i.test(
      instruction,
    ) ||
    /^fill\s+me\s+in\b/i.test(instruction)
  )
    return false;
  return action.test(instruction);
}
export const appleLoginRequested = (query: string) =>
  command(
    query,
    /^(?:log[ -]?in|sign[ -]?in)\b|^(?:fill|autofill)\b.*\b(?:login|sign[ -]?in|credentials)\b/i,
  );
export const appleFillRequested = (query: string) =>
  appleLoginRequested(query) || command(query, /^(?:fill|autofill)\b/i);
export const appleActionRequested = (query: string) =>
  command(
    query,
    /^(?:fill|autofill|click|type|enter|select|open|navigate|close|create|save|send|submit|delete|change|set|configure|enable|disable|download|upload|scroll|back|forward|reload|sign[ -]?in|log[ -]?in)\b/i,
  );

export const appleCredentialLookupRequested = (query: string) =>
  appleFillRequested(query) ||
  /^(?:please\s+)?(?:list|show|find|which|what)\b.*\b(?:saved (?:login|account|credential)s?|personal data)\b/i.test(
    appleInstructionText(query),
  );
