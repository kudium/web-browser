import {
  providerHeaders,
  providerMessage,
  appendProviderImages,
  providerRequest,
} from '../main/aiTransport';
import { AI_PROVIDERS } from '../browser/aiProviders';

it('uses compatible transport and preserves reasoning across tool turns', () => {
  AI_PROVIDERS.filter((p) => p.endpoint && p.id !== 'anthropic').forEach(
    (provider) => {
      const messages = [
        { role: 'assistant', reasoning_content: 'reasoning', tool_calls: [] },
      ];
      expect(providerHeaders(provider.endpoint, 'key').Authorization).toBe(
        'Bearer key'
      );
      expect(
        providerRequest(provider.endpoint, provider.model, messages, [])
          .messages
      ).toBe(messages);
      expect(
        providerRequest(provider.endpoint, provider.model, messages, [])
      ).not.toHaveProperty('temperature');
      expect(
        providerMessage(provider.endpoint, {
          choices: [{ message: messages[0] }],
        })
      ).toBe(messages[0]);
    }
  );
});

it('converts Claude tool calls and groups tool results for continuation', () => {
  const endpoint = 'https://api.anthropic.com/v1';
  const content = [
    { type: 'text', text: 'Opening a tab' },
    {
      type: 'tool_use',
      id: 'call1',
      name: 'new_tab',
      input: { url: 'https://example.com' },
    },
    { type: 'tool_use', id: 'call2', name: 'list_tabs', input: {} },
  ];
  const message = providerMessage(endpoint, { content });
  expect(message.tool_calls[0].function.arguments).toBe(
    '{"url":"https://example.com"}'
  );
  const request = providerRequest(
    endpoint,
    'claude',
    [
      { role: 'system', content: 'Browser instructions' },
      { role: 'user', content: 'Open a tab' },
      message,
      { role: 'tool', tool_call_id: 'call1', content: '{"ok":true}' },
      { role: 'tool', tool_call_id: 'call2', content: '[]' },
    ],
    [
      {
        function: {
          name: 'new_tab',
          description: 'Open',
          parameters: { type: 'object' },
        },
      },
    ]
  );
  expect(request.system).toBe('Browser instructions');
  expect(request.messages[1].content).toBe(content);
  expect(request.messages[2].content).toHaveLength(2);
  expect(request.tools[0]).toEqual({
    name: 'new_tab',
    description: 'Open',
    input_schema: { type: 'object' },
  });
  expect(providerHeaders(endpoint, 'key')['x-api-key']).toBe('key');
  expect(providerHeaders(endpoint, 'key')).not.toHaveProperty('Authorization');
});

it('preserves screenshot blocks for compatible providers and translates them for Claude', () => {
  const content = [
    { type: 'text', text: 'Screenshot of tab first' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
  ];
  const messages = [
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'shot',
          type: 'function',
          function: { name: 'screenshot', arguments: '{}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'shot', content: '{"captured":true}' },
    { role: 'user', content },
  ];
  expect(
    providerRequest('https://api.openai.com/v1', 'vision', messages, [])
      .messages
  ).toBe(messages);
  const claude = providerRequest(
    'https://api.anthropic.com/v1',
    'vision',
    messages,
    []
  );
  expect(claude.messages[1].content).toEqual([
    { type: 'tool_result', tool_use_id: 'shot', content: '{"captured":true}' },
    { type: 'text', text: 'Screenshot of tab first' },
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' },
    },
  ]);
});

it('replaces earlier image payloads while preserving task text and tool results', () => {
  const messages: any[] = [
    { role: 'user', content: 'Complete the original task' },
    { role: 'tool', tool_call_id: 'first', content: '{"captured":true}' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Old screenshot of first' },
        { type: 'image_url', image_url: { url: 'old-image' } },
      ],
    },
  ];
  messages.push({
    role: 'user',
    content: [{ type: 'image_url', image_url: { url: 'recent-image' } }],
  });
  const images = [{ type: 'image_url', image_url: { url: 'new-image' } }];
  appendProviderImages(messages, images);
  expect(JSON.stringify(messages)).not.toContain('old-image');
  expect(messages[0].content).toBe('Complete the original task');
  expect(messages[1].content).toBe('{"captured":true}');
  expect(messages[2].content[0].text).toBe('Old screenshot of first');
  expect(JSON.stringify(messages)).toContain('recent-image');
  expect(messages[4].content).toBe(images);
});
