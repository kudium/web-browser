import { aiWaitCondition } from '../browser/aiWait';
import { pollAICondition } from '../main/aiWait';

function controller() {
  const value = new AbortController();
  Object.assign(value.signal, {
    throwIfAborted: () => {
      if (value.signal.aborted) throw new Error('Stopped.');
    },
  });
  return value;
}
afterEach(() => jest.useRealTimers());
it('validates exactly one condition and bounded timeouts', () => {
  expect(aiWaitCondition({ url: 'https://example.com' })).toEqual({
    url: 'https://example.com/',
    timeoutMs: 5000,
  });
  [
    {},
    { url: 'https://example.com', label: 'Next' },
    { label: '' },
    { label: 'Next', timeoutMs: 30001 },
  ].forEach((args) => expect(() => aiWaitCondition(args)).toThrow());
});
it('polls without overlap and returns the observed result', async () => {
  jest.useFakeTimers();
  const check = jest
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ matched: true });
  const result = pollAICondition(check, controller().signal, 1000);
  await jest.advanceTimersByTimeAsync(100);
  await expect(result).resolves.toEqual({ matched: true });
  expect(check).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
it('bounds an unresponsive observation', async () => {
  jest.useFakeTimers();
  const pending = pollAICondition(
    () => new Promise(() => {}),
    controller().signal,
    200
  );
  const rejection = pending.catch((error) => error);
  await jest.advanceTimersByTimeAsync(200);
  expect((await rejection).message).toContain('timed out');
  expect(jest.getTimerCount()).toBe(0);
});
it('Stop interrupts an unresponsive observation immediately', async () => {
  const cancellation = controller();
  const pending = pollAICondition(
    () => new Promise(() => {}),
    cancellation.signal,
    30000
  );
  cancellation.abort();
  await expect(pending).rejects.toThrow('Stopped');
});
