import type { ImportedLink } from './browserImport';
import type { Space } from '../utils/SpaceManager';
import type { IApp } from '../types';

export interface ImportOrganizationOptions {
  foldersAsGroups: boolean;
  spacesAsFolders: boolean;
}

export function buildImportedWorkspace(
  links: ImportedLink[],
  existing: Space[],
  targetId: string,
  source: string,
  options: ImportOrganizationOptions = {
    foldersAsGroups: true,
    spacesAsFolders: true,
  },
  sessionProfileId: string = crypto.randomUUID()
) {
  const compact = source === 'Arc' || source === 'Dia';
  const { foldersAsGroups } = options;
  const spacesAsFolders = compact && options.spacesAsFolders;
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
    if (link.spaceName && !spacesAsFolders) {
      if (!spaceIds.has(link.spaceName)) {
        const id = crypto.randomUUID();
        spaceIds.set(link.spaceName, id);
        spaces.push({ id, name: link.spaceName, color: 'iris', folders: [] });
      }
      spaceId = spaceIds.get(link.spaceName)!;
    }
    const path = link.folderPath || [];
    const destinationPath = [
      ...(spacesAsFolders && link.spaceName ? [link.spaceName] : []),
      ...(foldersAsGroups ? [] : path),
    ];
    const folderKey = JSON.stringify([spaceId, destinationPath]);
    let folderId: string | undefined;
    if (destinationPath.length) {
      if (!folderIds.has(folderKey)) {
        const id = crypto.randomUUID();
        folderIds.set(folderKey, id);
        spaces
          .find((space) => space.id === spaceId)!
          .folders.push({
            id,
            name: destinationPath.join(' / ').slice(0, 256),
          });
      }
      folderId = folderIds.get(folderKey);
    }
    const groupKey = JSON.stringify([
      spaceId,
      link.spaceName,
      path,
      Boolean(link.favorite),
      link.pinned !== false,
    ]);
    if (!groups.has(groupKey)) groups.set(groupKey, crypto.randomUUID());
    return {
      id: crypto.randomUUID(),
      sessionId: groups.get(groupKey),
      sessionProfileId,
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
