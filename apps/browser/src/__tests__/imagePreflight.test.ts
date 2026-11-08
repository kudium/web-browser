/** @jest-environment node */
import { EventEmitter } from 'events';
import { nativeImage } from 'electron';
import { preflightImage } from '../main/imagePreflight';
import { AIComposerAttachments } from '../main/aiComposer';
import { PageCaptureService } from '../main/pageCapture';
import { capturePagePNG } from '../main/aiScreenshot';

jest.mock('electron', () => ({
  nativeImage: { createFromBuffer: jest.fn() },
}));
jest.mock('../main/aiScreenshot', () => ({ capturePagePNG: jest.fn() }));

const png = (width: number, height: number) => {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
    'base64'
  );
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};

it('bounds declared dimensions before decoding, including pixel and side limits', () => {
  expect(preflightImage(png(8000, 5000), ['png'])).toEqual({
    width: 8000,
    height: 5000,
  });
  [
    png(8000, 5001),
    png(32768, 1),
    png(0, 1),
    png(1, 0),
    Buffer.from('not an image'),
    Buffer.alloc(0),
  ].forEach((bytes) => {
    expect(() => preflightImage(bytes, ['png'])).toThrow('40 megapixels');
  });
  expect(() => preflightImage(png(1, 1), ['jpg'])).toThrow('readable image');
});

it('prevents oversized and malformed AI attachments from reaching native decoding', async () => {
  const store = new AIComposerAttachments();
  await expect(store.add('huge.png', png(32767, 32767))).rejects.toThrow(
    '40 megapixels'
  );
  await expect(
    store.add('invalid.jpg', Buffer.from('garbage'))
  ).rejects.toThrow('readable image');
  expect(nativeImage.createFromBuffer).not.toHaveBeenCalled();
});

it('rejects excessive screenshot dimensions before native decoding', async () => {
  const hostContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
  });
  const target = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    getTitle: () => 'Synthetic capture',
  });
  (capturePagePNG as jest.Mock).mockResolvedValue(
    png(32767, 32767).toString('base64')
  );
  const service = new PageCaptureService(
    { webContents: hostContents } as any,
    () => target as any
  );
  try {
    await expect(
      service.request({ action: 'capture', mode: 'visible', tabId: 'page' })
    ).rejects.toThrow('40 megapixels');
    expect(nativeImage.createFromBuffer).not.toHaveBeenCalled();
  } finally {
    service.dispose();
  }
});
