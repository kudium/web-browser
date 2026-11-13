import type { BrowserPreferences } from '../../browser/preferences';
import type { IApp } from '../../types';
import type { Space } from '../../utils/SpaceManager';
import { SyncSettings, validateSyncSettings } from '../../browser/cloudSync';

const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const id = (value: string) => {
  if (typeof value !== 'string' || !idPattern.test(value))
    throw new Error('Invalid sync record ID');
  return value;
};
const label = (value: string) => {
  if (typeof value !== 'string' || value.length > 256)
    throw new Error('Invalid sync label');
  return value;
};
function webUrl(value: string): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
export const portablePreferenceKeys = [
  'searchEngine',
  'searchEngines',
  'zoom',
  'spellcheck',
  'spellcheckLanguage',
  'defaultFontSize',
  'shortcuts',
] as const;

/** Explicit outbound allowlist. No localStorage/profile directory export. */
export function buildSyncSnapshot(input: {
  settings: SyncSettings;
  deviceId: string;
  apps: (IApp & { private?: boolean })[];
  spaces: Space[];
  preferences: BrowserPreferences;
  currentUrls?: Record<string, string>;
  now?: number;
}) {
  const settings = validateSyncSettings(input.settings);
  if (!settings.enabled) throw new Error('Sync is disabled');
  if (input.apps.length > 5000 || input.spaces.length > 200)
    throw new Error('Sync snapshot is too large');
  const apps = input.apps.filter((app) => !app.private && webUrl(app.url));
  const workspace = settings.categories.workspace
    ? {
        spaces: input.spaces.map((space) => {
          if (space.folders.length > 500)
            throw new Error('Too many sync folders');
          return {
            id: id(space.id),
            name: label(space.name),
            color: space.color,
            useWebsiteColors:
              space.useWebsiteColors === true ? true : undefined,
            icon: space.icon,
            iconEmoji: space.iconEmoji?.slice(0, 16),
            customColor: /^#[0-9a-f]{6}$/i.test(space.customColor || '')
              ? space.customColor
              : undefined,
            folders: space.folders.map((folder) => ({
              id: id(folder.id),
              name: label(folder.name),
            })),
          };
        }),
        apps: apps.map((app) => ({
          id: id(app.id),
          sessionId: id(app.sessionId || 'legacy'),
          spaceId: id(app.spaceId || 'default'),
          folderId: app.folderId ? id(app.folderId) : undefined,
          name: label(app.name),
          sessionName: app.sessionName ? label(app.sessionName) : undefined,
          homeUrl: webUrl(app.url),
          favorite: Boolean(app.favorite),
          pinned: app.pinned !== false,
          archived: Boolean(app.archived),
        })),
      }
    : undefined;
  const openTabs = settings.categories.openTabs
    ? apps
        .filter((app) => !app.archived)
        .flatMap((app) => {
          const url = webUrl(input.currentUrls?.[app.id] ?? app.url);
          return url
            ? [
                {
                  id: id(app.id),
                  sessionId: id(app.sessionId || 'legacy'),
                  spaceId: id(app.spaceId || 'default'),
                  title: label(app.customName || app.name),
                  url,
                },
              ]
            : [];
        })
    : undefined;
  const preferences = settings.categories.preferences
    ? Object.fromEntries(
        portablePreferenceKeys.map((key) => [key, input.preferences[key]])
      )
    : undefined;
  const createdAt = input.now ?? Date.now();
  if (!Number.isSafeInteger(createdAt) || createdAt < 0)
    throw new Error('Invalid sync timestamp');
  return JSON.parse(
    JSON.stringify({
      version: 1,
      deviceId: id(input.deviceId),
      createdAt,
      workspace,
      openTabs,
      preferences,
    })
  ) as {
    version: 1;
    deviceId: string;
    createdAt: number;
    workspace?: unknown;
    openTabs?: unknown;
    preferences?: unknown;
  };
}

export interface IncomingSnapshot {
  version: 1;
  deviceId: string;
  createdAt: number;
  workspace?: {
    spaces: {
      id: string;
      name: string;
      color: Space['color'];
      useWebsiteColors?: boolean;
      folders: { id: string; name: string }[];
    }[];
    apps: {
      id: string;
      sessionId: string;
      spaceId: string;
      folderId?: string;
      name: string;
      sessionName?: string;
      homeUrl: string;
      favorite: boolean;
      pinned: boolean;
      archived: boolean;
    }[];
  };
  openTabs?: {
    id: string;
    sessionId: string;
    spaceId: string;
    title: string;
    url: string;
  }[];
  preferences?: Partial<
    Pick<BrowserPreferences, (typeof portablePreferenceKeys)[number]>
  >;
}
/** Remote snapshots never carry executable hooks or local login partitions. */
export function validateIncomingSnapshot(value: unknown): IncomingSnapshot {
  const snapshot = value as IncomingSnapshot;
  const only = (object: unknown, keys: string[]) => {
    if (
      !object ||
      typeof object !== 'object' ||
      Array.isArray(object) ||
      Object.keys(object).some((key) => !keys.includes(key))
    )
      throw new Error('Invalid synced data');
  };
  only(snapshot, [
    'version',
    'deviceId',
    'createdAt',
    'workspace',
    'openTabs',
    'preferences',
  ]);
  if (
    snapshot.version !== 1 ||
    !Number.isSafeInteger(snapshot.createdAt) ||
    snapshot.createdAt < 0
  )
    throw new Error('Invalid synced data');
  id(snapshot.deviceId);
  if (snapshot.workspace) {
    only(snapshot.workspace, ['spaces', 'apps']);
    if (
      !Array.isArray(snapshot.workspace.spaces) ||
      snapshot.workspace.spaces.length > 200 ||
      !Array.isArray(snapshot.workspace.apps) ||
      snapshot.workspace.apps.length > 5000
    )
      throw new Error('Invalid synced workspace');
    snapshot.workspace.spaces.forEach((space) => {
      only(space, [
        'id',
        'name',
        'color',
        'icon',
        'iconEmoji',
        'customColor',
        'useWebsiteColors',
        'folders',
      ]);
      if (
        space.useWebsiteColors !== undefined &&
        typeof space.useWebsiteColors !== 'boolean'
      )
        throw new Error('Invalid website colors option');
      id(space.id);
      label(space.name);
      if (
        !['iris', 'red', 'blue', 'green', 'amber', 'pink'].includes(
          space.color
        ) ||
        !Array.isArray(space.folders) ||
        space.folders.length > 500
      )
        throw new Error('Invalid synced space');
      space.folders.forEach((folder) => {
        only(folder, ['id', 'name']);
        id(folder.id);
        label(folder.name);
      });
    });
    snapshot.workspace.apps.forEach((app) => {
      only(app, [
        'id',
        'sessionId',
        'spaceId',
        'folderId',
        'name',
        'sessionName',
        'homeUrl',
        'favorite',
        'pinned',
        'archived',
      ]);
      id(app.id);
      id(app.sessionId);
      id(app.spaceId);
      if (app.folderId) id(app.folderId);
      label(app.name);
      if (app.sessionName) label(app.sessionName);
      if (
        !webUrl(app.homeUrl) ||
        ['favorite', 'pinned', 'archived'].some(
          (key) => typeof app[key as 'pinned'] !== 'boolean'
        )
      )
        throw new Error('Invalid synced page');
    });
  }
  if (snapshot.openTabs) {
    if (!Array.isArray(snapshot.openTabs) || snapshot.openTabs.length > 5000)
      throw new Error('Invalid synced tabs');
    snapshot.openTabs.forEach((tab) => {
      only(tab, ['id', 'sessionId', 'spaceId', 'title', 'url']);
      id(tab.id);
      id(tab.sessionId);
      id(tab.spaceId);
      label(tab.title);
      if (!webUrl(tab.url)) throw new Error('Invalid synced tab');
    });
  }
  if (snapshot.preferences)
    only(snapshot.preferences, [...portablePreferenceKeys]);
  return snapshot;
}
