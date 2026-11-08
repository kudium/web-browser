/* eslint-disable no-restricted-syntax */
import type { MigratedStorageFile } from './storageMigration';
import { validateAITask } from './aiTasks';

export const STORAGE_SCHEMA_VERSION = 1;
export function validateStoragePayload(
  relative: MigratedStorageFile,
  plaintext: string
) {
  if (
    relative === 'password-manager/os-key' ||
    relative === 'ai-settings.json'
  ) {
    if (!plaintext || Buffer.byteLength(plaintext) > 128 * 1024)
      throw new Error('Invalid encrypted credential.');
    return;
  }
  const value = JSON.parse(plaintext);
  if (
    value &&
    !Array.isArray(value) &&
    value.schemaVersion !== undefined &&
    value.schemaVersion !== STORAGE_SCHEMA_VERSION
  )
    throw new Error('Unsupported stored data schema.');
  if (relative === 'ai-tasks.bin') {
    if (!Array.isArray(value) || value.length > 100)
      throw new Error('Invalid task migration payload.');
    const ids = new Set<string>();
    for (const task of value) {
      validateAITask(task);
      if (
        typeof task.id !== 'string' ||
        !task.id ||
        ids.has(task.id) ||
        typeof task.enabled !== 'boolean' ||
        !Array.isArray(task.runs) ||
        task.runs.length > 20
      )
        throw new Error('Invalid task migration record.');
      if (
        (task.privateData !== undefined &&
          typeof task.privateData !== 'boolean') ||
        (task.nextRunAt !== undefined && !Number.isSafeInteger(task.nextRunAt))
      )
        throw new Error('Invalid task privacy/scheduling metadata.');
      ids.add(task.id);
      for (const run of task.runs) {
        if (
          !run ||
          typeof run.id !== 'string' ||
          !Number.isSafeInteger(run.startedAt) ||
          (run.endedAt !== undefined && !Number.isSafeInteger(run.endedAt)) ||
          ![
            'running',
            'completed',
            'failed',
            'paused',
            'stopped',
            'interrupted',
          ].includes(run.state) ||
          typeof run.summary !== 'string' ||
          run.summary.length > 4000
        )
          throw new Error('Invalid task history migration record.');
      }
    }
  } else if (relative === 'ai-conversations.bin') {
    if (
      !value ||
      !Array.isArray(value.chats) ||
      value.chats.length > 30 ||
      typeof value.selectedId !== 'string'
    )
      throw new Error('Invalid conversation migration payload.');
    const ids = new Set<string>();
    for (const chat of value.chats) {
      if (
        !chat ||
        typeof chat.id !== 'string' ||
        !chat.id ||
        ids.has(chat.id) ||
        !Number.isFinite(chat.updatedAt) ||
        typeof chat.title !== 'string' ||
        typeof chat.draft !== 'string' ||
        chat.draft.length > 12000 ||
        !Array.isArray(chat.history) ||
        chat.history.length > 100 ||
        chat.history.some(
          (event: any) =>
            !event ||
            typeof event.text !== 'string' ||
            !['user', 'message', 'error', 'handoff'].includes(event.type)
        )
      )
        throw new Error(
          'Conversation migration would discard invalid or oversized records.'
        );
      if (
        (chat.privateData !== undefined &&
          typeof chat.privateData !== 'boolean') ||
        (chat.groupId !== undefined &&
          chat.groupId !== null &&
          (typeof chat.groupId !== 'string' || chat.groupId.length > 300)) ||
        (chat.privateRecipient !== undefined &&
          (typeof chat.privateRecipient !== 'string' ||
            chat.privateRecipient.length > 4000))
      )
        throw new Error('Invalid conversation privacy/scope metadata.');
      ids.add(chat.id);
    }
  } else if (relative === 'ai-checkpoint.bin') {
    if (
      !value ||
      !Array.isArray(value.messages) ||
      value.messages.length > 1000 ||
      !Number.isInteger(value.step) ||
      value.step < 0 ||
      value.step >= 30 ||
      typeof value.endpoint !== 'string' ||
      !/^https?:\/\//.test(value.endpoint) ||
      !Number.isFinite(value.expires)
    )
      throw new Error('Invalid checkpoint migration payload.');
    // Expiration is an application decision; never alter it during format migration.
  } else if (relative === 'password-manager/vault.json') {
    if (
      !value ||
      !Array.isArray(value.items) ||
      ['enabled', 'autofill', 'ai'].some(
        (field) =>
          value[field] !== undefined && typeof value[field] !== 'boolean'
      )
    )
      throw new Error('Invalid vault summary migration payload.');
  }
}

export function readStorageContainer(
  relative: MigratedStorageFile,
  bytes: Buffer
) {
  if (!relative.endsWith('.json')) return { ciphertext: bytes };
  const data = JSON.parse(bytes.toString('utf8'));
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    (data.schemaVersion !== undefined &&
      data.schemaVersion !== STORAGE_SCHEMA_VERSION)
  )
    throw new Error('Unsupported storage container schema.');
  if (
    relative === 'password-manager/vault.json' &&
    ![1, 2].includes(data.version)
  )
    throw new Error('Unsupported password vault format.');
  const encoded =
    relative === 'ai-settings.json' ? data.key : data.summary?.osEncrypted;
  if (encoded !== undefined && typeof encoded !== 'string')
    throw new Error('Invalid ciphertext field.');
  return {
    data,
    ciphertext: encoded ? Buffer.from(encoded, 'base64') : undefined,
  };
}

export function replaceStorageCiphertext(
  relative: MigratedStorageFile,
  bytes: Buffer,
  ciphertext: Buffer
) {
  const container = readStorageContainer(relative, bytes);
  if (!container.data) return ciphertext;
  if (relative === 'ai-settings.json')
    container.data.key = ciphertext.toString('base64');
  else container.data.summary.osEncrypted = ciphertext.toString('base64');
  return Buffer.from(JSON.stringify(container.data));
}
