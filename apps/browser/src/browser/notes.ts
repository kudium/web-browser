import { validateTodo } from './todos';
export interface SyncedNote {
  id: string;
  title: string;
  notes: string;
  scope?: string;
  sensitive?: boolean;
  todo?: import('./todos').TodoData;
}
/**
 * Backups exclude AI grants. Restored copies require the user to enable AI
 * access.
 */
export function validateSyncedNotes(value: unknown): SyncedNote[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error('Invalid notes backup.');
  const ids = new Set<string>();
  let size = 0;
  return value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Object.keys(item).some(
        (key) => !['id', 'title', 'notes', 'scope', 'sensitive', 'todo'].includes(key)
      ) ||
      typeof item.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.title.length > 120 ||
      (item.sensitive !== undefined && typeof item.sensitive !== 'boolean') ||
      typeof item.notes !== 'string' ||
      item.notes.length > 100000 ||
      (item.scope !== undefined &&
        (typeof item.scope !== 'string' ||
          !item.scope ||
          item.scope.length > 200))
    )
      throw new Error('Invalid note in backup.');
    ids.add(item.id);
    size += item.notes.length + (item.todo ? JSON.stringify(item.todo).length : 0);
    if (size > 1000000) throw new Error('Notes backup is too large.');
    return {
      id: item.id,
      title: item.title,
      notes: item.notes,
      scope: item.scope,
      ...(item.todo === undefined ? {} : { todo: validateTodo(item.todo) }),
      ...(item.sensitive === undefined ? {} : { sensitive: item.sensitive }),
    };
  });
}

export function normalizeNote(
  input: import('./passwordManager').VaultItem,
  scope?: string
): import('./passwordManager').VaultItem {
  if (
    !input ||
    typeof input.title !== 'string' ||
    (input.sensitive !== undefined && typeof input.sensitive !== 'boolean')
  )
    throw new Error('Invalid note.');
  const note = validateSyncedNotes([
    {
      id: input.id,
      title: input.title.trim() || 'Untitled note',
      notes: input.notes || '',
      ...(input.todo === undefined ? {} : { todo: input.todo }),
      scope,
    },
  ])[0];
  if (
    input.kind !== 'note' ||
    input.password ||
    input.fields?.length ||
    input.document
  )
    throw new Error('Invalid note.');
  return {
    ...note,
    kind: 'note',
    version: 2,
    origin: '',
    username: '',
    password: '',
    fields: [],
    allowAI: input.allowAI === true,
    sensitive: input.sensitive === true,
    asRead: input.asRead !== false,
  };
}
