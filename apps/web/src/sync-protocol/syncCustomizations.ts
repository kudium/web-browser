import { SiteDeveloperConfig, validDeveloperConfig } from './siteDeveloper';

export interface SyncedCustomization {
  spaceId: string;
  sessionId: string;
  origin: string;
  config: SiteDeveloperConfig;
}
/** Preserve page customization sources, never execution/notification permissions. */
export function validateSyncCustomizations(
  value: unknown,
  pages: { spaceId: string; sessionId: string; url: string }[]
): SyncedCustomization[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error('Invalid synced customizations');
  const seen = new Set<string>();
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Object.keys(entry).some(
        (key) => !['spaceId', 'sessionId', 'origin', 'config'].includes(key)
      ) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.spaceId) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.sessionId) ||
      typeof entry.origin !== 'string' ||
      entry.origin.length > 8192
    )
      throw new Error('Invalid synced customization');
    const origin = new URL(entry.origin);
    const key = JSON.stringify([entry.spaceId, entry.sessionId, entry.origin]);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.origin !== entry.origin ||
      origin.username ||
      origin.password ||
      seen.has(key) ||
      !pages.some(
        (page) =>
          page.spaceId === entry.spaceId &&
          page.sessionId === entry.sessionId &&
          new URL(page.url).origin === entry.origin
      )
    )
      throw new Error('Invalid customization scope');
    const config = entry.config;
    if (
      !validDeveloperConfig(config) ||
      Object.keys(config).some(
        (key) => !['enabled', 'before', 'after', 'css', 'hooks'].includes(key)
      ) ||
      config.hooks?.some((hook) =>
        Object.keys(hook).some(
          (key) =>
            ![
              'id',
              'name',
              'enabled',
              'path',
              'before',
              'after',
              'css',
            ].includes(key)
        )
      )
    )
      throw new Error('Invalid customization source');
    seen.add(key);
    return {
      spaceId: entry.spaceId,
      sessionId: entry.sessionId,
      origin: entry.origin,
      config: JSON.parse(JSON.stringify(config)),
    };
  });
}
export function restoredCustomization(
  config: SiteDeveloperConfig
): SiteDeveloperConfig {
  return {
    ...config,
    enabled: false,
    hooks: config.hooks?.map((hook) => ({ ...hook, enabled: false })),
  };
}
