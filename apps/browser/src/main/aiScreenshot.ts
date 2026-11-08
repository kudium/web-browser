import type { WebContents } from 'electron';
import { withAIProtocol } from './aiProtocol';

/** Capture only the owned webpage; application sidebar and preferences stay out. */
export async function capturePagePNG(
  contents: WebContents,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  if (contents.isDestroyed()) throw new Error('Tab closed before screenshot.');
  let data: string;
  try {
    const screenshot = await new Promise<
      Awaited<ReturnType<WebContents['capturePage']>>
    >((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      let abort: () => void;
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      };
      abort = () => {
        cleanup();
        reject(signal.reason);
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Display capture timed out.'));
      }, 1000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      Promise.resolve()
        .then(() => {
          signal.throwIfAborted();
          return contents.capturePage();
        })
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
    if (screenshot.isEmpty())
      throw new Error('Display surface is unavailable.');
    data = screenshot.toPNG().toString('base64');
  } catch (error) {
    signal.throwIfAborted();
    data = await withAIProtocol(contents, signal, async (send) => {
      const result = await send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      if (typeof result.data !== 'string' || !result.data) throw error;
      return result.data;
    });
  }
  signal.throwIfAborted();
  if (contents.isDestroyed()) throw new Error('Tab closed during screenshot.');
  return data;
}

/** Preserve the AI payload limit while sharing capture with human export. */
export async function captureAIPage(
  contents: WebContents,
  signal: AbortSignal
) {
  const data = await capturePagePNG(contents, signal);
  if (data.length > 12 * 1024 * 1024)
    throw new Error(
      'Screenshot is too large for AI. Reduce the browser window size.'
    );
  return data;
}
