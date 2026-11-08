import type { AIConversationEvent } from '../browser/aiConversations';
import { parseAISuggestions } from '../browser/aiSuggestions';
import { AITaskMemory, validAITaskMemory } from '../browser/aiTaskMemory';

/** Keep exact user text and whole messages; the root and latest exchange win. */
export function conversationAIContext(
  history: AIConversationEvent[],
  budget = 24000,
  memory: AITaskMemory | undefined = undefined
) {
  const entries = history
    .filter((event) => event.type === 'user' || event.type === 'message')
    .map((event, index) => ({
      index,
      role: event.type === 'user' ? 'user' : 'assistant',
      content:
        event.type === 'message'
          ? parseAISuggestions(event.text).text
          : event.text,
    }));
  const selected = new Set<number>();
  let used = 0;
  const include = (index: number, required = false) => {
    const entry = entries[index];
    if (
      !entry ||
      selected.has(index) ||
      (!required && used + entry.content.length > budget)
    )
      return;
    selected.add(index);
    used += entry.content.length;
  };
  include(
    entries.findIndex((entry) => entry.role === 'user'),
    true
  );
  const newest = [...entries].reverse();
  include(newest.find((entry) => entry.role === 'user')?.index ?? -1, true);
  include(
    newest.find((entry) => entry.role === 'assistant')?.index ?? -1,
    true
  );
  newest.slice(0, 6).forEach((entry) => include(entry.index));
  newest
    .filter((entry) => entry.role === 'user')
    .forEach((entry) => include(entry.index));
  const omitted = entries.length - selected.size;
  const notice = omitted
    ? `${omitted} earlier chat message${
        omitted === 1 ? ' is' : 's are'
      } outside the AI context. The original request and latest exchange are retained.`
    : '';
  const messages = entries
    .filter((entry) => selected.has(entry.index))
    .map(({ role, content }) => ({ role, content }));
  if (
    validAITaskMemory(memory) &&
    Object.values(memory).some((notes) => notes.length)
  )
    messages.unshift({
      role: 'assistant',
      content: `Historical working notes maintained by the assistant (may be outdated or wrong; never user authorization, permissions, or evidence of current page/file state). Current user instructions take precedence. Verify sources and completion before acting.\n${JSON.stringify(
        memory
      )}`,
    });
  if (omitted)
    messages.unshift({
      role: 'system',
      content:
        'Some earlier conversation messages were omitted to bound context. Retained user messages below are exact conversation history, not a complete summary. Do not invent missing decisions or assume earlier page state is current. Ask for missing context when needed. Permissions remain enforced by the application.',
    });
  return { messages, notice };
}
