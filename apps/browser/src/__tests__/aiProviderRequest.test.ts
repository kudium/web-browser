/** @jest-environment node */
import { requestAIProvider } from '../main/aiProviderRequest';

const response = (
  status: number,
  json: () => Promise<unknown>,
  retryAfter: string | null = null
) => ({
  ok: status >= 200 && status < 300,
  status,
  json,
  headers: { get: () => retryAfter },
  body: { cancel: jest.fn().mockResolvedValue(undefined) },
});
let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = global.fetch;
  jest.useFakeTimers();
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

it('retries a transient status with the identical conversation and honors Retry-After', async () => {
  const retry = jest.fn();
  const body = JSON.stringify({
    messages: [{ role: 'tool', content: 'Already entered text.' }],
  });
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(response(429, async () => ({}), '2'))
    .mockResolvedValueOnce(response(200, async () => ({ completed: true })));
  const pending = requestAIProvider(
    'https://provider.test',
    { method: 'POST', body },
    new AbortController().signal,
    retry
  );
  await jest.advanceTimersByTimeAsync(1999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toEqual({ completed: true });
  expect((fetch as jest.Mock).mock.calls.map(([, init]) => init.body)).toEqual([
    body,
    body,
  ]);
  expect(retry).toHaveBeenCalledWith(2);
  expect(jest.getTimerCount()).toBe(0);
});

it('retries truncated JSON before any response can reach browser execution', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      response(200, async () => {
        throw new SyntaxError('Truncated JSON');
      })
    )
    .mockResolvedValueOnce(response(200, async () => ({ ok: true })));
  const pending = requestAIProvider(
    'https://provider.test',
    {},
    new AbortController().signal,
    jest.fn()
  );
  await jest.advanceTimersByTimeAsync(500);
  await expect(pending).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not retry authentication errors', async () => {
  global.fetch = jest.fn().mockResolvedValue(response(401, async () => ({})));
  await expect(
    requestAIProvider(
      'https://provider.test',
      {},
      new AbortController().signal,
      jest.fn()
    )
  ).rejects.toThrow('Provider returned 401');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('Stop during backoff prevents the next inference request and clears timers', async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Network failed'));
  const controller = new AbortController();
  const pending = requestAIProvider(
    'https://provider.test',
    {},
    controller.signal,
    jest.fn()
  );
  const rejected = pending.catch((reason: Error) => reason);
  await jest.advanceTimersByTimeAsync(100);
  controller.abort(new Error('Stopped by user'));
  expect((await rejected).message).toBe('Stopped by user');
  await jest.advanceTimersByTimeAsync(10000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('bounds network retries to three inference requests', async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Network failed'));
  const pending = requestAIProvider(
    'https://provider.test',
    {},
    new AbortController().signal,
    jest.fn()
  );
  const rejected = pending.catch((reason: Error) => reason);
  await jest.advanceTimersByTimeAsync(1500);
  expect((await rejected).message).toBe('Network failed');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(jest.getTimerCount()).toBe(0);
});

it('enforces the whole-request deadline without marking a user Stop', async () => {
  const outer = new AbortController();
  global.fetch = jest.fn(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => reject(init!.signal!.reason),
          { once: true }
        );
      })
  );
  const pending = requestAIProvider(
    'https://provider.test',
    {},
    outer.signal,
    jest.fn(),
    100
  ).catch((reason: Error) => reason);
  await jest.advanceTimersByTimeAsync(100);
  expect((await pending).message).toBe('AI provider request timed out.');
  expect(outer.signal.aborted).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
