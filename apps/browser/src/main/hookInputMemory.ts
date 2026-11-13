import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { safeStorage } from './localStorage';
import { atomicStorageWrite, readStorageFile } from './storageFiles';
// eslint-disable-next-line import/no-relative-packages
import {
  type HookInputField,
  hookInputError,
} from '../../../../packages/hooks/actions';

export interface HookInputBinding {
  profile: string;
  scope: string;
  origin: string;
  hookId: string;
  actionId: string;
  source: string;
}
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fieldID = (field: HookInputField) => digest(field);
const fileFor = (binding: HookInputBinding) =>
  path.join(app.getPath('userData'), 'hook-inputs', `${digest(binding)}.bin`);
const available = () =>
  safeStorage.isEncryptionAvailable() &&
  safeStorage.getSelectedStorageBackend() !== 'basic_text';

/** No plaintext fallback, global answers, or script-controlled storage identity. */
export function hookInputMemory(binding: HookInputBinding) {
  const file = fileFor(binding);
  const read = (): Record<string, string> => {
    if (!available()) return {};
    if (!fs.existsSync(file)) return {};
    if (!safeStorage.isFileAvailable(file))
      throw new Error(
        'Remembered answers are unavailable. Restore secure local storage first.'
      );
    const value = JSON.parse(
      safeStorage.decryptString(readStorageFile(file, 2 * 1024 * 1024))
    );
    if (
      !value ||
      value.version !== 1 ||
      value.binding !== digest(binding) ||
      !value.values ||
      typeof value.values !== 'object' ||
      Array.isArray(value.values) ||
      Object.keys(value.values).length > 100 ||
      Object.entries(value.values).some(
        ([key, text]) =>
          !/^[a-f0-9]{64}$/.test(key) ||
          typeof text !== 'string' ||
          text.length > 10000
      )
    )
      throw new Error('Remembered answers could not be read.');
    return value.values;
  };
  return {
    available: available(),
    load(fields: HookInputField[]) {
      const stored = read();
      return Object.fromEntries(
        fields
          .filter(
            (field) =>
              field.type !== 'password' &&
              stored[fieldID(field)] !== undefined &&
              !hookInputError(field, stored[fieldID(field)])
          )
          .map((field) => [field.key, stored[fieldID(field)]])
      );
    },
    save(
      fields: HookInputField[],
      values: Record<string, string>,
      remembered: string[]
    ) {
      if (!available()) {
        if (remembered.length)
          throw new Error(
            'Secure storage is unavailable. Answers cannot be remembered.'
          );
        return;
      }
      const stored = read();
      fields.forEach((field) => {
        const id = fieldID(field);
        delete stored[id];
        if (
          field.type !== 'password' &&
          remembered.includes(field.key) &&
          values[field.key] &&
          !hookInputError(field, values[field.key])
        )
          stored[id] = values[field.key];
      });
      const entries = Object.entries(stored).slice(-100);
      if (!entries.length) {
        fs.rmSync(file, { force: true });
        return;
      }
      atomicStorageWrite(
        file,
        safeStorage.encryptString(
          JSON.stringify({
            version: 1,
            binding: digest(binding),
            values: Object.fromEntries(entries),
          })
        )
      );
    },
  };
}
