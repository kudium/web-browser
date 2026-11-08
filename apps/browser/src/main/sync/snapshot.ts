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
