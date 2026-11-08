import { imageSize } from 'image-size';

/** Header limits before native decoding; this does not sandbox the decoder. */
export function preflightImage(bytes: Buffer, formats: readonly string[]) {
  try {
    const size = imageSize(bytes);
    if (
      !formats.includes(size.type || '') ||
      !Number.isInteger(size.width) ||
      !Number.isInteger(size.height) ||
      size.width < 1 ||
      size.height < 1 ||
      size.width > 32767 ||
      size.height > 32767 ||
      size.width * size.height > 40_000_000
    )
      throw new Error('Invalid image dimensions.');
    return { width: size.width, height: size.height };
  } catch {
    throw new Error('Choose a readable image up to 40 megapixels.');
  }
}
