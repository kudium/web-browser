/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { nativeImage } from 'electron';
import { loadLocalIcon, loadDownloadImage } from '../main/localImage';

jest.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: jest.fn(() => ({ isEmpty: () => false })),
    createFromPath: jest.fn(() => ({ isEmpty: () => false })),
    createThumbnailFromPath: jest.fn(async () => ({
      isEmpty: () => false,
      toDataURL: () => 'data:image/png;base64,preview',
    })),
  },
}));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
  'base64'
);
afterEach(() => jest.clearAllMocks());

it('rejects compressed oversized dimensions before icon and thumbnail decoding', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'touchbox-local-image-')
  );
  const file = path.join(directory, 'huge.png');
  const giant = Buffer.from(png);
  giant.writeUInt32BE(32767, 16);
  giant.writeUInt32BE(32767, 20);
  try {
    await fs.writeFile(file, giant);
    await expect(loadLocalIcon(file, () => {})).rejects.toThrow(
      '40 megapixels'
    );
    await expect(loadDownloadImage(file, () => {})).rejects.toThrow(
      '40 megapixels'
    );
    expect(nativeImage.createFromBuffer).not.toHaveBeenCalled();
    expect(nativeImage.createThumbnailFromPath).not.toHaveBeenCalled();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it('uses a private immutable thumbnail snapshot and removes it after dispatch', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'touchbox-local-image-')
  );
  const file = path.join(directory, 'normal.png');
  let snapshot = '';
  (nativeImage.createThumbnailFromPath as jest.Mock).mockImplementationOnce(
    async (name: string) => {
      snapshot = name;
      expect(name).not.toBe(file);
      expect(await fs.readFile(name)).toEqual(png);
      if (process.platform !== 'win32') {
        expect((await fs.stat(name)).mode % 0o1000).toBe(0o600);
      }
      await fs.writeFile(file, 'source replaced');
      expect(await fs.readFile(name)).toEqual(png);
      return { isEmpty: () => false, toDataURL: () => 'preview' };
    }
  );
  try {
    await fs.writeFile(file, png);
    expect(await loadDownloadImage(file, () => {})).toBe('preview');
    await expect(fs.stat(snapshot)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it('checks every modern ICNS payload and rejects invalid entry lengths', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'touchbox-local-image-')
  );
  const file = path.join(directory, 'invalid.icns');
  const bytes = Buffer.alloc(16);
  bytes.write('icns');
  bytes.writeUInt32BE(bytes.length, 4);
  bytes.write('ic08', 8);
  bytes.writeUInt32BE(7, 12);
  try {
    await fs.writeFile(file, bytes);
    await expect(loadLocalIcon(file, () => {})).rejects.toThrow('icon entry');
    expect(nativeImage.createFromPath).not.toHaveBeenCalled();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
