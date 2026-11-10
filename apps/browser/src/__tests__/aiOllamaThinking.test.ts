/** @jest-environment node */
import { fetchOllamaThinking } from '../main/aiOllamaThinking';
import { aiThinking, thinkingOptions } from '../browser/aiThinking';

it('validates saved thinking preferences and offers controls for supported providers', () => {
  expect(aiThinking('untrusted')).toBe('auto');
  expect(thinkingOptions('https://api.openai.com/v1', 'gpt-4.1')).toHaveLength(
    1
  );
  expect(
    thinkingOptions('http://localhost:11434/v1', 'qwen3:8b').map(
      (item) => item.id
    )
  ).toEqual(['auto', 'off', 'on']);
});

it('translates thinking, tool history, images and usage through native Ollama', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        message: {
          content: '',
          thinking: 'private reasoning',
          tool_calls: [{ function: { name: 'read_page', arguments: {} } }],
        },
        done_reason: 'stop',
        prompt_eval_count: 21,
        eval_count: 13,
      })
    )
  );
  try {
    const response = await fetchOllamaThinking(
      'http://localhost:11434/v1/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({
          model: 'qwen3:8b',
          think: true,
          stream: true,
          messages: [
            {
              role: 'assistant',
              reasoning_content: 'earlier thinking',
              tool_calls: [
                {
                  id: 'call-1',
                  function: { name: 'read_page', arguments: '{}' },
                },
              ],
            },
            { role: 'tool', tool_call_id: 'call-1', content: 'page' },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Look' },
                {
                  type: 'image_url',
                  image_url: { url: 'data:image/png;base64,fixture' },
                },
              ],
            },
          ],
          tools: [],
        }),
      }
    );
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const sent = JSON.parse(request!.body as string);
    expect(sent).toMatchObject({ think: true, stream: false });
    expect(sent.messages[0].thinking).toBe('earlier thinking');
    expect(sent.messages[1].tool_name).toBe('read_page');
    expect(sent.messages[2].images).toEqual(['fixture']);
    const payload = await response!.json();
    expect(payload.choices[0].message.tool_calls[0].function.arguments).toBe(
      '{}'
    );
    expect(payload.usage).toEqual({ prompt_tokens: 21, completion_tokens: 13 });
  } finally {
    fetcher.mockRestore();
  }
});

it('does not alter default or remote provider requests', async () => {
  const fetcher = jest.spyOn(global, 'fetch');
  try {
    expect(
      await fetchOllamaThinking('http://localhost:11434/v1/chat/completions', {
        body: '{}',
      })
    ).toBeUndefined();
    expect(
      await fetchOllamaThinking('https://api.openai.com/v1/chat/completions', {
        body: '{"think":true}',
      })
    ).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    fetcher.mockRestore();
  }
});
