/** @jest-environment node */
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { AppleAIDaemon } from '../main/aiAppleDaemon';

jest.mock('electron', () => ({ app: { getAppPath: () => '/app', isPackaged: true } }));

function fakeHelper(handler: (request: any) => Record<string, unknown> | undefined) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    kill: jest.fn(),
  });
  child.stdout.write('{"ready":true}\n');
  let buffered = '';
  child.stdin.on('data', (chunk) => {
    buffered += String(chunk);
    const lines = buffered.split('\n');
    buffered = lines.pop() || '';
    lines.forEach((line) => {
      const request = JSON.parse(line);
      const reply = handler(request);
      if (reply) child.stdout.write(`${JSON.stringify({ id: request.id, ...reply })}\n`);
    });
  });
  return child;
}

const frame = {
  instructions: 'drive',
  goal: 'save',
  state: 'none',
  observation: '@1 [button] "Save"',
  choices: [{ action: 'click', description: 'Click' }, { action: 'answer', description: 'Answer' }],
};

it('keeps one helper process, prewarms a conversation and returns validated guided steps', async () => {
  const seen: any[] = [];
  const spawnHelper = jest.fn(() =>
    fakeHelper((request) => {
      seen.push(request);
      if (request.type === 'prewarm') return { prewarmed: true };
      if (request.type === 'step') return { step: { action: 'click', target: '@1', text: 7, done: false } };
      return { ended: true };
    })
  );
  const daemon = new AppleAIDaemon({ spawnHelper: spawnHelper as any });
  await expect(daemon.prewarm('chat-1', 'drive')).resolves.toMatchObject({ prewarmed: true });
  await expect(daemon.step('chat-1', frame)).resolves.toEqual({ action: 'click', target: '@1', done: false });
  await daemon.end('chat-1');
  expect(spawnHelper).toHaveBeenCalledTimes(1);
  expect(seen.map((request) => request.type)).toEqual(['prewarm', 'step', 'end']);
  expect(seen[1].frame).toEqual(frame);
});

it('surfaces context overflow and off-menu actions as typed errors and restarts after exit', async () => {
  let helper: ReturnType<typeof fakeHelper>;
  const spawnHelper = jest.fn(() => {
    helper = fakeHelper((request) =>
      request.frame?.goal === 'overflow'
        ? { error: 'Provided 5000 tokens but the maximum allowed is 4096', code: 'context_limit' }
        : { step: { action: 'type' } }
    );
    return helper;
  });
  const daemon = new AppleAIDaemon({ spawnHelper: spawnHelper as any });
  await expect(daemon.step('c', { ...frame, goal: 'overflow' })).rejects.toMatchObject({ code: 'context_limit' });
  await expect(daemon.step('c', frame)).rejects.toMatchObject({ code: 'invalid' });
  helper!.exitCode = 1;
  helper!.emit('exit', 1);
  await expect(
    new AppleAIDaemon({
      spawnHelper: (() => fakeHelper(() => ({ step: { action: 'answer', text: 'ok' } }))) as any,
    }).step('c', frame)
  ).resolves.toEqual({ action: 'answer', text: 'ok' });
  await daemon.step('c', { ...frame, choices: [{ action: 'type', description: 't' }] });
  expect(spawnHelper).toHaveBeenCalledTimes(2);
});

it('times out a stalled step', async () => {
  jest.useFakeTimers();
  const daemon = new AppleAIDaemon({ spawnHelper: (() => fakeHelper(() => undefined)) as any, stepTimeoutMs: 50 });
  const pending = daemon.step('c', frame);
  const outcome = pending.catch((error) => error);
  await Promise.resolve();
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(60);
  await expect(outcome).resolves.toMatchObject({ code: 'inference_failed' });
  jest.useRealTimers();
});
