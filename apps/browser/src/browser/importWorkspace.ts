import type { ImportedLink } from './browserImport';
import type { Space } from '../utils/SpaceManager';
import type { IApp } from '../types';

export function buildImportedWorkspace(
  links: ImportedLink[],
  existing: Space[],
  targetId: string,
  source: string
) {
  const spaces = existing.map((space) => ({
    ...space,
    folders: [...(space.folders || [])],
  }));
  if (!spaces.some((space) => space.id === targetId))
    throw new Error('Choose a destination space.');
  const spaceIds = new Map<string, string>();
  const folderIds = new Map<string, string>();
  const groups = new Map<string, string>();
  const apps: IApp[] = links.map((link) => {
    let spaceId = targetId;
    if (link.spaceName) {
      if (!spaceIds.has(link.spaceName)) {
        const id = crypto.randomUUID();
        spaceIds.set(link.spaceName, id);
        spaces.push({ id, name: link.spaceName, color: 'iris', folders: [] });
      }
      spaceId = spaceIds.get(link.spaceName)!;
    }
    const path = link.folderPath || [];
    const folderKey = JSON.stringify([spaceId, path]);
    let folderId: string | undefined;
    if (path.length) {
      if (!folderIds.has(folderKey)) {
        const id = crypto.randomUUID();
        folderIds.set(folderKey, id);
        spaces
          .find((space) => space.id === spaceId)!
          .folders.push({ id, name: path.join(' / ').slice(0, 256) });
      }
      folderId = folderIds.get(folderKey);
    }
    const groupKey = JSON.stringify([
      spaceId,
      path,
      Boolean(link.favorite),
      link.pinned !== false,
    ]);
    if (!groups.has(groupKey)) groups.set(groupKey, crypto.randomUUID());
    return {
      id: crypto.randomUUID(),
      sessionId: groups.get(groupKey),
      sessionName: path.at(-1) || link.spaceName || `Imported from ${source}`,
      sessionNameCustom: true,
      spaceId,
      folderId,
      name: link.name,
      url: link.url,
      icon: '',
      favorite: link.favorite === true,
      pinned: link.pinned !== false,
    };
  });
  return { apps, spaces };
}
