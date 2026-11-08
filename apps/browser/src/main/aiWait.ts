/* eslint-disable no-await-in-loop */
export async function pollAICondition<T>(
  check: () => Promise<T | undefined>,
  signal: AbortSignal,
  timeoutMs: number
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  const timeoutError = () =>
    new Error('Wait timed out. The condition was not observed.');
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const result = await new Promise<T | undefined>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      let abort: () => void;
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      };
      abort = () => {
        cleanup();
        reject(new Error('Stopped.'));
      };
      timer = setTimeout(() => {
        cleanup();
        reject(timeoutError());
      }, Math.max(1, deadline - Date.now()));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      check()
        .then((value) => {
          cleanup();
          resolve(value);
          return undefined;
        })
        .catch((error) => {
          cleanup();
          reject(error);
        });
    });
    signal.throwIfAborted();
    if (Date.now() >= deadline) break;
    if (result !== undefined) return result;
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('Stopped.'));
      };
      timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, Math.min(100, Math.max(1, deadline - Date.now())));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  throw timeoutError();
}
