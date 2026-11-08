/* eslint-disable no-await-in-loop -- stream reads must remain ordered and bounded */
import { imageSize } from 'image-size';

const maximumBytes = 1024 * 1024;

/** Preflight the PNG/JPEG/ICO buffer formats supported by nativeImage decoding. */
export function validateFaviconDimensions(bytes: Buffer) {
  const size = imageSize(bytes);
  if (
    !['png', 'jpg', 'ico'].includes(size.type || '') ||
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width < 1 ||
    size.height < 1 ||
    size.width > 2048 ||
    size.height > 2048
  )
    throw new Error('Favicon format or dimensions exceed supported limits.');
}

/** Enforce the decoded body limit while reading, independent of HTTP headers. */
export async function readFaviconBody(
  response: Response,
  signal: AbortSignal
): Promise<Buffer> {
  const length = response.headers.get('content-length');
  if (
    !response.ok ||
    (length && /^\d+$/.test(length) && Number(length) > maximumBytes)
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Favicon response is unavailable or too large.');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const abort = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  let completed = false;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    // eslint-disable-next-line no-constant-condition -- EOF and errors terminate the reader
    while (true) {
      signal.throwIfAborted();
      const result = await reader.read();
      signal.throwIfAborted();
      if (result.done) {
        completed = true;
        return Buffer.concat(chunks, size);
      }
      size += result.value.byteLength;
      if (size > maximumBytes)
        throw new Error('Favicon response is too large.');
      chunks.push(Buffer.from(result.value));
    }
  } finally {
    signal.removeEventListener('abort', abort);
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

interface Pending {
  start: () => void;
  cancel: () => void;
}

/** Four active fetch/read/decode operations per owning browser window. */
export class FaviconLoader {
  private requests = new Map<string, AbortController>();

  private pending: Pending[] = [];

  private active = 0;

  cancel(id: string) {
    this.requests.get(id)?.abort();
    this.requests.delete(id);
  }

  clear() {
    this.requests.forEach((controller) => controller.abort());
    this.requests.clear();
  }

  private slot(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const pending: Pending = {
        start: () => {
          signal.removeEventListener('abort', pending.cancel);
          this.active += 1;
          resolve(() => {
            this.active -= 1;
            this.pending.shift()?.start();
          });
        },
        cancel: () => {
          signal.removeEventListener('abort', pending.cancel);
          this.pending = this.pending.filter((item) => item !== pending);
          reject(signal.reason);
        },
      };
      signal.addEventListener('abort', pending.cancel, { once: true });
      if (signal.aborted) pending.cancel();
      else if (this.active < 4) pending.start();
      else this.pending.push(pending);
    });
  }

  async load(
    id: string,
    url: string,
    fetch: (
      address: string,
      options: { signal: AbortSignal }
    ) => Promise<Response>,
    accept: (bytes: Buffer) => void
  ): Promise<void> {
    this.cancel(id);
    const controller = new AbortController();
    this.requests.set(id, controller);
    const timer = setTimeout(() => controller.abort(), 10000);
    timer.unref?.();
    let release: (() => void) | undefined;
    try {
      release = await this.slot(controller.signal);
      controller.signal.throwIfAborted();
      const response = await fetch(url, { signal: controller.signal });
      const bytes = await readFaviconBody(response, controller.signal);
      controller.signal.throwIfAborted();
      if (this.requests.get(id) === controller) accept(bytes);
    } finally {
      // Cancel the underlying transport too: cancelling the reader alone does
      // not necessarily stop Electron from downloading the remaining body.
      controller.abort();
      clearTimeout(timer);
      if (this.requests.get(id) === controller) this.requests.delete(id);
      release?.();
    }
  }
}
