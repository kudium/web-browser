/* Directory iteration is bounded and descriptor reads are awaited in order. */
/* eslint-disable no-restricted-syntax, no-await-in-loop, no-bitwise */
import { shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { constants } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { openProjectEditor } from './projectEditors';
import { openSystemTerminal } from './projectSystemTerminal';
import type {
  ProjectFileEntry,
  ProjectFilesRequest,
  ProjectFilesResult,
} from '../browser/developerProject';

const MAX_PREVIEW = 256 * 1024;
const MAX_IMAGE_PREVIEW = 20 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};
const MEDIA_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};
const MAX_MEDIA_PREVIEW = 50 * 1024 * 1024;
const saving = new Set<string>();
function fileVersion(
  bytes: Buffer,
  stat: { dev: number; ino: number; mtimeMs: number; ctimeMs: number }
) {
  return createHash('sha256')
    .update(bytes)
    .update(`${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}`)
    .digest('hex');
}
async function readPreview(
  target: string,
  initial: { dev: number; ino: number; size: number; mtimeMs: number },
  ensureAccess: () => void
) {
  // Refuse final symlinks and verify the descriptor still refers to the validated file.
  const handle = await fs.open(
    target,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW || 0) |
      (constants.O_NONBLOCK || 0)
  );
  try {
    const opened = await handle.stat();
    ensureAccess();
    if (
      !opened.isFile() ||
      opened.dev !== initial.dev ||
      opened.ino !== initial.ino ||
      opened.size !== initial.size ||
      opened.mtimeMs !== initial.mtimeMs
    )
      throw new Error('This file changed. Refresh the folder.');
    const bytes = Buffer.alloc(initial.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(
        bytes,
        length,
        bytes.length - length,
        length
      );
      ensureAccess();
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const current = await handle.stat();
    ensureAccess();
    if (
      length !== initial.size ||
      current.size !== initial.size ||
      current.mtimeMs !== initial.mtimeMs
    )
      throw new Error('This file changed. Refresh the folder.');
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

function within(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
export function validFilesRequest(
  value: unknown
): value is ProjectFilesRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as ProjectFilesRequest;
  return (
    [
      'list',
      'preview',
      'editor',
      'reveal',
      'save',
      'create-file',
      'create-folder',
      'rename',
      'duplicate',
      'trash',
      'terminal',
      'terminal-tab',
      'open-tab',
      'drag',
    ].includes(request.action) &&
    typeof request.path === 'string' &&
    request.path.length <= 4096 &&
    !request.path.includes('\0') &&
    (!('name' in request) ||
      (typeof request.name === 'string' &&
        request.name.length > 0 &&
        request.name.trim() === request.name &&
        request.name.length <= 255 &&
        !/[\\/\0]/.test(request.name) &&
        !['.', '..'].includes(request.name))) &&
    (!['create-file', 'create-folder', 'rename', 'duplicate'].includes(
      request.action
    ) ||
      'name' in request) &&
    (request.action !== 'save' ||
      (typeof request.text === 'string' &&
        !request.text.includes('\0') &&
        Buffer.byteLength(request.text, 'utf8') <= MAX_PREVIEW &&
        typeof request.version === 'string' &&
        /^[a-f0-9]{64}$/.test(request.version))) &&
    (!('hidden' in request) ||
      request.hidden === undefined ||
      typeof request.hidden === 'boolean')
  );
}
export async function projectFiles(
  folder: string,
  request: ProjectFilesRequest,
  ensureAccess: () => void
): Promise<ProjectFilesResult> {
  if (!validFilesRequest(request)) throw new Error('Invalid file request.');
  ensureAccess();
  const root = await fs.realpath(folder);
  ensureAccess();
  if (path.isAbsolute(request.path))
    throw new Error('Choose a file inside the linked project.');
  const candidate = path.resolve(root, request.path);
  if (!within(root, candidate))
    throw new Error('Choose a file inside the linked project.');
  const target = await fs.realpath(candidate);
  ensureAccess();
  if (!within(root, target))
    throw new Error('This link points outside the project.');
  const relative = path.relative(root, target);
  const stat = await fs.stat(target);
  ensureAccess();
  const recheck = async () => {
    ensureAccess();
    if (
      (await fs.realpath(candidate)) !== target ||
      (await fs.realpath(target)) !== target
    )
      throw new Error('This file changed. Refresh the folder.');
    ensureAccess();
  };
  if (request.action === 'open-tab' || request.action === 'drag') {
    if (!stat.isFile()) throw new Error('Choose a regular file.');
    await recheck();
    return { path: relative, url: pathToFileURL(target).href };
  }
  if (request.action === 'editor') {
    if (!stat.isFile()) throw new Error('Choose a regular file.');
    await recheck();
    await openProjectEditor(target);
    ensureAccess();
    return { path: relative };
  }
  if (request.action === 'terminal-tab') {
    if (!stat.isDirectory()) throw new Error('Choose a folder.');
    await recheck();
    return { path: relative };
  }
  if (request.action === 'terminal') {
    await recheck();
    await openSystemTerminal(
      stat.isDirectory() ? target : path.dirname(target)
    );
    return { path: relative };
  }
  if (request.action === 'reveal') {
    await recheck();
    shell.showItemInFolder(target);
    return { path: relative };
  }
  if (
    request.action === 'create-file' ||
    request.action === 'create-folder' ||
    request.action === 'rename' ||
    request.action === 'duplicate'
  ) {
    if (
      (request.action === 'create-file' ||
        request.action === 'create-folder') &&
      !stat.isDirectory()
    )
      throw new Error('Choose a folder.');
    if (
      (request.action === 'rename' || request.action === 'duplicate') &&
      (!relative ||
        (!stat.isFile() && !stat.isDirectory()) ||
        (await fs.lstat(candidate)).isSymbolicLink())
    )
      throw new Error('Choose a regular file or folder inside the project.');
    if (request.action === 'duplicate' && !stat.isFile())
      throw new Error('Only regular files can be duplicated.');
    const destination = path.join(
      request.action === 'create-file' || request.action === 'create-folder'
        ? target
        : path.dirname(target),
      request.name
    );
    await recheck();
    try {
      await fs.lstat(destination);
      throw new Error('An item with that name already exists.');
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    ensureAccess();
    if (request.action === 'create-file') {
      const handle = await fs.open(destination, 'wx');
      await handle.close();
    } else if (request.action === 'create-folder') await fs.mkdir(destination);
    else if (request.action === 'duplicate')
      await fs.copyFile(target, destination, constants.COPYFILE_EXCL);
    else await fs.rename(target, destination);
    return { path: path.relative(root, destination) };
  }
  if (request.action === 'trash') {
    if (
      !relative ||
      (!stat.isFile() && !stat.isDirectory()) ||
      (await fs.lstat(candidate)).isSymbolicLink()
    )
      throw new Error('Choose a regular file or folder inside the project.');
    await recheck();
    await shell.trashItem(target);
    return { path: relative };
  }
  if (request.action === 'save') {
    if (!stat.isFile() || stat.size > MAX_PREVIEW)
      throw new Error('Choose a small text file.');
    if (saving.has(target))
      throw new Error('This file is already being saved. Try again.');
    saving.add(target);
    try {
      await recheck();
      const original = await readPreview(target, stat, ensureAccess);
      if (fileVersion(original, stat) !== request.version)
        throw new Error(
          'This file changed on disk. Your edits are kept. Reload the file to review the latest version.'
        );
      const staged = path.join(
        path.dirname(target),
        `.kudiumbrowser-${randomUUID()}.tmp`
      );
      const handle = await fs.open(
        staged,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          (constants.O_NOFOLLOW || 0),
        stat.mode & 0o777
      );
      try {
        const bytes = Buffer.from(request.text, 'utf8');
        ensureAccess();
        await handle.writeFile(bytes);
        await handle.chmod(stat.mode & 0o777);
        await handle.sync();
        await recheck();
        const current = await fs.stat(target);
        if (
          !current.isFile() ||
          current.dev !== stat.dev ||
          current.ino !== stat.ino ||
          current.mtimeMs !== stat.mtimeMs ||
          current.ctimeMs !== stat.ctimeMs ||
          current.size !== stat.size
        )
          throw new Error('This file changed on disk. Your edits are kept.');
        ensureAccess();
        await fs.rename(staged, target);
        const updated = await handle.stat();
        return {
          path: relative,
          file: {
            name: path.basename(target),
            path: relative,
            size: bytes.length,
            text: request.text,
            version: fileVersion(bytes, updated),
          },
        };
      } finally {
        await handle.close();
        await fs.unlink(staged).catch(() => {});
      }
    } finally {
      saving.delete(target);
    }
  }
  if (stat.isDirectory()) {
    const entries: ProjectFileEntry[] = [];
    const directory = await fs.opendir(target);
    let count = 0;
    let truncated = false;
    try {
      ensureAccess();
      for await (const entry of directory) {
        ensureAccess();
        count += 1;
        if (count > 2000) {
          truncated = true;
          break;
        }
        if (
          !('hidden' in request && request.hidden) &&
          entry.name.startsWith('.')
        ) {
          // Hidden entries still count toward the scan limit.
        } else {
          let kind: ProjectFileEntry['kind'] = 'other';
          if (entry.isDirectory()) kind = 'folder';
          else if (entry.isFile()) kind = 'file';
          else if (entry.isSymbolicLink()) kind = 'link';
          entries.push({
            name: entry.name,
            path: path.join(relative, entry.name),
            kind,
          });
        }
      }
    } finally {
      // Async iteration closes the handle; also close when access fails before it starts.
      await directory.close().catch((error: { code?: string }) => {
        if (error.code !== 'ERR_DIR_CLOSED') throw error;
      });
    }
    await recheck();
    entries.sort(
      (a, b) =>
        Number(b.kind === 'folder') - Number(a.kind === 'folder') ||
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
    );
    return { path: relative, entries, truncated };
  }
  if (!stat.isFile()) throw new Error('This item cannot be previewed.');
  await recheck();
  const file = { name: path.basename(target), path: relative, size: stat.size };
  const extension = path.extname(target).toLowerCase();
  const imageType = IMAGE_TYPES[extension];
  const mediaType = MEDIA_TYPES[extension];
  let previewLimit = MAX_PREVIEW;
  let sizeNotice = 'This file is too large to preview. Open it in your editor.';
  if (imageType) {
    previewLimit = MAX_IMAGE_PREVIEW;
    sizeNotice =
      'This image is too large to preview (20 MB maximum). Open it in your editor.';
  }
  if (mediaType) {
    previewLimit = MAX_MEDIA_PREVIEW;
    sizeNotice =
      'This file is too large to preview (50 MB maximum). Open it in a tab or external app.';
  }
  if (stat.size > previewLimit)
    return { path: relative, file: { ...file, notice: sizeNotice } };
  await recheck();
  const bytes = await readPreview(target, stat, ensureAccess);
  await recheck();
  if (mediaType)
    return {
      path: relative,
      file: {
        ...file,
        media: {
          type: mediaType,
          url: `data:${mediaType};base64,${bytes.toString('base64')}`,
        },
      },
    };
  if (imageType)
    return {
      path: relative,
      file: {
        ...file,
        imageURL: `data:${imageType};base64,${bytes.toString('base64')}`,
      },
    };
  try {
    if (bytes.includes(0)) throw new Error('Binary file');
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    return {
      path: relative,
      file: { ...file, text, version: fileVersion(bytes, stat) },
    };
  } catch {
    return {
      path: relative,
      file: {
        ...file,
        notice:
          'Preview unavailable for this file type. Open it in your editor.',
      },
    };
  }
}
