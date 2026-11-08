import { IApp } from '../types';
import { groupKey } from './groups';

/** Move a session's saved tabs together, retaining their cookie partition. */
export function moveGroupToFolder(
  apps: IApp[],
  source: IApp,
  spaceId: string,
  folderId?: string
): IApp[] {
  return apps.map((item) =>
    groupKey(item) === groupKey(source) &&
    (item.spaceId || 'default') === (source.spaceId || 'default')
      ? {
          ...item,
          spaceId,
          folderId,
          ...(folderId ? { pinned: true, favorite: false } : {}),
        }
      : item
  );
}
export function removeGroupFolder(
  apps: IApp[],
  spaceId: string,
  folderId: string
): IApp[] {
  return apps.map((item) =>
    (item.spaceId || 'default') === spaceId && item.folderId === folderId
      ? { ...item, folderId: undefined }
      : item
  );
}
