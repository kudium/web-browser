import { IApp } from '../types';
import { groupKey } from './groups';

export const collectionProfile = (spaceId: string, collectionId: string) =>
  `collection:${spaceId}:${collectionId}`;

/**
 * Resolve group policy once per space/group, then apply it to every tab.
 * Explicit login profiles are retained unless collection inheritance is
 * selected.
 */
export function prepareCollectionGroups(
  tabs: IApp[],
  previous: IApp[],
): IApp[] {
  const key = (tab: IApp) =>
    JSON.stringify([tab.spaceId || 'default', groupKey(tab)]);
  const prior = new Map(previous.map((tab) => [key(tab), tab]));
  const representatives = new Map<string, IApp>();
  return tabs.map((tab) => {
    const representative = representatives.get(key(tab));
    const source = representative || prior.get(key(tab));
    const next: IApp = {
      ...tab,
      groupDisplay:
        representative?.groupDisplay ||
        tab.groupDisplay ||
        source?.groupDisplay ||
        'folder',
      sessionMode:
        representative?.sessionMode ||
        tab.sessionMode ||
        source?.sessionMode ||
        (tab.folderId && !tab.sessionProfileId ? 'collection' : 'separate'),
    };
    if (!next.folderId || next.favorite) next.sessionMode = 'separate';
    if (representative) next.sessionProfileId = representative.sessionProfileId;
    if (next.sessionMode === 'collection' && next.folderId)
      next.sessionProfileId = collectionProfile(
        next.spaceId || 'default',
        next.folderId,
      );
    representatives.set(key(tab), next);
    return next;
  });
}

/** Resolve membership through the group so every child tab activates its collection. */
export function activeCollectionId(groups: IApp[], focused?: IApp) {
  if (!focused || focused.archived) return undefined;
  return groups.find(
    (group) =>
      !group.archived &&
      groupKey(group) === groupKey(focused) &&
      (group.spaceId || 'default') === (focused.spaceId || 'default'),
  )?.folderId;
}
