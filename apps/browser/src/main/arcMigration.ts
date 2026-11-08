/* eslint-disable no-underscore-dangle, no-restricted-syntax, no-continue -- Arc encodes dictionaries as alternating keys and values. */
import type { ImportedLink } from '../browser/browserImport';

export function arcProfileName(directory: string, name?: string): string {
  if (directory === 'Default') return 'Default profile';
  const label = String(name || '').trim();
  return label && !['Your Chromium', 'Your Chrome', 'Chrome'].includes(label)
    ? `${label.slice(0, 80)} (${directory})`
    : directory;
}

function profileDirectory(profile: any): string | undefined {
  if (profile?.default === true) return 'Default';
  return profile?.custom?._0?.directoryBasename;
}

export function arcSidebarLinks(
  value: any,
  directory: string,
  limit = 5000
): ImportedLink[] {
  const containers = value?.sidebar?.containers;
  if (!Array.isArray(containers))
    throw new Error('Arc sidebar could not be read.');
  const links: ImportedLink[] = [];
  for (const container of containers) {
    if (!Array.isArray(container?.items) || !Array.isArray(container?.spaces))
      continue;
    const items = new Map<string, any>();
    for (const item of container.items) {
      if (item && typeof item === 'object' && typeof item.id === 'string')
        items.set(item.id, item);
    }
    const seen = new Set<string>();
    const visit = (
      id: string,
      folders: string[],
      spaceName: string,
      favorite: boolean,
      pinned: boolean,
      depth = 0
    ) => {
      if (depth > 32 || seen.has(id) || links.length >= limit) return;
      seen.add(id);
      const item = items.get(id);
      if (!item) return;
      const tab = item.data?.tab;
      if (typeof tab?.savedURL === 'string' && tab.savedURL.length <= 8192) {
        try {
          const url = new URL(tab.savedURL);
          if (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password
          ) {
            links.push({
              url: url.href,
              name: String(item.title || tab.savedTitle || url.hostname).slice(
                0,
                256
              ),
              folderPath: folders,
              spaceName,
              favorite,
              pinned,
            });
          }
        } catch {
          /* Ignore unsupported URLs. */
        }
      }
      const next =
        item.data?.list && item.title
          ? [...folders, String(item.title).slice(0, 128)]
          : folders;
      if (Array.isArray(item.childrenIds))
        for (const child of item.childrenIds) {
          if (typeof child === 'string')
            visit(child, next, spaceName, favorite, pinned, depth + 1);
        }
    };
    const favorites = container.topAppsContainerIDs;
    if (Array.isArray(favorites))
      for (let i = 0; i + 1 < favorites.length; i += 2) {
        if (
          profileDirectory(favorites[i]) === directory &&
          typeof favorites[i + 1] === 'string'
        )
          visit(favorites[i + 1], [], 'Favorites', true, true);
      }
    for (const space of container.spaces) {
      if (
        !space ||
        typeof space !== 'object' ||
        profileDirectory(space.profile) !== directory
      )
        continue;
      const roots = Array.isArray(space.containerIDs)
        ? space.containerIDs
        : space.newContainerIDs;
      if (!Array.isArray(roots)) continue;
      for (let i = 0; i + 1 < roots.length; i += 2) {
        const kind =
          typeof roots[i] === 'string'
            ? roots[i]
            : Object.keys(roots[i] || {})[0];
        if (typeof roots[i + 1] === 'string')
          visit(
            roots[i + 1],
            [],
            String(space.title || 'Arc space').slice(0, 128),
            false,
            kind === 'pinned'
          );
      }
    }
  }
  return links;
}
