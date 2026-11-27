/** @jest-environment node */
import { captureAIPage, capturePagePNG } from '../main/aiScreenshot';
import { withAIProtocol } from '../main/aiProtocol';

jest.mock('../main/aiProtocol', () => ({ withAIProtocol: jest.fn() }));
function image(width = 1600) {
  const value: any = {
    isEmpty: () => false,
    getSize: () => ({ width, height: Math.round(width * 0.6) }),
    toPNG: jest.fn(() => Buffer.from(`png-${width}`)),
    toJPEG: jest.fn((quality: number) => Buffer.from(`jpeg-${width}-${quality}`)),
    resize: jest.fn(({ width: next }: { width: number }) => image(next)),
  };
  return value;
}
function page(captured = image()) {
  return {
    isDestroyed: jest.fn(() => false),
    capturePage: jest.fn().mockResolvedValue(captured),
  } as any;
}
const protocol = (send: jest.Mock) =>
  (withAIProtocol as jest.Mock).mockImplementation((_page, _signal, execute) =>
    execute(send)
  );
afterEach(() => jest.clearAllMocks());

it('returns a half-scale JPEG from the compositor without attaching a debugger', async () => {
  const captured = image(1600);
  const contents = page(captured);
  await expect(
    captureAIPage(contents, new AbortController().signal)
  ).resolves.toEqual({
    data: Buffer.from('jpeg-800-80').toString('base64'),
    mimeType: 'image/jpeg',
  });
  expect(captured.resize).toHaveBeenCalledWith({ width: 800, quality: 'good' });
  expect(withAIProtocol).not.toHaveBeenCalled();
});

it('returns full-size PNG when asked', async () => {
  const captured = image(1600);
  await expect(
    captureAIPage(page(captured), new AbortController().signal, {
      format: 'png',
      scale: 1,
    })
  ).resolves.toEqual({
    data: Buffer.from('png-1600').toString('base64'),
    mimeType: 'image/png',
  });
  expect(captured.resize).not.toHaveBeenCalled();
});

it('encodes WebP through the page protocol with a scaled viewport clip', async () => {
  const send = jest.fn(async (method: string) =>
    method === 'Page.getLayoutMetrics'
      ? { cssVisualViewport: { clientWidth: 1200, clientHeight: 700 } }
      : { data: 'webp-data' }
  );
  protocol(send);
  const contents = page();
  await expect(
    captureAIPage(contents, new AbortController().signal, { format: 'webp' })
  ).resolves.toEqual({ data: 'webp-data', mimeType: 'image/webp' });
  expect(send).toHaveBeenCalledWith('Page.captureScreenshot', {
    format: 'webp',
    fromSurface: true,
    captureBeyondViewport: false,
    quality: 80,
    clip: { x: 0, y: 0, width: 1200, height: 700, scale: 0.5 },
  });
  expect(contents.capturePage).not.toHaveBeenCalled();
});

it('falls back to compositor JPEG when WebP protocol capture is unavailable', async () => {
  (withAIProtocol as jest.Mock).mockRejectedValue(
    new Error('This tab is being debugged.')
  );
  await expect(
    captureAIPage(page(image(1000)), new AbortController().signal, {
      format: 'webp',
    })
  ).resolves.toEqual({
    data: Buffer.from('jpeg-500-80').toString('base64'),
    mimeType: 'image/jpeg',
  });
});

it('falls back to bounded protocol capture when the compositor surface is empty', async () => {
  const contents = page({ isEmpty: () => true });
  const send = jest.fn().mockResolvedValue({ data: 'png-data' });
  protocol(send);
  await expect(
    captureAIPage(contents, new AbortController().signal, {
      format: 'png',
      scale: 1,
    })
  ).resolves.toEqual({ data: 'png-data', mimeType: 'image/png' });
  expect(send).toHaveBeenCalledWith(
    'Page.captureScreenshot',
    expect.objectContaining({ format: 'png', captureBeyondViewport: false })
  );
  expect(send).not.toHaveBeenCalledWith('Page.getLayoutMetrics');
});

it('keeps human export as full-size PNG', async () => {
  const captured = image(1600);
  await expect(
    capturePagePNG(page(captured), new AbortController().signal)
  ).resolves.toBe(Buffer.from('png-1600').toString('base64'));
  expect(captured.resize).not.toHaveBeenCalled();
  expect(withAIProtocol).not.toHaveBeenCalled();
});

it('refuses late screenshots after Stop without falling back to another capture', async () => {
  const contents = page();
  const control = new AbortController();
  contents.capturePage.mockImplementation(async () => {
    control.abort();
    return image();
  });
  await expect(captureAIPage(contents, control.signal)).rejects.toBeDefined();
  expect(withAIProtocol).not.toHaveBeenCalled();
});

it('refuses screenshot results after the source tab closes', async () => {
  const contents = page();
  contents.isDestroyed.mockReturnValueOnce(false).mockReturnValue(true);
  await expect(
    captureAIPage(contents, new AbortController().signal)
  ).rejects.toThrow('Tab closed');
});

it('falls back after an unresponsive compositor and clears its deadline', async () => {
  jest.useFakeTimers();
  const contents = page();
  contents.capturePage.mockReturnValue(new Promise(() => {}));
  const send = jest.fn().mockResolvedValue({ data: 'fallback' });
  protocol(send);
  const pending = captureAIPage(contents, new AbortController().signal, {
    scale: 1,
  });
  await jest.advanceTimersByTimeAsync(1000);
  await expect(pending).resolves.toEqual({
    data: 'fallback',
    mimeType: 'image/jpeg',
  });
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it('reports the compositor failure when the protocol fallback also fails', async () => {
  const contents = page({ isEmpty: () => true });
  (withAIProtocol as jest.Mock).mockRejectedValue(new Error('No protocol.'));
  await expect(
    captureAIPage(contents, new AbortController().signal)
  ).rejects.toThrow('Display surface is unavailable.');
});
