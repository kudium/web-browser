/** @jest-environment node */
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { APPLE_AI_ENDPOINT, isLocalAIEndpoint } from '../browser/aiProviders';
import { fetchAppleAI } from '../main/aiApple';

jest.mock('electron', () => ({
  app: { getAppPath: () => '/fixture', isPackaged: true },
}));
jest.mock('fs', () => ({ existsSync: () => true }));
jest.mock('child_process', () => ({ spawn: jest.fn() }));

let child: any;
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch')!;
beforeEach(() => {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: 'darwin',
  });
  Object.defineProperty(process, 'arch', {
    configurable: true,
    value: 'arm64',
  });
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: '/fixture',
  });
  child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: jest.fn(),
  });
  (spawn as jest.Mock).mockReset().mockReturnValue(child);
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(process, 'platform', originalPlatform);
  Object.defineProperty(process, 'arch', originalArch);
});
const request = () => ({
  body: JSON.stringify({
    model: 'apple-on-device',
    messages: [],
    tools: [{ function: { name: 'list_tabs' } }],
  }),
});
const complete = (name = 'list_tabs', args = '{}') => {
  child.stdout.write(
    JSON.stringify({
      choices: [
        {
          message: {
            content: '',
            tool_calls: [{ function: { name, arguments: args } }],
          },
        },
      ],
    })
  );
  child.emit('close', 0);
};

it('classifies only the reserved Apple endpoint as keyless', () => {
  expect(isLocalAIEndpoint(APPLE_AI_ENDPOINT)).toBe(true);
  expect(isLocalAIEndpoint(`${APPLE_AI_ENDPOINT}.evil`)).toBe(false);
});
it('leaves cloud providers to their transport', async () => {
  expect(
    await fetchAppleAI('https://api.openai.com/v1/models', {})
  ).toBeUndefined();
  expect(spawn).not.toHaveBeenCalled();
});
it('returns generated actions without executing them', async () => {
  const pending = fetchAppleAI(
    `${APPLE_AI_ENDPOINT}/chat/completions`,
    request()
  );
  complete();
  expect(
    (await (await pending)!.json()).choices[0].message.tool_calls[0].function
      .name
  ).toBe('list_tabs');
});
it.each([
  ['unknown_tool', '{}'],
  ['list_tabs', '[]'],
])('rejects invalid generated actions %s', async (name, args) => {
  const pending = fetchAppleAI(
    `${APPLE_AI_ENDPOINT}/chat/completions`,
    request()
  );
  complete(name, args);
  await expect(pending).rejects.toThrow('No actions were executed');
});
it('cancels the native process', async () => {
  const controller = new AbortController();
  const pending = fetchAppleAI(`${APPLE_AI_ENDPOINT}/chat/completions`, {
    ...request(),
    signal: controller.signal,
  });
  controller.abort(new Error('Stopped'));
  await expect(pending).rejects.toThrow('Stopped');
  expect(child.kill).toHaveBeenCalled();
});
it('reports model unavailability without cloud fallback', async () => {
  const pending = fetchAppleAI(`${APPLE_AI_ENDPOINT}/models`, {});
  child.stdout.write(
    JSON.stringify({ error: 'Apple Intelligence is disabled' })
  );
  child.emit('close', 1);
  await expect(pending).rejects.toThrow('Apple Intelligence is disabled');
});

it('retries a context overflow once locally before exposing any actions', async () => {
  let attempts = 0;
  (spawn as jest.Mock).mockImplementation(() => {
    const processChild = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(),
    });
    attempts += 1;
    const attempt = attempts;
    queueMicrotask(() => {
      processChild.stdout.write(
        JSON.stringify(
          attempt === 1
            ? { error: 'Too much context', code: 'context_limit' }
            : { choices: [{ message: { content: 'Done', tool_calls: [] } }] }
        )
      );
      processChild.emit('close', attempt === 1 ? 1 : 0);
    });
    return processChild;
  });
  const result = await fetchAppleAI(
    `${APPLE_AI_ENDPOINT}/chat/completions`,
    request()
  );
  expect((await result!.json()).choices[0].message.content).toBe('Done');
  expect(attempts).toBe(2);
});

it('does not compact or retry Apple inference when context management is off', async () => {
  const pending = fetchAppleAI(`${APPLE_AI_ENDPOINT}/chat/completions`, {
    body: JSON.stringify({
      model: 'apple-on-device',
      kudium_context_management: false,
      messages: [{ role: 'user', content: 'Full history '.repeat(500) }],
      tools: [],
    }),
  });
  child.stdout.write(
    JSON.stringify({ error: 'Too much context', code: 'context_limit' })
  );
  child.emit('close', 1);
  await expect(pending).rejects.toThrow('Enable Context window management');
  expect(spawn).toHaveBeenCalledTimes(1);
});


it('adapts repeatedly to native token overflow and keeps preference off the wire', async () => {
  const packets: any[] = [];
  (spawn as jest.Mock).mockImplementation(() => {
    const processChild = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(),
    });
    let input = '';
    processChild.stdin.on('data', (chunk: Buffer) => {
      input += chunk.toString();
    });
    processChild.stdin.on('finish', () => {
      packets.push(JSON.parse(input));
      const overflow = packets.length < 4;
      processChild.stdout.write(
        JSON.stringify(
          overflow
            ? {
                error: 'Provided 4,290 tokens, but the maximum allowed is 4,096.',
                code: 'inference_failed',
              }
            : { choices: [{ message: { content: 'Done', tool_calls: [] } }] },
        ),
      );
      processChild.emit('close', overflow ? 1 : 0);
    });
    return processChild;
  });
  const result = await fetchAppleAI(`${APPLE_AI_ENDPOINT}/chat/completions`, {
    body: JSON.stringify({
      model: 'apple-on-device',
      kudium_context_management: true,
      messages: [
        { role: 'user', content: 'Explain this page' },
        {
          role: 'tool',
          tool_call_id: 'page',
          content: 'Evidence '.repeat(300),
        },
      ],
      tools: [],
    }),
  });
  expect((await result!.json()).choices[0].message.content).toBe('Done');
  expect(packets).toHaveLength(4);
  packets.forEach((packet) =>
    expect(packet).not.toHaveProperty('kudium_context_management'),
  );
  expect(JSON.stringify(packets[3]).length).toBeLessThan(
    JSON.stringify(packets[0]).length,
  );
});
