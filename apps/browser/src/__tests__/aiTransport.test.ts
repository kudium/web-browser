import {
  providerHeaders,
  providerMessage,
  appendProviderImages,
  providerRequest,
} from '../main/aiTransport';
import { AI_PROVIDERS } from '../browser/aiProviders';

it('uses compatible transport without leaking provider-specific reasoning', () => {
  AI_PROVIDERS.filter((p) => p.endpoint && p.id !== 'anthropic').forEach(
    (provider) => {
      const messages = [
        { role: 'assistant', reasoning_content: 'reasoning', tool_calls: [] },
      ];
      expect(providerHeaders(provider.endpoint, 'key').Authorization).toBe(
        ['ollama', 'apple'].includes(provider.id) ? undefined : 'Bearer key'
      );
      expect(
        providerRequest(provider.endpoint, provider.model, messages, [])
          .messages
      ).toEqual([{ role: 'assistant', content: '' }]);
      expect(messages[0].reasoning_content).toBe('reasoning');
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
  ).toEqual([{ ...messages[0], content: '' }, messages[1], messages[2]]);
  expect(messages[0].content).toBeNull();
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

it('uses Ollama tool calls and results through the shared agent protocol without sending credentials', () => {
  const endpoint = 'http://localhost:11434/v1';
  const tools = [
    {
      type: 'function',
      function: { name: 'read_page', parameters: { type: 'object' } },
    },
  ];
  const message = {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call-local',
        type: 'function',
        function: { name: 'read_page', arguments: '{}' },
      },
    ],
  };
  expect(providerMessage(endpoint, { choices: [{ message }] })).toBe(message);
  const messages = [
    message,
    { role: 'tool', tool_call_id: 'call-local', content: 'Page content' },
  ];
  expect(providerRequest(endpoint, 'qwen3:8b', messages, tools)).toEqual({
    model: 'qwen3:8b',
    messages,
    tools,
  });
  expect(providerHeaders(endpoint, 'previous-cloud-secret')).toEqual({
    'Content-Type': 'application/json',
  });
});

it('maps thinking levels to provider controls and leaves default requests unchanged', () => {
  const request = (endpoint: string, model: string, thinking: any) =>
    providerRequest(endpoint, model, [], [], { thinking });
  expect(
    request('http://localhost:11434/v1', 'qwen3:8b', 'off')
  ).toHaveProperty('think', false);
  expect(request('http://localhost:11434/v1', 'qwen3:8b', 'on')).toHaveProperty(
    'think',
    true
  );
  expect(
    request('http://localhost:11434/v1', 'gpt-oss:20b', 'high')
  ).toHaveProperty('think', 'high');
  expect(request('https://api.openai.com/v1', 'gpt-5', 'high')).toHaveProperty(
    'reasoning_effort',
    'high'
  );
  expect(
    request('https://api.openai.com/v1', 'gpt-4.1', 'high')
  ).not.toHaveProperty('reasoning_effort');
  expect(
    request('http://localhost:11434/v1', 'qwen3:8b', 'auto')
  ).not.toHaveProperty('think');
  const claude = request(
    'https://api.anthropic.com/v1',
    'claude-sonnet-4',
    'medium'
  );
  expect(claude.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
  expect(claude.max_tokens).toBeGreaterThan(claude.thinking.budget_tokens);
});
