import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  prepareAIUpload,
  aiUploadReceipt,
  matchesAIUpload,
  verifyAIUpload,
} from '../main/aiAttachments';

Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
  configurable: true,
  value() {
    if (this.aborted) throw new Error('Stopped.');
  },
});
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-attachment-test-'));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'nested', 'note.txt'), 'nested');
  fs.writeFileSync(path.join(root, '.hidden'), 'hidden');
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it('snapshots a folder including hidden files and portable relative paths', async () => {
  const upload = await prepareAIUpload([root], new AbortController().signal);
  expect(upload.directory).toBe(true);
  expect(upload.paths).toEqual([fs.realpathSync(root)]);
  expect(upload.files.map((file) => file.relativePath)).toEqual([
    `${path.basename(root)}/.hidden`,
    `${path.basename(root)}/nested/note.txt`,
  ]);
  await expect(upload.validate()).resolves.toBeUndefined();
  fs.writeFileSync(path.join(root, 'added.txt'), 'new');
  await expect(upload.validate()).rejects.toThrow('contents changed');
});

it('refuses symlinks inside the folder instead of following them outside it', async () => {
  fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
  await expect(
    prepareAIUpload([root], new AbortController().signal)
  ).rejects.toThrow('symbolic links');
});

it('refuses mixed folder/file requests and empty folders', async () => {
  await expect(
    prepareAIUpload(
      [root, path.join(root, '.hidden')],
      new AbortController().signal
    )
  ).rejects.toThrow('exactly one folder');
  fs.mkdirSync(path.join(root, 'empty'));
  await expect(
    prepareAIUpload([path.join(root, 'empty')], new AbortController().signal)
  ).rejects.toThrow('contains no files');
});

it('detects changed regular-file metadata and cancellation', async () => {
  const upload = await prepareAIUpload(
    [path.join(root, '.hidden')],
    new AbortController().signal
  );
  expect(upload.directory).toBe(false);
  fs.appendFileSync(path.join(root, '.hidden'), 'changed');
  await expect(upload.validate()).rejects.toThrow('contents changed');
  const stopped = new AbortController();
  stopped.abort();
  await expect(prepareAIUpload([root], stopped.signal)).rejects.toThrow(
    'Stopped'
  );
});

it('verifies unordered directory entries with relative paths, not just duplicate filenames', async () => {
  const upload = await prepareAIUpload([root], new AbortController().signal);
  const selected = upload.files
    .map(({ name, size, relativePath }) => ({ name, size, relativePath }))
    .reverse();
  expect(matchesAIUpload(selected, upload.files)).toBe(true);
  selected[0].relativePath = 'other/note.txt';
  expect(matchesAIUpload(selected, upload.files)).toBe(false);
});

it('waits for asynchronous folder enumeration and supports Stop while waiting', async () => {
  const upload = await prepareAIUpload([root], new AbortController().signal);
  const read = jest
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValue(upload.files);
  await expect(
    verifyAIUpload(read, upload.files, new AbortController().signal, true)
  ).resolves.toEqual(upload.files);
  expect(read).toHaveBeenCalledTimes(2);
  const stopped = new AbortController();
  const pending = verifyAIUpload(
    async () => {
      stopped.abort();
      return [];
    },
    upload.files,
    stopped.signal,
    true
  );
  await expect(pending).rejects.toThrow('Stopped');
});

it('bounds large folder receipts while reporting the verified total', () => {
  const receipt = aiUploadReceipt(
    Array.from({ length: 250 }, (_, index) => ({
      name: `file-${index}`,
      size: index,
    }))
  );
  expect(receipt.fileCount).toBe(250);
  expect(receipt.files).toHaveLength(100);
  expect(receipt.truncated).toBe(true);
});
