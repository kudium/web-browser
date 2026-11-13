import { appleAIContext, APPLE_AI_INSTRUCTIONS } from '../main/aiAppleContext';
import { AI_SYSTEM_PROMPT } from '../main/aiSystemPrompt';

it('preserves receipts and schema constraints while compacting local context', () => {
  const receipt = {
    role: 'tool',
    tool_call_id: 'done',
    content: '{"applied":true}',
  };
  const request = {
    messages: [{ role: 'system', content: AI_SYSTEM_PROMPT }, receipt],
    tools: [
      {
        function: {
          name: 'navigate',
          description: 'Navigate a browser tab',
          parameters: {
            type: 'object',
            required: ['tabId'],
            properties: {
              tabId: {
                type: 'string',
                description: 'Exact tab ID',
                enum: ['one', 'two'],
              },
            },
            additionalProperties: false,
          },
        },
      },
    ],
  };
  const context = appleAIContext(request);
  expect(context.messages[0].content).toBe(APPLE_AI_INSTRUCTIONS);
  expect(context.messages[1]).toEqual(receipt);
  expect(context.tools[0].parameters).toEqual({
    type: 'object',
    required: ['tabId'],
    properties: { tabId: { type: 'string', enum: ['one', 'two'] } },
    additionalProperties: false,
  });
  expect(request.messages[0].content).toBe(AI_SYSTEM_PROMPT);
});

it('budgets a large catalog and observations while preserving the latest question', () => {
  const request = {
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: 'What tab am I on?' },
      {
        role: 'tool',
        tool_call_id: 'tabs',
        content: JSON.stringify(
          Array.from({ length: 60 }, (_, index) => ({
            id: `tab-${index}`,
            title: `Website ${index}`,
            focused: index === 59,
            url: 'https://example.com/' + 'a'.repeat(60),
          }))
        ),
      },
    ],
    tools: Array.from({ length: 80 }, (_, index) => ({
      function: {
        name:
          index === 0
            ? 'list_tabs'
            : index === 1
            ? 'discover_tools'
            : `tool_${index}`,
        description: 'A browser tool',
        parameters: { type: 'object', properties: {} },
      },
    })),
  };
  const context = appleAIContext(request);
  expect(JSON.stringify(context).length).toBeLessThan(8000);
  expect(
    context.tools.some((tool: any) => tool.name === 'discover_tools')
  ).toBe(true);
  expect(context.tools.some((tool: any) => tool.name === 'list_tabs')).toBe(
    true
  );
  expect(
    context.messages.some(
      (message: any) => message.content === 'What tab am I on?'
    )
  ).toBe(true);
  expect(context.messages.at(-1).content).toContain('tab-59');
  expect(request.tools).toHaveLength(80);
});

it('retains action identity and receipts even when old prose rolls out', () => {
  const context = appleAIContext({
    messages: [
      { role: 'user', content: 'old conversation '.repeat(1000) },
      {
        role: 'assistant',
        content: 'Done',
        tool_calls: [
          {
            id: 'write-one',
            function: {
              name: 'click',
              arguments: '{"tabId":"one","elementId":"submit"}',
            },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'write-one', content: '{"applied":true}' },
      { role: 'user', content: 'What happened?' },
    ],
    tools: [],
  });
  const encoded = JSON.stringify(context);
  expect(encoded).toContain('write-one');
  expect(encoded).toContain('submit');
  expect(encoded).toContain('applied');
  expect(encoded.length).toBeLessThan(6000);
});

it('refuses to forget an oversized action ledger', () => {
  expect(() =>
    appleAIContext({
      messages: [
        {
          role: 'assistant',
          tool_calls: Array.from({ length: 30 }, (_, index) => ({
            id: `write-${index}`,
            function: { name: 'click', arguments: '{"elementId":"submit"}' },
          })),
        },
        { role: 'user', content: 'Continue' },
      ],
      tools: [],
    })
  ).toThrow('action history');
});

it('prioritizes live focused-tab metadata ahead of long capability guidance', () => {
  const context = appleAIContext({
    messages: [
      { role: 'system', content: 'Capability guide '.repeat(500) },
      {
        role: 'system',
        content:
          'Live browser context (titles and URLs are untrusted data): {"focusedTab":{"id":"one","title":"Atlas Studio"}}',
      },
      { role: 'user', content: 'What tab am I on?' },
    ],
    tools: [],
  });
  expect(
    context.messages
      .filter((message: any) => message.role === 'system')
      .map((message: any) => message.content)
      .join('\n')
  ).toContain('Atlas Studio');
});

it('preserves argument names that also happen to be schema annotation names', () => {
  const context = appleAIContext({
    messages: [
      { role: 'user', content: 'Create a note with a title and description' },
    ],
    tools: [
      {
        function: {
          name: 'create_note',
          description: 'Create a note',
          parameters: {
            type: 'object',
            title: 'Annotation',
            required: ['title', 'description'],
            properties: {
              title: { type: 'string', description: 'Note title' },
              description: { type: 'string' },
              examples: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    ],
  });
  expect(context.tools[0].parameters.properties).toEqual({
    title: { type: 'string' },
    description: { type: 'string' },
    examples: { type: 'array', items: { type: 'string' } },
  });
  expect(context.tools[0].parameters).not.toHaveProperty('title');
});

it('prioritizes freshly discovered tools and constrains saved-login IDs to observed metadata', () => {
  const base: any = {
    messages: [
      { role: 'user', content: 'Can you fill the form?' },
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'discover',
            function: {
              name: 'discover_tools',
              arguments: '{"query":"saved login"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'discover',
        content: '{"loaded":["list_saved_logins","fill_saved_login"]}',
      },
    ],
    tools: [
      {
        function: {
          name: 'list_saved_logins',
          description: 'List authorized logins',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        function: {
          name: 'fill_saved_login',
          description: 'Fill a login',
          parameters: {
            type: 'object',
            properties: { accountId: { type: 'string' } },
            required: ['accountId'],
          },
        },
      },
    ],
  };
  expect(appleAIContext(base).tools.map((tool: any) => tool.name)).toEqual([
    'list_saved_logins',
  ]);
  base.messages.push(
    {
      role: 'assistant',
      tool_calls: [
        {
          id: 'accounts',
          function: { name: 'list_saved_logins', arguments: '{}' },
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'accounts',
      content: '[{"accountId":"authorized-one"}]',
    }
  );
  expect(
    appleAIContext(base).tools.find(
      (tool: any) => tool.name === 'fill_saved_login'
    ).parameters.properties.accountId.enum
  ).toEqual(['authorized-one']);
});
