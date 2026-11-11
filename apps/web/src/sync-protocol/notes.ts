export interface SyncedNote {
  id: string;
  title: string;
  notes: string;
  scope?: string;
  sensitive?: boolean;
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
        (key) => !['id', 'title', 'notes', 'scope', 'sensitive'].includes(key)
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
    size += item.notes.length;
    if (size > 1000000) throw new Error('Notes backup is too large.');
    return {
      id: item.id,
      title: item.title,
      notes: item.notes,
      scope: item.scope,
      ...(item.sensitive === undefined ? {} : { sensitive: item.sensitive }),
    };
  });
}

