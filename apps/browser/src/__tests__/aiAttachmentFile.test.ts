/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { readAIAttachmentFile } from '../main/aiAttachmentFile';
import { AI_ATTACHMENT_BYTES } from '../browser/aiComposer';

it('reads selected bytes and rejects empty, oversized and non-regular files', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'touchbox-file-read-')
  );
  const file = path.join(directory, 'fixture.txt');
  try {
    const bytes = Buffer.from('fixture\u0000binary');
    await fs.writeFile(file, bytes);
    expect(await readAIAttachmentFile(file)).toEqual(bytes);
    await fs.truncate(file, 0);
    await expect(readAIAttachmentFile(file)).rejects.toThrow('regular file');
    await fs.truncate(file, AI_ATTACHMENT_BYTES + 1);
    await expect(readAIAttachmentFile(file)).rejects.toThrow('20 MB');
    await expect(readAIAttachmentFile(directory)).rejects.toThrow();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it('bounds a growing file to its initial size plus one and closes the descriptor', async () => {
  const handle = {
    stat: jest
      .fn()
      .mockResolvedValueOnce({ size: 3, mtimeMs: 1, isFile: () => true })
      .mockResolvedValueOnce({ size: 4, mtimeMs: 2 }),
    read: jest.fn(async (buffer: Buffer) => {
      buffer.write('abcd');
      return { bytesRead: 4 };
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const open = jest.spyOn(fs, 'open').mockResolvedValue(handle as any);
  try {
    await expect(readAIAttachmentFile('/fixture')).rejects.toThrow(
      'file changed'
    );
    expect(handle.read).toHaveBeenCalledTimes(1);
    expect(handle.read.mock.calls[0][0]).toHaveLength(4);
    expect(handle.close).toHaveBeenCalledTimes(1);
  } finally {
    open.mockRestore();
  }
});

it('closes a descriptor when reading fails', async () => {
  const handle = {
    stat: jest
      .fn()
      .mockResolvedValue({ size: 3, mtimeMs: 1, isFile: () => true }),
    read: jest.fn().mockRejectedValue(new Error('read failed')),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const open = jest.spyOn(fs, 'open').mockResolvedValue(handle as any);
  try {
    await expect(readAIAttachmentFile('/fixture')).rejects.toThrow(
      'read failed'
    );
    expect(handle.close).toHaveBeenCalledTimes(1);
  } finally {
    open.mockRestore();
  }
});
