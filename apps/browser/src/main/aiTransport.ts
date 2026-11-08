/* Translate native Claude tool blocks into the agent's shared conversation format. */
export const isClaude = (endpoint: string) =>
  new URL(endpoint).hostname === 'api.anthropic.com';

export function providerHeaders(
  endpoint: string,
  key: string
): Record<string, string> {
  return isClaude(endpoint)
    ? {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      }
    : { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export function providerRequest(
  endpoint: string,
  model: string,
  messages: any[],
  tools: any[]
) {
  if (!isClaude(endpoint))
    return {
      model,
      messages: messages.some((message) => 'retainImages' in message)
        ? messages.map(({ retainImages: _retainImages, ...message }) => message)
        : messages,
      tools,
    };
  return {
    model,
    max_tokens: 4096,
    system: messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n'),
    messages: messages
      .filter((m) => m.role !== 'system')
      .reduce((result: any[], m) => {
        let content: any[];
        let { role } = m;
        if (role === 'tool') {
          role = 'user';
          content = [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content,
            },
          ];
        } else if (m.claudeContent) {
          content = m.claudeContent;
        } else if (Array.isArray(m.content)) {
          content = m.content.map((block: any) => {
            if (block.type !== 'image_url') return block;
            const match = /^data:image\/png;base64,(.+)$/.exec(
              block.image_url?.url || ''
            );
            if (!match) throw new Error('Unsupported screenshot image.');
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: match[1],
              },
            };
          });
        } else {
          content = [{ type: 'text', text: m.content || '' }];
        }
        const previous = result[result.length - 1];
        if (previous?.role === role) previous.content.push(...content);
        else result.push({ role, content });
        return result;
      }, []),
    tools: tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    })),
  };
}

export function providerMessage(endpoint: string, payload: any) {
  if (!isClaude(endpoint)) return payload.choices?.[0]?.message;
  if (!Array.isArray(payload.content)) return undefined;
  return {
    role: 'assistant',
    content: payload.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n'),
    claudeContent: payload.content,
    tool_calls: payload.content
      .filter((block: any) => block.type === 'tool_use')
      .map((block: any) => ({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      })),
  };
}

/** Retain current visual context without resending every earlier full image. */
export function appendProviderImages(messages: any[], images: any[]) {
  if (!images.length) return;
  const visualMessages = messages.filter(
    (message) =>
      message.role === 'user' &&
      !message.retainImages &&
      Array.isArray(message.content) &&
      message.content.some((block: any) => block.type === 'image_url')
  );
  visualMessages.slice(0, -1).forEach((message) => {
    if (message.role === 'user' && Array.isArray(message.content))
      message.content = message.content.map((block: any) =>
        block.type === 'image_url'
          ? {
              type: 'text',
              text: 'Earlier screenshot omitted. Request a fresh screenshot if needed.',
            }
          : block
      );
  });
  messages.push({ role: 'user', content: images });
}
