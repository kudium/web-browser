/* Package preparation never loads extension code. */
/* eslint-disable no-restricted-syntax, no-await-in-loop, no-bitwise */
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { downloadExtension } from 'electron-chrome-web-store';
import { readBoundedLocalFile } from './boundedLocalFile';

const MAX_BYTES = 256 * 1024 * 1024;
const MAX_FILES = 10000;
export function extensionKeyId(key: string) {
  return createHash('sha256')
    .update(key, 'base64')
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (value) =>
      String.fromCharCode(97 + parseInt(value, 16))
    );
}
export async function prepareExtensionPackage(
  id: string,
  cacheRoot: string,
  userData: string,
  assertCurrent: () => void,
  cachedPath?: string
) {
  assertCurrent();
  const source = cachedPath || (await downloadExtension(id, cacheRoot));
  assertCurrent();
  let directory = await fs.mkdtemp(path.join(userData, '.extension-install-'));
  let retained = false;
  const records: { relative: string; hash: string; size: number }[] = [];
  const paths = new Set<string>();
  let total = 0;
  let entries = 0;
  const dispose = () =>
    retained
      ? Promise.resolve()
      : fs.rm(directory, { recursive: true, force: true });
  try {
    const sourceRoot = await fs.realpath(source);
    const rootInfo = await fs.lstat(source);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
      throw new Error('Invalid extension package directory.');
    const copy = async (relative: string, depth: number): Promise<void> => {
      assertCurrent();
      if (depth > 16)
        throw new Error('Extension package is too deeply nested.');
      const sourceDirectory = path.join(sourceRoot, relative);
      if ((await fs.realpath(sourceDirectory)) !== sourceDirectory)
        throw new Error('Extension package contains a symbolic link.');
      for (const entry of await fs.readdir(sourceDirectory, {
        withFileTypes: true,
      })) {
        entries += 1;
        if (entries > MAX_FILES)
          throw new Error('Extension package contains too many files.');
        const name = path.join(relative, entry.name);
        paths.add(name);
        const sourceFile = path.join(sourceRoot, name);
        const output = path.join(directory, name);
        assertCurrent();
        if (entry.isDirectory()) {
          await fs.mkdir(output, { mode: 0o700 });
          await copy(name, depth + 1);
        } else if (entry.isFile()) {
          // eslint-disable-next-line no-bitwise
          const input = await fs.open(
            sourceFile,
            constants.O_RDONLY |
              (constants.O_NOFOLLOW || 0) |
              (constants.O_NONBLOCK || 0)
          );
          try {
            const initial = await input.stat();
            total += initial.size;
            if (!initial.isFile() || total > MAX_BYTES)
              throw new Error('Extension package is too large.');
            const target = await fs.open(output, 'wx', 0o600);
            try {
              const buffer = Buffer.alloc(
                Math.min(256 * 1024, Math.max(1, initial.size))
              );
              const hash = createHash('sha256');
              let offset = 0;
              while (offset < initial.size) {
                assertCurrent();
                const read = await input.read(
                  buffer,
                  0,
                  Math.min(buffer.length, initial.size - offset),
                  offset
                );
                if (!read.bytesRead)
                  throw new Error(
                    'Extension package changed during preparation.'
                  );
                hash.update(buffer.subarray(0, read.bytesRead));
                let written = 0;
                while (written < read.bytesRead) {
                  const result = await target.write(
                    buffer,
                    written,
                    read.bytesRead - written,
                    offset + written
                  );
                  if (!result.bytesWritten)
                    throw new Error('Extension package copy failed.');
                  written += result.bytesWritten;
                }
                offset += read.bytesRead;
              }
              const current = await input.stat();
              if (
                current.size !== initial.size ||
                current.mtimeMs !== initial.mtimeMs ||
                current.ctimeMs !== initial.ctimeMs
              )
                throw new Error(
                  'Extension package changed during preparation.'
                );
              await target.sync();
              records.push({
                relative: name,
                size: initial.size,
                hash: hash.digest('hex'),
              });
            } finally {
              await target.close();
            }
          } finally {
            await input.close();
          }
        } else
          throw new Error('Extension package contains an unsupported file.');
      }
    };
    await copy('', 0);
    assertCurrent();
    const manifest = JSON.parse(
      (
        await readBoundedLocalFile(
          path.join(directory, 'manifest.json'),
          1024 * 1024,
          assertCurrent
        )
      ).toString()
    );
    if (
      !manifest ||
      manifest.manifest_version !== 3 ||
      typeof manifest.key !== 'string' ||
      manifest.key.length > 8192 ||
      extensionKeyId(manifest.key) !== id ||
      typeof manifest.name !== 'string' ||
      manifest.name.length > 512 ||
      typeof manifest.version !== 'string' ||
      !/^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(manifest.version)
    )
      throw new Error('Extension package identity or manifest is invalid.');
    let displayName = manifest.name;
    const localizedName = /^__MSG_([A-Za-z0-9_@]+)__$/.exec(displayName);
    if (localizedName) {
      if (
        typeof manifest.default_locale !== 'string' ||
        !/^[A-Za-z]{2,3}(?:_[A-Za-z0-9]{2,8})?$/.test(manifest.default_locale)
      )
        throw new Error('Extension localized name is invalid.');
      const relative = path.join(
        '_locales',
        manifest.default_locale,
        'messages.json'
      );
      if (!paths.has(relative))
        throw new Error('Extension localized name is missing.');
      const messages = JSON.parse(
        (
          await readBoundedLocalFile(
            path.join(directory, relative),
            1024 * 1024,
            assertCurrent
          )
        ).toString()
      );
      const key = Object.keys(messages).find(
        (name) => name.toLowerCase() === localizedName[1].toLowerCase()
      );
      displayName = key && messages[key]?.message;
      if (
        typeof displayName !== 'string' ||
        !displayName.trim() ||
        displayName.length > 512
      )
        throw new Error('Extension localized name is invalid.');
    }
    const permissions = [
      'permissions',
      'host_permissions',
      'optional_permissions',
      'optional_host_permissions',
    ].flatMap((field) => {
      const values = manifest[field] ?? [];
      if (
        !Array.isArray(values) ||
        values.length > 1000 ||
        values.some(
          (value: unknown) => typeof value !== 'string' || value.length > 2048
        )
      )
        throw new Error('Extension permissions are invalid.');
      return values.map((value: unknown) =>
        field.startsWith('optional_') ? `Optional: ${value}` : String(value)
      );
    });
    const validate = async () => {
      const seen = new Set<string>();
      const inspect = async (relative: string): Promise<void> => {
        for (const entry of await fs.readdir(path.join(directory, relative), {
          withFileTypes: true,
        })) {
          assertCurrent();
          const name = path.join(relative, entry.name);
          if (!paths.has(name) || (!entry.isFile() && !entry.isDirectory()))
            throw new Error('Extension package changed after review.');
          seen.add(name);
          if (entry.isDirectory()) await inspect(name);
        }
      };
      await inspect('');
      if (seen.size !== paths.size)
        throw new Error('Extension package changed after review.');
      for (const record of records) {
        assertCurrent();
        // eslint-disable-next-line no-bitwise
        const input = await fs.open(
          path.join(directory, record.relative),
          constants.O_RDONLY |
            (constants.O_NOFOLLOW || 0) |
            (constants.O_NONBLOCK || 0)
        );
        try {
          const initial = await input.stat();
          if (!initial.isFile() || initial.size !== record.size)
            throw new Error('Extension package changed after review.');
          const buffer = Buffer.alloc(
            Math.min(256 * 1024, Math.max(1, record.size))
          );
          const hash = createHash('sha256');
          let offset = 0;
          while (offset < record.size) {
            assertCurrent();
            const read = await input.read(
              buffer,
              0,
              Math.min(buffer.length, record.size - offset),
              offset
            );
            if (!read.bytesRead)
              throw new Error('Extension package changed after review.');
            hash.update(buffer.subarray(0, read.bytesRead));
            offset += read.bytesRead;
          }
          const current = await input.stat();
          if (
            current.size !== initial.size ||
            current.mtimeMs !== initial.mtimeMs ||
            current.ctimeMs !== initial.ctimeMs ||
            hash.digest('hex') !== record.hash
          )
            throw new Error('Extension package changed after review.');
        } finally {
          await input.close();
        }
      }
      assertCurrent();
    };
    return {
      manifest,
      displayName,
      permissions,
      dispose,
      validate,
      path: () => directory,
      commit: async () => {
        assertCurrent();
        await fs.mkdir(path.join(cacheRoot, id), { recursive: true });
        assertCurrent();
        const destination = path.join(
          cacheRoot,
          id,
          `${manifest.version}_${randomUUID()}`
        );
        await fs.rename(directory, destination);
        directory = destination;
        assertCurrent();
        return directory;
      },
      retain: () => {
        retained = true;
      },
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
