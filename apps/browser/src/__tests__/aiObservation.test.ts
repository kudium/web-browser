import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import { observeAIPage, AI_OBSERVATION_TIMEOUT } from '../main/aiObservation';

function page() {
  const value = Object.assign(new EventEmitter(), {
    getURL: jest.fn(() => 'https://example.com'),
    isDestroyed: jest.fn(() => false),
    stop: jest.fn(),
  });
  return { value, contents: value as unknown as WebContents };
}
afterEach(() => jest.useRealTimers());

it('returns a successful read and removes lifecycle listeners', async () => {
  const { value, contents } = page();
  await expect(
    observeAIPage(contents, new AbortController().signal, async () => ({
      text: 'Ready',
    }))
  ).resolves.toEqual({ text: 'Ready' });
  expect(value.listenerCount('destroyed')).toBe(0);
  expect(value.listenerCount('did-start-navigation')).toBe(0);
});
it('cancels an unresponsive read without stopping the website and rejects late results', async () => {
  const { value, contents } = page();
  const control = new AbortController();
  let release: (result: string) => void;
  const read = jest.fn(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      })
  );
  const pending = observeAIPage(contents, control.signal, read);
  await Promise.resolve();
  control.abort();
  await expect(pending).rejects.toThrow('Stopped');
  release!('Late');
  await Promise.resolve();
  expect(value.stop).not.toHaveBeenCalled();
  expect(value.listenerCount('destroyed')).toBe(0);
  await expect(
    observeAIPage(
      contents,
      new AbortController().signal,
      async () => 'Recovered'
    )
  ).resolves.toBe('Recovered');
});
it('times out unresponsive reads and cleans up', async () => {
  jest.useFakeTimers();
  const { value, contents } = page();
  const pending = observeAIPage(
    contents,
    new AbortController().signal,
    () => new Promise(() => {})
  );
  const failure = pending.catch((error) => error);
  jest.advanceTimersByTime(AI_OBSERVATION_TIMEOUT);
  expect(await failure).toHaveProperty(
    'message',
    expect.stringContaining('timed out')
  );
  expect(value.stop).not.toHaveBeenCalled();
  expect(value.listenerCount('did-start-navigation')).toBe(0);
});
it('rejects human navigation replacement without stopping it', async () => {
  const { value, contents } = page();
  const pending = observeAIPage(
    contents,
    new AbortController().signal,
    () => new Promise(() => {})
  );
  value.emit('did-start-navigation', {}, 'https://human.example', false, true);
  await expect(pending).rejects.toThrow('Page changed');
  expect(value.stop).not.toHaveBeenCalled();
});
it('ignores child-frame navigation for a main-page read', async () => {
  const { value, contents } = page();
  const pending = observeAIPage(
    contents,
    new AbortController().signal,
    async () => 'Ready'
  );
  value.emit('did-start-navigation', {}, 'https://frame.example', false, false);
  await expect(pending).resolves.toBe('Ready');
});
it('rejects changed final URLs even if a navigation event was missed', async () => {
  const { value, contents } = page();
  await expect(
    observeAIPage(contents, new AbortController().signal, async () => {
      value.getURL.mockReturnValue('https://other.example');
      return 'Wrong document';
    })
  ).rejects.toThrow('Page changed');
});
it('rejects closed tabs and pre-cancelled work before dispatch', async () => {
  const { value, contents } = page();
  const control = new AbortController();
  control.abort();
  const read = jest.fn(async () => 'Unused');
  await expect(observeAIPage(contents, control.signal, read)).rejects.toThrow(
    'Stopped'
  );
  expect(read).not.toHaveBeenCalled();
  value.isDestroyed.mockReturnValue(true);
  await expect(
    observeAIPage(contents, new AbortController().signal, read)
  ).rejects.toThrow('Tab closed');
  expect(read).not.toHaveBeenCalled();
});
it('reports read failures and allows the next observation', async () => {
  const { contents } = page();
  await expect(
    observeAIPage(contents, new AbortController().signal, async () => {
      throw new Error('Renderer failed');
    })
  ).rejects.toThrow('Renderer failed');
  await expect(
    observeAIPage(contents, new AbortController().signal, async () => 'Next')
  ).resolves.toBe('Next');
});

it('revokes the underlying frame execution signal when an observation times out', async () => {
  jest.useFakeTimers();
  const { contents } = page();
  let executionSignal: AbortSignal | undefined;
  const pending = observeAIPage(
    contents,
    new AbortController().signal,
    (signal) => {
      executionSignal = signal;
      return new Promise(() => {});
    }
  );
  const failure = pending.catch((error) => error);
  await Promise.resolve();
  jest.advanceTimersByTime(AI_OBSERVATION_TIMEOUT);
  await failure;
  expect(executionSignal?.aborted).toBe(true);
});

it('aborts pending page execution on renderer exit and ignores late resolution', async () => {
  const { value, contents } = page();
  let execution: AbortSignal | undefined;
  let release: (result: string) => void = () => {};
  const pending = observeAIPage(
    contents,
    new AbortController().signal,
    (signal) => {
      execution = signal;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    }
  );
  await Promise.resolve();
  value.emit('render-process-gone', {}, { reason: 'crashed' });
  await expect(pending).rejects.toThrow('renderer exited');
  expect(execution?.aborted).toBe(true);
  release('Stale page');
  expect(value.stop).not.toHaveBeenCalled();
  expect(value.listenerCount('render-process-gone')).toBe(0);
});
