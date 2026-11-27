import type { NativeImage, WebContents } from 'electron';
import { withAIProtocol } from './aiProtocol';

export type AIScreenshotFormat = 'jpeg' | 'png' | 'webp';
export interface AIScreenshotOptions {
  /** jpeg (default) and png come from the compositor; webp needs the page protocol. */
  format?: AIScreenshotFormat;
  /** 0.1–1 of the captured pixels; 0.5 (default) maps a 2x display to CSS pixels. */
  scale?: number;
  /** 1–100 for jpeg and webp. */
  quality?: number;
}
export const AI_SCREENSHOT_DEFAULTS: {
  format: AIScreenshotFormat;
  scale: number;
  quality: number;
} = { format: 'jpeg', scale: 0.5, quality: 80 };
const AI_SCREENSHOT_LIMIT = 12 * 1024 * 1024;
const MIME_TYPES: Record<AIScreenshotFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Capture only the owned webpage; application sidebar and preferences stay out. */
function compositorCapture(contents: WebContents, signal: AbortSignal) {
  return new Promise<NativeImage>((resolve, reject) => {
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
        if (value.isEmpty()) reject(new Error('Display surface is unavailable.'));
        else resolve(value);
        return undefined;
      })
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}

function protocolCapture(
  contents: WebContents,
  signal: AbortSignal,
  format: AIScreenshotFormat,
  scale = 1,
  quality = AI_SCREENSHOT_DEFAULTS.quality
) {
  return withAIProtocol(contents, signal, async (send) => {
    const parameters: Record<string, unknown> = {
      format,
      fromSurface: true,
      captureBeyondViewport: false,
    };
    if (format !== 'png') parameters.quality = quality;
    if (scale < 1) {
      const { cssVisualViewport } = await send('Page.getLayoutMetrics');
      if (cssVisualViewport?.clientWidth && cssVisualViewport?.clientHeight)
        parameters.clip = {
          x: 0,
          y: 0,
          width: cssVisualViewport.clientWidth,
          height: cssVisualViewport.clientHeight,
          scale,
        };
    }
    const result = await send('Page.captureScreenshot', parameters);
    if (typeof result.data !== 'string' || !result.data)
      throw new Error('Display surface is unavailable.');
    return result.data as string;
  });
}

/** Full-size PNG for human export; shares capture with the AI path. */
export async function capturePagePNG(
  contents: WebContents,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  if (contents.isDestroyed()) throw new Error('Tab closed before screenshot.');
  let data: string;
  try {
    const screenshot = await compositorCapture(contents, signal);
    signal.throwIfAborted();
    data = screenshot.toPNG().toString('base64');
  } catch (error) {
    signal.throwIfAborted();
    data = await protocolCapture(contents, signal, 'png').catch(() => {
      throw error;
    });
  }
  signal.throwIfAborted();
  if (contents.isDestroyed()) throw new Error('Tab closed during screenshot.');
  return data;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** A model-sized image: half scale JPEG by default, PNG or WebP on request. */
export async function captureAIPage(
  contents: WebContents,
  signal: AbortSignal,
  options: AIScreenshotOptions = {}
): Promise<{ data: string; mimeType: string }> {
  const format = options.format ?? AI_SCREENSHOT_DEFAULTS.format;
  const scale = clamp(
    Number.isFinite(options.scale) ? Number(options.scale) : AI_SCREENSHOT_DEFAULTS.scale,
    0.1,
    1
  );
  const quality = clamp(
    Math.round(
      Number.isFinite(options.quality)
        ? Number(options.quality)
        : AI_SCREENSHOT_DEFAULTS.quality
    ),
    1,
    100
  );
  signal.throwIfAborted();
  if (contents.isDestroyed()) throw new Error('Tab closed before screenshot.');
  let data: string | undefined;
  let mimeType = MIME_TYPES[format];
  if (format === 'webp') {
    // Only the page protocol encodes WebP; a tab open in DevTools falls back to JPEG.
    try {
      data = await protocolCapture(contents, signal, 'webp', scale, quality);
    } catch {
      signal.throwIfAborted();
    }
  }
  if (data === undefined) {
    const encoded: Exclude<AIScreenshotFormat, 'webp'> =
      format === 'png' ? 'png' : 'jpeg';
    mimeType = MIME_TYPES[encoded];
    try {
      const image = await compositorCapture(contents, signal);
      signal.throwIfAborted();
      const sized =
        scale < 1
          ? image.resize({
              width: Math.max(1, Math.round(image.getSize().width * scale)),
              quality: 'good',
            })
          : image;
      data = (
        encoded === 'png' ? sized.toPNG() : sized.toJPEG(quality)
      ).toString('base64');
    } catch (error) {
      signal.throwIfAborted();
      data = await protocolCapture(
        contents,
        signal,
        encoded,
        scale,
        quality
      ).catch(() => {
        throw error;
      });
    }
  }
  signal.throwIfAborted();
  if (contents.isDestroyed()) throw new Error('Tab closed during screenshot.');
  if (data.length > AI_SCREENSHOT_LIMIT)
    throw new Error(
      'Screenshot is too large for AI. Reduce the browser window size or the scale.'
    );
  return { data, mimeType };
}
