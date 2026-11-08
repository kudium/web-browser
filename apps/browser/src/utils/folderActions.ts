import { IApp } from '../types';
import type { Space } from './SpaceManager';

export function folderLinks(
  apps: IApp[],
  spaceId: string,
  folderId: string,
  markdown = false
) {
  return apps
    .filter(
      (tab) =>
        !tab.archived &&
        (tab.spaceId || 'default') === spaceId &&
        tab.folderId === folderId
    )
    .map((tab) => {
      if (!markdown) return tab.url;
      const title = (tab.customName || tab.name || tab.url)
        .replace(/[\r\n]+/g, ' ')
        .replace(/[\\[\]]/g, '\\$&');
      const url = tab.url.replace(/[\s<>]/g, (value) =>
        encodeURIComponent(value)
      );
      return `- [${title}](<${url}>)`;
    })
    .join('\n');
}

/** Move layout membership only: tab and login/profile identities stay intact. */
export function moveFolder(
  apps: IApp[],
  spaces: Space[],
  sourceId: string,
  folderId: string,
  destinationId: string
) {
  const source = spaces.find((space) => space.id === sourceId);
  const destination = spaces.find((space) => space.id === destinationId);
  const folder = source?.folders.find((entry) => entry.id === folderId);
  if (!source || !destination || !folder || sourceId === destinationId)
    return { apps, spaces };
  const destinationFolderId = destination.folders.some(
    (entry) => entry.id === folderId
  )
    ? crypto.randomUUID()
    : folderId;
  return {
    apps: apps.map((tab) =>
      (tab.spaceId || 'default') === sourceId && tab.folderId === folderId
        ? { ...tab, spaceId: destinationId, folderId: destinationFolderId }
        : tab
    ),
    spaces: spaces.map((space) => {
      if (space.id === sourceId)
        return {
          ...space,
          folders: space.folders.filter((entry) => entry.id !== folderId),
        };
      if (space.id === destinationId)
        return {
          ...space,
          folders: [...space.folders, { ...folder, id: destinationFolderId }],
        };
      return space;
    }),
  };
}
