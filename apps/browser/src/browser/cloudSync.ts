export type SyncProvider = 'icloud' | 'kudiumbrowser';
export interface SyncCategories {
  workspace: boolean;
  openTabs: boolean;
  preferences: boolean;
  passwords?: boolean;
}
export interface SyncSettings {
  enabled: boolean;
  provider: SyncProvider;
  categories: SyncCategories;
}
export const syncCategories = [
  {
    id: 'workspace',
    title: 'Spaces, folders & favorites',
    description: 'Your saved apps and session organization.',
  },
  {
    id: 'openTabs',
    title: 'Open tabs',
    description:
      'Find tabs from your other devices and choose where to continue.',
  },
  {
    id: 'preferences',
    title: 'Browser preferences',
    description: 'Search engines, appearance and keyboard shortcuts.',
  },
] as const;
export function defaultSyncSettings(platform = 'darwin'): SyncSettings {
  return {
    enabled: false,
    provider: platform === 'darwin' ? 'icloud' : 'kudiumbrowser',
    categories: {
      workspace: true,
      openTabs: true,
      preferences: true,
      passwords: true,
    },
  };
}
export function validateSyncSettings(value: unknown): SyncSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid sync settings');
  const settings = value as SyncSettings;
  if (
    Object.keys(settings).some(
      (key) => !['enabled', 'provider', 'categories'].includes(key)
    ) ||
    typeof settings.enabled !== 'boolean' ||
    !['icloud', 'kudiumbrowser'].includes(settings.provider) ||
    !settings.categories ||
    typeof settings.categories !== 'object' ||
    Array.isArray(settings.categories) ||
    Object.keys(settings.categories).some(
      (key) =>
        !['workspace', 'openTabs', 'preferences', 'passwords'].includes(key)
    ) ||
    (settings.categories.passwords !== undefined &&
      typeof settings.categories.passwords !== 'boolean') ||
    syncCategories.some(
      (category) => typeof settings.categories[category.id] !== 'boolean'
    )
  )
    throw new Error('Invalid sync settings');
  if (settings.enabled && !Object.values(settings.categories).some(Boolean))
    throw new Error('Select at least one category to sync');
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    categories: { passwords: true, ...settings.categories },
  };
}
export interface CloudSyncStatus {
  provider: SyncProvider;
  state: 'off' | 'setup-required';
  connected: false;
  message: string;
  lastSyncedAt: null;
}
export function cloudSyncStatus(
  settings: SyncSettings,
  platform: string
): CloudSyncStatus {
  let message = 'Your sync choices are saved. Sync is off.';
  if (settings.enabled) {
    if (settings.provider === 'kudiumbrowser')
      message =
        'Connect your Kudium account and enroll your recovery key in Sync settings to start encrypted sync.';
    else if (platform !== 'darwin')
      message =
        'iCloud sync is available only on Mac. Choose Kudium Browser for other platforms.';
    else
      message =
        'iCloud connection is not available in this build. Your choices are saved; no data is uploaded.';
  }
  return {
    provider: settings.provider,
    state: settings.enabled ? 'setup-required' : 'off',
    connected: false,
    message,
    lastSyncedAt: null,
  };
}
