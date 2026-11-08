/* File traversal and validation preserve ordering and support cancellation. */
/* eslint-disable no-await-in-loop, no-restricted-syntax */
import fs from 'fs';
import path from 'path';

export interface AIUploadFile {
  path: string;
  name: string;
  size: number;
  modified: number;
  inode: number;
  device: number;
  relativePath?: string;
}
export interface AISelectedFile {
  name: string;
  size: number;
  relativePath?: string;
}

/** Snapshot an explicitly requested folder without following nested symlinks. */
export async function prepareAIUpload(paths: string[], signal: AbortSignal) {
  const resolved = await Promise.all(
    paths.map((file) => fs.promises.realpath(file))
  );
  signal.throwIfAborted();
  const stats = await Promise.all(
    resolved.map((file) => fs.promises.stat(file))
  );
  signal.throwIfAborted();
  const directory = stats.some((stat) => stat.isDirectory());
  if (directory && (resolved.length !== 1 || !stats[0].isDirectory()))
    throw new Error('Select exactly one folder without additional file paths.');
  const root = resolved[0];
  const scan = async () => {
    const files: AIUploadFile[] = [];
    let visited = 0;
    const visit = async (filename: string, depth = 0) => {
      signal.throwIfAborted();
      visited += 1;
      if (visited > 20000)
        throw new Error('Folder contains too many filesystem entries.');
      const stat = directory
        ? await fs.promises.lstat(filename)
        : await fs.promises.stat(filename);
      signal.throwIfAborted();
      if (stat.isSymbolicLink())
        throw new Error('Folder uploads cannot contain symbolic links.');
      if (stat.isDirectory() && directory) {
        if (depth > 32) throw new Error('Folder exceeds 32 nested levels.');
        const entries = await fs.promises.readdir(filename);
        for (const entry of entries.sort())
          await visit(path.join(filename, entry), depth + 1);
      } else {
        if (!stat.isFile())
          throw new Error('Only regular files or one folder can be attached.');
        if (files.length >= 5000)
          throw new Error('Folder uploads support up to 5000 files.');
        files.push({
          path: filename,
          name: path.basename(filename),
          size: stat.size,
          modified: stat.mtimeMs,
          inode: stat.ino,
          device: stat.dev,
          ...(directory
            ? {
                relativePath: `${path.basename(root)}/${path
                  .relative(root, filename)
                  .split(path.sep)
                  .join('/')}`,
              }
            : {}),
        });
      }
    };
    for (const filename of resolved) await visit(filename);
    if (!files.length)
      throw new Error('The selected folder contains no files.');
    return files;
  };
  const files = await scan();
  return {
    files,
    directory,
    paths: resolved,
    validate: async () => {
      const current = await scan();
      if (JSON.stringify(current) !== JSON.stringify(files))
        throw new Error(
          'Selected files or folder contents changed during approval.'
        );
    },
  };
}

export function matchesAIUpload(
  selected: AISelectedFile[],
  expected: AIUploadFile[]
) {
  if (selected.length !== expected.length) return false;
  const key = (file: AISelectedFile) =>
    JSON.stringify([file.relativePath || file.name, file.size]);
  const actual = selected.map(key).sort();
  return expected
    .map(key)
    .sort()
    .every((value, index) => value === actual[index]);
}

/** Directory enumeration completes asynchronously after DOM.setFileInputFiles. */
export async function verifyAIUpload(
  read: () => Promise<AISelectedFile[]>,
  expected: AIUploadFile[],
  signal: AbortSignal,
  directory: boolean
) {
  const deadline = Date.now() + 5000;
  for (;;) {
    signal.throwIfAborted();
    const selected = await read();
    if (matchesAIUpload(selected, expected)) return selected;
    if (!directory || Date.now() >= deadline)
      throw new Error(
        'File selection could not be verified. Effects may already have occurred; read before retrying.'
      );
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('Stopped.'));
      };
      timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, 50);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        signal.removeEventListener('abort', abort);
        abort();
      }
    });
  }
}

/** Verify the whole selection but keep large folder receipts bounded for agents. */
export function aiUploadReceipt(selected: AISelectedFile[]) {
  return {
    attached: true,
    fileCount: selected.length,
    files: selected.slice(0, 100),
    truncated: selected.length > 100,
  };
}
