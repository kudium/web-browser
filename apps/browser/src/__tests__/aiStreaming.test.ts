/** @jest-environment node */
import { readAIProviderStream } from '../main/aiProviderStream';
import { requestAIProvider } from '../main/aiProviderRequest';
import { providerMessage, providerRequest } from '../main/aiTransport';

const openai = 'https://api.openai.com/v1/chat/completions';
const anthropic = 'https://api.anthropic.com/v1/messages';
const sse = (values: unknown[]) =>
  values
    .map(
      (value) =>
        `data: ${
          typeof value === 'string' ? value : JSON.stringify(value)
        }\r\n\r\n`
    )
    .join('');
function response(text: string, fragment = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += fragment)
          controller.enqueue(bytes.slice(i, i + fragment));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } }
  );
}
const chunk = (delta: unknown, finishReason: string | null = null) => ({
  choices: [{ index: 0, delta, finish_reason: finishReason }],
});

test.each([
  [
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    true,
  ],
  ['https://api.openai.com/v1/chat/completions', true],
  ['https://provider.example/v1/chat/completions', false],
  [
    'https://generativelanguage.googleapis.com/v1beta/models/model:streamGenerateContent',
    false,
  ],
])(
  'requests streaming usage only on documented endpoints: %s',
  async (endpoint, supported) => {
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(
      Response.json({
        choices: [{ message: { role: 'assistant', content: 'Done' } }],
      })
    );
    try {
      await requestAIProvider(
        endpoint as string,
        { body: '{}' },
        new AbortController().signal,
        jest.fn(),
        1000,
        { onText: jest.fn() }
      );
      const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
      expect(body.stream_options).toEqual(
        supported ? { include_usage: true } : undefined
      );
    } finally {
      fetcher.mockRestore();
    }
  }
);

test('retains opaque Gemini tool signatures through fragmented streaming and subsequent requests', async () => {
  const metadata = {
    google: { thought_signature: 'opaque-provider-signature' },
  };
  const payload = await readAIProviderStream(
    openai,
    response(
      sse([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: 'signed-call',
              extra_content: metadata,
              function: { name: 'read_page', arguments: '{' },
            },
          ],
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '}' } }] }),
        chunk({}, 'stop'),
        '[DONE]',
      ]),
      1
    ),
    new AbortController().signal,
    jest.fn()
  );
  expect(providerMessage(openai, payload).tool_calls[0].extra_content).toEqual(
    metadata
  );
  expect(
    providerRequest(openai, 'test', [providerMessage(openai, payload)], [])
      .messages[0].tool_calls[0].extra_content
  ).toEqual(metadata);
});

test('falls back before executing an unindexed compatible tool stream and preserves complete tool metadata', async () => {
  const tool = {
    id: 'unindexed',
    type: 'function',
    function: { name: 'read_page', arguments: '{}' },
    extra_content: { google: { thought_signature: 'opaque' } },
  };
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      response(
        sse([
          chunk({
            tool_calls: [
              { ...tool, function: { ...tool.function, arguments: '{' } },
            ],
          }),
          chunk({}, 'stop'),
          '[DONE]',
        ])
      )
    )
    .mockResolvedValueOnce(
      Response.json({
        choices: [
          {
            message: { role: 'assistant', content: null, tool_calls: [tool] },
            finish_reason: 'tool_calls',
          },
        ],
      })
    );
  const fallback = jest.fn();
  try {
    const payload = await requestAIProvider(
      openai,
      { body: '{}' },
      new AbortController().signal,
      jest.fn(),
      1000,
      { onText: jest.fn(), onFallback: fallback }
    );
    expect(payload.choices[0].message.tool_calls).toEqual([tool]);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(fetcher.mock.calls[1][1]!.body as string).stream
    ).toBeUndefined();
  } finally {
    fetcher.mockRestore();
  }
});

test('accepts complete uniquely identified unindexed calls while retaining provider metadata', async () => {
  const metadata = { google: { thought_signature: 'opaque' } };
  const payload = await readAIProviderStream(
    openai,
    response(
      sse([
        chunk({
          tool_calls: [
            {
              id: 'one',
              function: { name: 'read_page', arguments: '{}' },
              extra_content: metadata,
            },
            { id: 'two', function: { name: 'list_tabs', arguments: '{}' } },
          ],
        }),
        chunk({}, 'stop'),
        '[DONE]',
      ])
    ),
    new AbortController().signal,
    jest.fn()
  );
  expect(
    payload.choices[0].message.tool_calls.map((call: any) => call.id)
  ).toEqual(['one', 'two']);
  expect(payload.choices[0].message.tool_calls[0].extra_content).toEqual(
    metadata
  );
});

test.each(['duplicate', 'mixed'])(
  'falls back on ambiguous %s unindexed tool streams',
  async (kind) => {
    const first = {
      id: 'one',
      function: { name: 'read_page', arguments: '{}' },
    };
    const second =
      kind === 'duplicate'
        ? first
        : {
            index: 0,
            id: 'two',
            function: { name: 'list_tabs', arguments: '{}' },
          };
    await expect(
      readAIProviderStream(
        openai,
        response(
          sse([
            chunk({ tool_calls: [first, second] }),
            chunk({}, 'stop'),
            '[DONE]',
          ])
        ),
        new AbortController().signal,
        jest.fn()
      )
    ).rejects.toThrow('Use a complete response');
  }
);

test('assembles fragmented UTF-8 text, tool arguments, reasoning and usage', async () => {
  const onText = jest.fn();
  const payload = await readAIProviderStream(
    openai,
    response(
      sse([
        chunk({
          content: 'Checking café 👋',
          reasoning_content: 'private reasoning',
        }),
        chunk({
          tool_calls: [
            {
              index: 0,
              id: 'call1',
              function: { name: 'navigate', arguments: '{"url":"https://' },
            },
          ],
        }),
        chunk({
          tool_calls: [{ index: 0, function: { arguments: 'example.com"}' } }],
        }),
        chunk({}, 'tool_calls'),
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } },
        '[DONE]',
      ]),
      1
    ),
    new AbortController().signal,
    onText
  );
  expect(providerMessage(openai, payload)).toMatchObject({
    content: 'Checking café 👋',
    reasoning_content: 'private reasoning',
    tool_calls: [
      {
        id: 'call1',
        function: {
          name: 'navigate',
          arguments: '{"url":"https://example.com"}',
        },
      },
    ],
  });
  expect(payload.usage.prompt_tokens).toBe(100);
  expect(onText).toHaveBeenLastCalledWith('Checking café 👋');
  expect(onText.mock.calls.flat().join('')).not.toContain('private reasoning');
  expect(onText.mock.calls.flat().join('')).not.toContain('example.com');
});

test('preserves Claude thinking signatures, tool inputs and cumulative usage', async () => {
  const payload = await readAIProviderStream(
    anthropic,
    response(
      sse([
        {
          type: 'message_start',
          message: {
            role: 'assistant',
            content: [],
            usage: { input_tokens: 10, output_tokens: 1 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'retained' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: 'signature' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: 'Reading the page.' },
        },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'content_block_start',
          index: 2,
          content_block: {
            type: 'tool_use',
            id: 'tool1',
            name: 'read_page',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 2,
          delta: { type: 'input_json_delta', partial_json: '{"tabId":' },
        },
        {
          type: 'content_block_delta',
          index: 2,
          delta: { type: 'input_json_delta', partial_json: '"a"}' },
        },
        { type: 'content_block_stop', index: 2 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 20 },
        },
        { type: 'message_stop' },
      ])
    ),
    new AbortController().signal,
    jest.fn()
  );
  const message = providerMessage(anthropic, payload);
  expect(message.claudeContent[0]).toEqual({
    type: 'thinking',
    thinking: 'retained',
    signature: 'signature',
  });
  expect(message.tool_calls[0].function.arguments).toBe('{"tabId":"a"}');
  expect(payload.usage).toEqual({ input_tokens: 10, output_tokens: 20 });
});

test.each([
  sse([chunk({ content: 'Incomplete' })]),
  sse([
    chunk({
      tool_calls: [
        { index: 0, id: 'a', function: { name: 'navigate', arguments: '{' } },
      ],
    }),
    chunk({}, 'tool_calls'),
    '[DONE]',
  ]),
  sse([
    chunk({
      tool_calls: [
        { index: 0, id: 'a', function: { name: 'click', arguments: '{}' } },
      ],
    }),
    chunk({}, 'length'),
    '[DONE]',
  ]),
  sse([{ error: { message: 'overloaded' } }]),
])(
  'rejects incomplete or failed responses without returning executable tools',
  async (text) => {
    await expect(
      readAIProviderStream(
        openai,
        response(text),
        new AbortController().signal,
        jest.fn()
      )
    ).rejects.toThrow();
  }
);

test('abort cancels a stalled stream', async () => {
  const cancelled = jest.fn();
  const controller = new AbortController();
  const pending = readAIProviderStream(
    openai,
    new Response(new ReadableStream({ cancel: cancelled })),
    controller.signal,
    jest.fn()
  );
  controller.abort(new Error('Stopped'));
  await expect(pending).rejects.toThrow('Stopped');
  expect(cancelled).toHaveBeenCalled();
});

test('falls back once when a provider explicitly rejects streaming', async () => {
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      new Response('{"error":"stream is unsupported"}', { status: 400 })
    )
    .mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { role: 'assistant', content: 'Done' } }],
      })
    );
  const onText = jest.fn();
  const onAttempt = jest.fn();
  const onFallback = jest.fn();
  try {
    const payload = await requestAIProvider(
      'http://localhost:1234/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({ model: 'local', messages: [] }),
      },
      new AbortController().signal,
      jest.fn(),
      1000,
      { onText, onAttempt, onFallback }
    );
    expect(payload.choices[0].message.content).toBe('Done');
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).stream).toBe(
      true
    );
    expect(
      JSON.parse(fetcher.mock.calls[1][1]!.body as string)
    ).not.toHaveProperty('stream');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenLastCalledWith('');
  } finally {
    fetcher.mockRestore();
  }
});

test('does not reinterpret unrelated 400 errors as streaming incompatibility', async () => {
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response('{"error":"model unavailable"}', { status: 400 })
    );
  try {
    await expect(
      requestAIProvider(
        openai,
        { body: '{}' },
        new AbortController().signal,
        jest.fn(),
        1000,
        { onText: jest.fn() }
      )
    ).rejects.toThrow('400');
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    fetcher.mockRestore();
  }
});

test('finishes on the provider completion marker even when the connection stays open', async () => {
  const cancelled = jest.fn();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          sse([chunk({ content: 'Done' }), chunk({}, 'stop'), '[DONE]'])
        )
      );
    },
    cancel: cancelled,
  });
  const payload = await readAIProviderStream(
    openai,
    new Response(body),
    new AbortController().signal,
    jest.fn()
  );
  expect(payload.choices[0].message.content).toBe('Done');
  expect(cancelled).toHaveBeenCalled();
});

test('falls back to a full response to preserve unsupported structured reasoning', async () => {
  const finalMessage = {
    role: 'assistant',
    content: 'Done',
    reasoning_details: [{ type: 'reasoning.encrypted', data: 'retained' }],
  };
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      response(
        sse([
          chunk({
            reasoning_details: [
              { index: 0, type: 'reasoning.encrypted', data: 'partial' },
            ],
          }),
        ])
      )
    )
    .mockResolvedValueOnce(
      Response.json({ choices: [{ message: finalMessage }] })
    );
  try {
    const payload = await requestAIProvider(
      openai,
      { body: '{}' },
      new AbortController().signal,
      jest.fn(),
      1000,
      { onText: jest.fn() }
    );
    expect(payload.choices[0].message).toEqual(finalMessage);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    fetcher.mockRestore();
  }
});

test('does not pass truncated nonstreamed tool calls to the executor', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: 'length',
          message: {
            role: 'assistant',
            tool_calls: [
              { id: 'a', function: { name: 'click', arguments: '{}' } },
            ],
          },
        },
      ],
    })
  );
  try {
    await expect(
      requestAIProvider(
        openai,
        { body: '{}' },
        new AbortController().signal,
        jest.fn(),
        1000
      )
    ).rejects.toThrow('cut short');
  } finally {
    fetcher.mockRestore();
  }
});
