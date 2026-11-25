import type { Collection } from './SpaceManager';
export const COLLECTION_DRAG_MIME = 'application/x-kudiumbrowser-collection';
/** Move only collection metadata; its groups, tabs and login sessions keep their identities. */
export function reorderCollections(collections: Collection[], sourceId: string, targetId: string, after: boolean): Collection[] {
  if (sourceId === targetId) return collections;
  const source = collections.find(item => item.id === sourceId);
  if (!source || !collections.some(item => item.id === targetId)) return collections;
  const next = collections.filter(item => item.id !== sourceId);
  const index = next.findIndex(item => item.id === targetId) + (after ? 1 : 0);
  next.splice(index, 0, source);
  return next.every((item, i) => item === collections[i]) ? collections : next;
}
