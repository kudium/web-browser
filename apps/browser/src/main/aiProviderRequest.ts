import { fetchAppleAI } from './aiApple';
import { fetchOllamaThinking } from './aiOllamaThinking';
/* Retry inference only: browser effects remain outside this request boundary. */
/* eslint-disable no-await-in-loop, no-continue */
import { aiProviderURL } from '../browser/ai';
import {
  readAIProviderStream,
  UnsupportedAIStreamError,
} from './aiProviderStream';

/** Never forward private provider requests through an endpoint redirect. */
export async function fetchAIProvider(url: string, request: RequestInit) {
  const response =
    (await fetchAppleAI(aiProviderURL(url), request)) ??
    (await fetchOllamaThinking(aiProviderURL(url), request)) ??
    (await fetch(aiProviderURL(url), {
      ...request,
      redirect: 'manual',
    }));
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
  budgetMs = 90000,
  options: {
    onText?: (text: string) => void;
    onAttempt?: () => void;
    onFallback?: () => void;
  } = {}
): Promise<any> {
  const endpoint = aiProviderURL(url);
  const providerURL = new URL(endpoint);
  const streamingUsage =
    providerURL.hostname === 'api.openai.com' ||
    (providerURL.hostname === 'generativelanguage.googleapis.com' &&
      /^\/v1beta\/openai\/chat\/completions\/?$/.test(providerURL.pathname));
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const deadline = Date.now() + budgetMs;
  let streaming = !!options.onText;
  let fallbackUsed = false;
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
        options.onText?.('');
        const body =
          streaming && typeof request.body === 'string'
            ? JSON.stringify({
                ...JSON.parse(request.body),
                stream: true,
                ...(streamingUsage
                  ? { stream_options: { include_usage: true } }
                  : {}),
              })
            : request.body;
        options.onAttempt?.();
        const response = await fetchAIProvider(endpoint, {
          ...request,
          body,
          signal: controller.signal,
        });
        check();
        if (response.ok) {
          const payload = response.headers
            .get('content-type')
            ?.includes('text/event-stream')
            ? await readAIProviderStream(
                endpoint,
                response,
                controller.signal,
                options.onText ?? (() => {})
              )
            : await response.json();
          check();
          const finish =
            payload?.choices?.[0]?.finish_reason ?? payload?.stop_reason;
          if (
            ['length', 'max_tokens', 'content_filter', 'refusal'].includes(
              finish
            )
          )
            throw new Error(
              'The AI response was cut short. No tools from this response were executed.'
            );
          return payload;
        }
        error = new Error(
          response.status === 400
            ? 'The AI provider rejected this request (400). This can be caused by conversation size or an unsupported message/tool format. Try a new chat; completed actions are not undone by this error.'
            : `Provider returned ${response.status}. Check the provider configuration and availability.`
        );
        if (
          streaming &&
          !fallbackUsed &&
          [400, 422].includes(response.status)
        ) {
          const detail = (await response.text()).slice(0, 4000);
          if (
            /stream/i.test(detail) &&
            /unsupported|not supported|unknown|unrecognized|unexpected|not allowed/i.test(
              detail
            )
          ) {
            streaming = false;
            fallbackUsed = true;
            options.onFallback?.();
            attempt -= 1;
            continue;
          }
        }
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
        if (
          reason instanceof UnsupportedAIStreamError &&
          streaming &&
          !fallbackUsed
        ) {
          streaming = false;
          fallbackUsed = true;
          options.onFallback?.();
          attempt -= 1;
          continue;
        }
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
    options.onText?.('');
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
