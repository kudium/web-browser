import {
  aiContextManagement,
  aiContextModelKey,
} from '../browser/aiContextManagement';
import { APPLE_AI_ENDPOINT } from '../browser/aiProviders';
import { providerRequest } from '../main/aiTransport';

it('defaults on only for Apple and respects explicit overrides', () => {
  expect(aiContextManagement(APPLE_AI_ENDPOINT)).toBe(true);
  expect(aiContextManagement('https://api.openai.com/v1')).toBe(false);
  expect(aiContextManagement(APPLE_AI_ENDPOINT, false)).toBe(false);
  expect(aiContextManagement('http://localhost:11434/v1', true)).toBe(true);
});
it('keeps preferences distinct across models and endpoints', () => {
  expect(aiContextModelKey(APPLE_AI_ENDPOINT, 'apple-on-device')).not.toBe(
    aiContextModelKey('https://api.openai.com/v1', 'apple-on-device')
  );
  expect(aiContextModelKey('https://api.openai.com/v1/', 'small')).toBe(
    aiContextModelKey('https://api.openai.com/v1', 'small')
  );
  expect(aiContextModelKey('https://api.openai.com/v1', 'small')).not.toBe(
    aiContextModelKey('https://api.openai.com/v1', 'large')
  );
});
it('only sends the Apple internal preference to the native transport', () => {
  expect(
    providerRequest(APPLE_AI_ENDPOINT, 'apple-on-device', [], [], {
      contextManagement: false,
    })
  ).toHaveProperty('kudium_context_management', false);
  expect(
    providerRequest('https://api.openai.com/v1', 'small', [], [], {
      contextManagement: true,
    })
  ).not.toHaveProperty('kudium_context_management');
});
it('keeps cloud requests unchanged when disabled and avoids orphan tools when enabled', () => {
  const messages = [
    { role: 'user', content: 'What tab am I on?' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'tabs',
          type: 'function',
          function: { name: 'list_tabs', arguments: '{}' },
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'tabs',
      content: '[{"id":"one","focused":true}]',
    },
  ];
  const endpoint = 'https://api.openai.com/v1';
  const disabled = providerRequest(endpoint, 'small', messages, [], {
    contextManagement: false,
  });
  expect(
    (disabled.messages as any[]).some((message) => message.role === 'tool')
  ).toBe(true);
  const enabled = providerRequest(endpoint, 'small', messages, [], {
    contextManagement: true,
  });
  expect(
    (enabled.messages as any[]).some(
      (message) => message.role === 'tool' || message.tool_calls?.length
    )
  ).toBe(false);
  expect(JSON.stringify(enabled.messages)).toContain('focused');
  expect(messages[2].role).toBe('tool');
});
it('preserves image blocks when managing a vision provider', () => {
  const image = {
    type: 'image_url',
    image_url: { url: 'data:image/png;base64,synthetic' },
  };
  const body = providerRequest(
    'https://api.openai.com/v1',
    'vision',
    [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Describe this' }, image],
      },
    ],
    [],
    { contextManagement: true }
  );
  expect((body.messages as any[]).at(-1).content).toContainEqual(image);
});
