import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { nativeImage } from 'electron';
import { preflightImage } from './imagePreflight';
import { readBoundedLocalFile } from './boundedLocalFile';

/** Validate every ICNS entry, including embedded PNG/JPEG 2000 dimensions. */
function validateICNS(bytes: Buffer) {
  if (bytes.length < 8 || bytes.readUInt32BE(4) !== bytes.length)
    throw new Error('Invalid icon container.');
  let offset = 8;
  let images = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('Invalid icon entry.');
    const length = bytes.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > bytes.length)
      throw new Error('Invalid icon entry.');
    const kind = bytes.toString('ascii', offset, offset + 4);
    const content = bytes.subarray(offset + 8, offset + length);
    if (/^(icp[456]|ic0[789]|ic10|ic1[1234])$/.test(kind)) {
      const size = preflightImage(content, ['png', 'jp2', 'j2c']);
      if (size.width > 1024 || size.height > 1024)
        throw new Error('Icon dimensions exceed supported limits.');
      images += 1;
    } else if (
      /^(ICON|ICN#|icm[#48]|ics[#48]|icl[48]|ich[48]|is32|il32|ih32|it32|[slht]8mk)$/.test(
        kind
      )
    ) {
      // Legacy fixed-size bitmap/mask entries; their largest canvas is 128px.
      images += 1;
    } else if (!['TOC ', 'icnV', 'name', 'info'].includes(kind)) {
      throw new Error('Unsupported icon entry.');
    }
    offset += length;
  }
  if (!images) throw new Error('Choose an icon containing an image.');
}

/** Decode validated bytes or a private ICNS snapshot. */
export async function loadLocalIcon(
  filename: string,
  assertCurrent: () => void
) {
  const bytes = await readBoundedLocalFile(
    filename,
    5 * 1024 * 1024,
    assertCurrent,
    'Choose a regular image smaller than 5 MB.'
  );
  assertCurrent();
  if (bytes.toString('ascii', 0, 4) === 'icns') {
    validateICNS(bytes);
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'kudiumbrowser-icon-')
    );
    const snapshot = path.join(directory, 'icon.icns');
    try {
      assertCurrent();
      await fs.writeFile(snapshot, bytes, { mode: 0o600, flag: 'wx' });
      assertCurrent();
      const icon = await nativeImage.createThumbnailFromPath(snapshot, {
        width: 32,
        height: 32,
      });
      assertCurrent();
      return icon;
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
  const size = preflightImage(bytes, ['png', 'jpg']);
  if (size.width > 2048 || size.height > 2048)
    throw new Error('Choose an icon up to 2048 pixels on each side.');
  assertCurrent();
  return nativeImage.createFromBuffer(bytes);
}

/** Download previews never reopen the mutable source path in a native decoder. */
export async function loadDownloadImage(
  filename: string,
  assertCurrent: () => void
) {
  const bytes = await readBoundedLocalFile(
    filename,
    20 * 1024 * 1024,
    assertCurrent
  );
  preflightImage(bytes, ['png', 'jpg', 'webp', 'gif', 'bmp', 'tiff', 'heif']);
  assertCurrent();
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'kudiumbrowser-thumbnail-')
  );
  const snapshot = path.join(
    directory,
    `image${path.extname(filename).slice(0, 12)}`
  );
  try {
    assertCurrent();
    await fs.writeFile(snapshot, bytes, { mode: 0o600, flag: 'wx' });
    assertCurrent();
    const image = await nativeImage.createThumbnailFromPath(snapshot, {
      width: 40,
      height: 40,
    });
    assertCurrent();
    return image.isEmpty() ? null : image.toDataURL();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
