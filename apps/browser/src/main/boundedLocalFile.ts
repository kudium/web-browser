import fs from 'fs/promises';
import { constants } from 'fs';

/**
 * A descriptor-bound, bounded read; no synchronous picker I/O or growing
 * buffers.
 */
export async function readBoundedLocalFile(
  filename: string,
  maximumBytes: number,
  assertCurrent: () => void = () => {},
  invalidMessage = 'Choose a regular file within the supported size limit.'
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error('Invalid file size limit.');
  assertCurrent();
  const handle = await fs.open(
    filename,
    // eslint-disable-next-line no-bitwise
    constants.O_RDONLY | (constants.O_NONBLOCK || 0)
  );
  try {
    assertCurrent();
    const initial = await handle.stat();
    assertCurrent();
    if (!initial.isFile() || !initial.size || initial.size > maximumBytes)
      throw new Error(invalidMessage);
    const bytes = Buffer.alloc(initial.size + 1);
    let length = 0;
    while (length < bytes.length) {
      // eslint-disable-next-line no-await-in-loop
      const result = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null
      );
      assertCurrent();
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const current = await handle.stat();
    assertCurrent();
    if (
      length !== initial.size ||
      current.size !== initial.size ||
      current.mtimeMs !== initial.mtimeMs
    )
      throw new Error('The file changed while importing. Choose it again.');
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}
