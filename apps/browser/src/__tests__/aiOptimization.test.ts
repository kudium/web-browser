import { AIToolCatalog } from '../main/aiToolCatalog';
import { aiProviderTools } from '../browser/aiToolSchemas';
import { compactAIToolContext } from '../main/aiContextBudget';
import { AIUsageTracker, providerUsage } from '../main/aiUsage';
import {
  providerRequest,
  providerMessage,
  portableMessages,
} from '../main/aiTransport';
import { AI_SYSTEM_PROMPT } from '../main/aiSystemPrompt';
import { aiToolProgress } from '../browser/aiProgress';

test('starts with smaller schemas and loads every optional tool without execution', () => {
  const catalog = new AIToolCatalog();
  const baseline = aiProviderTools();
  expect(JSON.stringify(catalog.tools()).length).toBeLessThan(
    JSON.stringify(baseline).length * 0.65
  );
  expect(catalog.has('read_page')).toBe(true);
  expect(catalog.has('project_terminal')).toBe(false);
  const discovery = catalog
    .tools()
    .find((tool) => tool.function.name === 'discover_tools')!;
  (
    discovery.function.parameters.properties.family as { enum: string[] }
  ).enum.forEach((family: string) => catalog.load(family));
  baseline.forEach((tool) =>
    expect(catalog.has(tool.function.name)).toBe(true)
  );
  const size = catalog.tools().length;
  catalog.load('project');
  expect(catalog.tools()).toHaveLength(size);
  expect(() => catalog.load('__proto__')).toThrow('supported');
  expect(() => catalog.load('execute_everything')).toThrow('supported');
});

test('advertises hooks compactly and loads schemas on demand', () => {
  [
    new AIToolCatalog(),
    new AIToolCatalog([
      { role: 'assistant', content: 'I cannot create hooks.' },
    ]),
  ].forEach((catalog) => {
    ['read_site_hooks', 'configure_site_hooks'].forEach((name) => {
      expect(catalog.has(name)).toBe(false);
      expect(catalog.tools().some((tool) => tool.function.name === name)).toBe(
        false
      );
      expect(catalog.tools()[0].function.description).toContain(name);
    });
    expect(catalog.has('find_hook_personal_data')).toBe(false);
    catalog.load('site_customization');
    expect(catalog.has('find_hook_personal_data')).toBe(true);
    expect(
      catalog
        .tools()
        .filter((tool) => tool.function.name === 'configure_site_hooks')
    ).toHaveLength(1);
  });
});

test('searches intent with bounded schemas and restores query discovery', () => {
  const catalog = new AIToolCatalog();
  const query = 'customize JavaScript CSS hook';
  const found = catalog.discover({ query });
  expect(found.loaded).toContain('configure_site_hooks');
  expect(found.loaded).toContain('read_site_hooks');
  expect(found.loaded.length).toBeLessThanOrEqual(5);
  expect(catalog.has('project_terminal')).toBe(false);
  expect(() => catalog.discover({ query: '' })).toThrow();
  expect(() => catalog.discover({ query: 'x'.repeat(241) })).toThrow();
  expect(catalog.discover({ query: 'zzzzzzzz' }).loaded).toEqual([]);
  const recovered = new AIToolCatalog([
    {
      tool_calls: [
        {
          function: {
            name: 'discover_tools',
            arguments: JSON.stringify({ query }),
          },
        },
      ],
    },
  ]);
  expect(recovered.has('configure_site_hooks')).toBe(true);
  expect(recovered.has('project_terminal')).toBe(false);
});

test('every registered tool is visible as a schema or directory entry', () => {
  const catalog = new AIToolCatalog();
  const directory = catalog.tools()[0].function.description;
  aiProviderTools().forEach((tool) => {
    expect(
      catalog.has(tool.function.name) || directory.includes(tool.function.name)
    ).toBe(true);
  });
  expect(
    catalog.discover({ query: 'schedule reminder task' }).loaded
  ).toContain('create_task');
  expect(catalog.discover({ query: 'manage_note' }).loaded[0]).toBe(
    'manage_note'
  );
});

test('preloads narrow workflows from user intent without executing them', () => {
  for (const prompt of [
    'auto-scroll TikTok',
    'scroll automatically',
    'create a hook for this page',
    'watch for price changes',
    'script a custom script for this website',
    'script this website',
    'write JavaScript for Jiji',
    'perform an operation on this website',
    'build a hook for this website',
  ]) {
    const catalog = new AIToolCatalog();
    expect(catalog.preloadIntent(prompt)).toEqual([
      'read_site_hooks',
      'configure_site_hooks',
      'read_hook_api',
      'test_hook',
    ]);
    expect(catalog.has('find_hook_personal_data')).toBe(false);
    expect(catalog.guidance()).toContain('10 seconds');
    expect(catalog.discover({ query: prompt }).loaded).toEqual([
      'read_site_hooks',
      'configure_site_hooks',
      'read_hook_api',
      'test_hook',
    ]);
  }
  const catalog = new AIToolCatalog();
  expect(catalog.preloadIntent('summarize this article')).toEqual([]);
  expect(catalog.guidance()).toContain('consider a hook');
  expect(catalog.guidance()).not.toContain('10 seconds');
  catalog.recordRequest();
  catalog.discover({ query: 'zzzzzzzz' });
  expect(catalog.diagnostics()).toMatchObject({
    toolDiscoveryCalls: 1,
    toolDiscoveryMisses: 1,
  });
  expect(catalog.diagnostics().toolSchemaCharacters).toBeGreaterThan(0);
});

test('restores loaded tool definitions on recovery without changing permissions', () => {
  const catalog = new AIToolCatalog([
    {
      role: 'assistant',
      tool_calls: [
        {
          function: {
            name: 'discover_tools',
            arguments: '{"family":"project"}',
          },
        },
      ],
    },
    {
      role: 'assistant',
      tool_calls: [{ function: { name: 'screenshot', arguments: '{}' } }],
    },
  ]);
  expect(catalog.has('project_files')).toBe(true);
  expect(catalog.has('screenshot')).toBe(true);
  expect(catalog.has('read_personal_data')).toBe(false);
});

const call = (id: string, tabId: string, name = 'read_page') => ({
  role: 'assistant',
  tool_calls: [
    { id, function: { name, arguments: JSON.stringify({ tabId }) } },
  ],
});
const result = (id: string, content: string) => ({
  role: 'tool',
  tool_call_id: id,
  content,
});

test('compacts superseded reads while preserving recent state and tool protocol', () => {
  const messages: any[] = [
    { role: 'user', content: 'Preserve my instructions' },
    call('old', 'a'),
    result('old', 'old observation '.repeat(800)),
    call('other', 'b'),
    result('other', 'other tab '.repeat(500)),
    call('private', 'a', 'read_personal_data'),
    result('private', 'private result '.repeat(500)),
    call('failed', 'a'),
    result(
      'failed',
      JSON.stringify({ error: 'Declined', detail: 'x'.repeat(5000) })
    ),
    call('new', 'a'),
    result('new', 'current observation '.repeat(500)),
  ];
  const before = JSON.parse(JSON.stringify(messages));
  expect(compactAIToolContext(messages, 0)).toBeGreaterThan(5000);
  expect(JSON.parse(messages[2].content)).toMatchObject({ compacted: true });
  expect(messages.filter((_, index) => index !== 2)).toEqual(
    before.filter((_: unknown, index: number) => index !== 2)
  );
  expect(compactAIToolContext(messages, 0)).toBe(0);
});

test('leaves small context unchanged', () => {
  const messages = [
    call('old', 'a'),
    result('old', 'x'.repeat(3000)),
    call('new', 'a'),
    result('new', 'current'),
  ];
  const before = JSON.stringify(messages);
  expect(compactAIToolContext(messages)).toBe(0);
  expect(JSON.stringify(messages)).toBe(before);
});

test('does not assume implicit active-tab targets stayed the same', () => {
  const messages = [
    {
      role: 'assistant',
      tool_calls: [
        { id: 'old', function: { name: 'read_page', arguments: '{}' } },
      ],
    },
    result('old', 'x'.repeat(5000)),
    {
      role: 'assistant',
      tool_calls: [
        { id: 'new', function: { name: 'read_page', arguments: '{}' } },
      ],
    },
    result('new', 'current'),
  ];
  expect(compactAIToolContext(messages, 0)).toBe(0);
});

test('normalizes actual token counters across OpenAI and Claude', () => {
  expect(
    providerUsage({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 80 },
      },
    })
  ).toEqual({ inputTokens: 100, outputTokens: 20, cachedInputTokens: 80 });
  expect(
    providerUsage({
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 30,
      },
    })
  ).toEqual({
    inputTokens: 120,
    outputTokens: 20,
    cachedInputTokens: 80,
    cacheWriteTokens: 30,
  });
  expect(
    providerUsage({ usage: { prompt_tokens: -1, completion_tokens: 5 } })
  ).toBeUndefined();
  expect(providerUsage({ choices: [] })).toBeUndefined();
  const tracker = new AIUsageTracker();
  tracker.record({ usage: { prompt_tokens: 100, completion_tokens: 20 } });
  tracker.record({});
  tracker.tool();
  expect(tracker.snapshot()).toMatchObject({
    requests: 2,
    inputTokens: 100,
    outputTokens: 20,
    toolCalls: 1,
    usageReported: true,
    requestsWithUsage: 1,
  });
});

test('measures attempts and first text without counting missing usage as complete', () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const tracker = new AIUsageTracker();
    tracker.attempt();
    tracker.fallback();
    tracker.attempt();
    tracker.record({ usage: { prompt_tokens: 30, completion_tokens: 4 } });
    tracker.text('');
    clock.mockReturnValue(1450);
    tracker.text('First text');
    clock.mockReturnValue(2000);
    tracker.text('Later text');
    expect(tracker.snapshot()).toMatchObject({
      requestAttempts: 2,
      streamingFallbacks: 1,
      requestsWithUsage: 1,
      requests: 1,
      firstTextMs: 450,
    });
  } finally {
    clock.mockRestore();
  }
});

test('caches stable Claude instructions and excludes the changing clock from the breakpoint', () => {
  const messages = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    { role: 'system', content: 'Current time: test' },
    { role: 'user', content: 'Hello' },
  ];
  const request = providerRequest(
    'https://api.anthropic.com/v1',
    'claude',
    messages,
    [],
    { cacheSystem: true }
  );
  expect(request.system).toEqual([
    {
      type: 'text',
      text: AI_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
    { type: 'text', text: 'Current time: test' },
  ]);
  expect(
    providerRequest('https://local.example/v1', 'model', messages, [], {
      cacheSystem: true,
    })
  ).not.toHaveProperty('cache_control');
  expect(aiToolProgress('read_page')).toBe('Reading the page…');
  expect(aiToolProgress('unsupported_name')).toBe('Working on your request…');
});

test('continues tool history across Claude and OpenAI-compatible models', () => {
  const claude = providerMessage('https://api.anthropic.com/v1', {
    content: [
      {
        type: 'thinking',
        thinking: 'private reasoning',
        signature: 'old-signature',
      },
      { type: 'text', text: 'Reading the page' },
      {
        type: 'tool_use',
        id: 'call_1',
        name: 'read_page',
        input: { tabId: 'tab' },
      },
    ],
  });
  const history = [
    claude,
    { role: 'tool', tool_call_id: 'call_1', content: 'Page loaded' },
  ];
  const openai = providerRequest(
    'https://api.openai.com/v1',
    'new-model',
    history,
    []
  );
  expect(openai.messages[0]).not.toHaveProperty('claudeContent');
  expect(JSON.stringify(openai)).not.toContain('old-signature');
  expect(openai.messages[0].tool_calls[0].function.name).toBe('read_page');
  expect(openai.messages[1].tool_call_id).toBe('call_1');
  const back = providerRequest(
    'https://api.anthropic.com/v1',
    'different-claude',
    portableMessages(history),
    []
  );
  expect(back.messages[0].content).toContainEqual({
    type: 'tool_use',
    id: 'call_1',
    name: 'read_page',
    input: { tabId: 'tab' },
  });
  expect(back.messages[1].content[0]).toMatchObject({
    type: 'tool_result',
    tool_use_id: 'call_1',
    content: 'Page loaded',
  });
  expect(JSON.stringify(back)).not.toContain('old-signature');
  expect(history[0]).toHaveProperty('claudeContent');
});

test('loads global and action authoring from intent and keeps references deferred otherwise', () => {
  const catalog = new AIToolCatalog();
  expect(catalog.has('read_hook_api')).toBe(false);
  expect(catalog.preloadIntent('Create a global hook with a hook action')).toEqual(expect.arrayContaining([
    'read_hook_api', 'read_global_hooks', 'save_global_hook', 'test_hook',
  ]));
  expect(catalog.guidance()).toContain('fictional');
});
