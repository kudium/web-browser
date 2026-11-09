import { IApp } from '../types';
import { SiteDeveloperConfig, validDeveloperConfig } from './siteDeveloper';

export interface PortableGroup {
  format: 'kudiumbrowser-group';
  version: 1;
  name: string;
  slug?: string;
  emoji?: string;
  groupDisplay?: 'folder' | 'stack';
  homeURL?: string;
  pages: {
    name: string;
    url: string;
    pinned?: boolean;
    defaultURL?: string;
  }[];
  developer: { origin: string; config: SiteDeveloperConfig }[];
}
export interface GroupTransferResult {
  tabs: IApp[];
  reviewHooks: boolean;
}
export function parsePortableGroup(value: unknown): PortableGroup {
  const group = value as PortableGroup;
  const webURL = (url: unknown) => {
    if (typeof url !== 'string' || url.length > 8192) return false;
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  };
  if (
    !group ||
    group.format !== 'kudiumbrowser-group' ||
    group.version !== 1 ||
    typeof group.name !== 'string' ||
    (group.groupDisplay !== undefined &&
      !['folder', 'stack'].includes(group.groupDisplay)) ||
    !group.name.trim() ||
    group.name.length > 200 ||
    !Array.isArray(group.pages) ||
    !group.pages.length ||
    group.pages.length > 500 ||
    !group.pages.every(
      (page) =>
        page &&
        typeof page.name === 'string' &&
        page.name.length <= 500 &&
        webURL(page.url) &&
        (page.defaultURL === undefined || webURL(page.defaultURL))
    ) ||
    !Array.isArray(group.developer) ||
    group.developer.length > 500 ||
    !group.developer.every(
      (page) =>
        page &&
        webURL(page.origin) &&
        new URL(page.origin).origin === page.origin &&
        validDeveloperConfig(page.config) &&
        group.pages.some((entry) => new URL(entry.url).origin === page.origin)
    ) ||
    ['slug', 'emoji'].some(
      (key) =>
        group[key as 'slug'] !== undefined &&
        (typeof group[key as 'slug'] !== 'string' ||
          group[key as 'slug']!.length > 200)
    ) ||
    (group.homeURL !== undefined && !webURL(group.homeURL))
  )
    throw new Error('Choose a valid Kudium Browser group export.');
  return group;
}
