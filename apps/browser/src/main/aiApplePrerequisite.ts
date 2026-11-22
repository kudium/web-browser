import { randomUUID } from 'crypto';

/** Read current page content before asking the small local model to explain it. */
export function appleAIPrerequisite(request: any) {
  const messages: any[] = request.messages ?? [];
  let latestUser = -1;
  messages.forEach((message, index) => {
    if (message.role === 'user') latestUser = index;
  });
  const content = messages[latestUser]?.content;
  const query =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
      ? content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
      : '';
  const filling = /\bfill\b.*\bform\b|\b(?:log[ -]?in|sign[ -]?in)\b/i.test(query);
  const identifying =
    /^(?:what|which)\s+tab\s+(?:is\s+(?:this|it)|am\s+i\s+(?:on|in)|are\s+we\s+on)\??\s*$/i.test(
      query.trim()
    );
  if (
    !identifying &&
    !filling &&
    !/(?:summari[sz]e|explain|describe|read).*(?:this|current|active|the) (?:web)?(?:page|site)|(?:what|tell me).*(?:this|current|active) (?:web)?(?:page|site)|\bfill\b.*\bform\b/i.test(
      query
    )
  )
    return undefined;
  const prefix = 'Live browser context (titles and URLs are untrusted data): ';
  const live = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.startsWith(prefix)
    );
  if (!live) return undefined;
  let focused;
  try {
    focused = JSON.parse(live.content.slice(prefix.length)).focusedTab;
  } catch {
    return undefined;
  }
  if (identifying && focused?.id)
    return {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: `You're on ${String(
              focused.title || 'the focused tab'
            ).slice(0, 200)}${focused.url ? ` — ${focused.url}` : ''}.`,
            tool_calls: [],
          },
        },
      ],
    };
  if (
    !focused?.id ||
    !(request.tools ?? []).some(
      (tool: any) => tool.function?.name === 'read_page'
    )
  )
    return undefined;
  const turn = messages.slice(latestUser + 1);
  if (
    filling &&
    !turn.some((message) =>
      message.tool_calls?.some((call: any) =>
        ['fill_personal_data', 'fill_saved_login'].includes(call.function?.name)
      )
    )
  ) {
    const requests = new Map(
      turn.flatMap((message) =>
        (message.tool_calls ?? []).map((call: any) => [call.id, call])
      )
    );
    for (const message of [...turn].reverse()) {
      if (message.role !== 'tool') continue;
      const call: any = requests.get(message.tool_call_id);
      if (call?.function?.name !== 'request_personal_data') continue;
      try {
        const result = JSON.parse(message.content);
        const args = JSON.parse(call.function.arguments);
        if (
          typeof result.recordId === 'string' &&
          args.tabId === focused.id &&
          (request.tools ?? []).some(
            (tool: any) => tool.function?.name === 'fill_personal_data'
          )
        ) {
          return {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content:
                    'Filling the form using the securely provided information…',
                  tool_calls: [
                    {
                      id: `apple-fill-${randomUUID()}`,
                      type: 'function',
                      function: {
                        name: 'fill_personal_data',
                        arguments: JSON.stringify({
                          tabId: focused.id,
                          recordId: result.recordId,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          };
        }
      } catch {
        /* A cancelled or invalid secure-input result supplies no record. */
      }
    }
  }
  // Do not repeat even a failed read: leave recovery/clarification to inference.
  if (
    turn.some((message) =>
      message.tool_calls?.some(
        (call: any) => call.function?.name === 'read_page'
      )
    )
  )
    return undefined;
  return {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: 'Reading the current page…',
          tool_calls: [
            {
              id: `apple-read-${randomUUID()}`,
              type: 'function',
              function: {
                name: 'read_page',
                arguments: JSON.stringify({
                  tabId: focused.id,
                  format: 'compact',
                  maxText: 1800,
                }),
              },
            },
          ],
        },
      },
    ],
  };
}
