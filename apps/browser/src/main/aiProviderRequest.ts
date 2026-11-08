/* Retry inference only: browser effects remain outside this request boundary. */
/* eslint-disable no-await-in-loop */
import { aiProviderURL } from '../browser/ai';

/** Never forward private provider requests through an endpoint redirect. */
export async function fetchAIProvider(url: string, request: RequestInit) {
  const response = await fetch(aiProviderURL(url), {
    ...request,
    redirect: 'manual',
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw new Error(
      'AI provider redirects are blocked. Configure the final HTTPS endpoint directly.'
    );
  }
  return response;
}

export async function requestAIProvider(
  url: string,
  request: RequestInit,
  signal: AbortSignal,
  retrying: (attempt: number) => void,
  budgetMs = 90000
): Promise<any> {
  const endpoint = aiProviderURL(url);
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const deadline = Date.now() + budgetMs;
  const timeout = setTimeout(
    () => controller.abort(new Error('AI provider request timed out.')),
    budgetMs
  );
  const check = () => controller.signal.throwIfAborted();
  const delay = (milliseconds: number) =>
    new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const stopped = () => {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', stopped);
        reject(controller.signal.reason);
      };
      timer = setTimeout(() => {
        controller.signal.removeEventListener('abort', stopped);
        resolve();
      }, milliseconds);
      controller.signal.addEventListener('abort', stopped, { once: true });
      if (controller.signal.aborted) stopped();
    });
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      check();
      let error: unknown;
      let backoff = 500 * 2 ** attempt;
      try {
        const response = await fetchAIProvider(endpoint, {
          ...request,
          signal: controller.signal,
        });
        check();
        if (response.ok) {
          const payload = await response.json();
          check();
          return payload;
        }
        error = new Error(
          `Provider returned ${response.status}. Check your API key, model, and endpoint.`
        );
        await response.body?.cancel().catch(() => {});
        if (![408, 429, 500, 502, 503, 504, 529].includes(response.status))
          throw error;
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const seconds = Number(retryAfter);
          const requested = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(retryAfter) - Date.now();
          if (Number.isFinite(requested) && requested >= 0) backoff = requested;
        }
      } catch (reason) {
        check();
        if (reason === error) throw reason;
        if (!(reason instanceof TypeError) && !(reason instanceof SyntaxError))
          throw reason;
        error = reason;
      }
      check();
      if (attempt === 2 || Date.now() + backoff >= deadline) throw error;
      retrying(attempt + 2);
      await delay(backoff);
    }
    throw new Error('AI provider request failed.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
