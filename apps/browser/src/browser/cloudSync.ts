export type SyncProvider = 'icloud' | 'kudiumbrowser';
export interface SyncCategories {
  workspace: boolean;
  openTabs: boolean;
  preferences: boolean;
  passwords?: boolean;
  notes?: boolean;
}
export interface SyncSettings {
  enabled: boolean;
  provider: SyncProvider;
  icloud?: boolean;
  categories: SyncCategories;
}
export const syncCategories = [
  {
    id: 'notes',
    title: 'Personal notes',
    description:
      'Encrypted Markdown notes. Back up and restore in Sync settings.',
  },
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
export function defaultSyncSettings(_platform = 'darwin'): SyncSettings {
  return {
    enabled: true,
    provider: 'kudiumbrowser',
    icloud: false,
    categories: {
      workspace: true,
      openTabs: true,
      preferences: true,
      passwords: true,
      notes: true,
    },
  };
}
export function validateSyncSettings(
  value: unknown,
  icloudAvailable = false
): SyncSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid sync settings');
  const settings = value as SyncSettings;
  if (
    Object.keys(settings).some(
      (key) => !['enabled', 'provider', 'icloud', 'categories'].includes(key)
    ) ||
    typeof settings.enabled !== 'boolean' ||
    (settings.icloud !== undefined && typeof settings.icloud !== 'boolean') ||
    !['icloud', 'kudiumbrowser'].includes(settings.provider) ||
    !settings.categories ||
    typeof settings.categories !== 'object' ||
    Array.isArray(settings.categories) ||
    Object.keys(settings.categories).some(
      (key) =>
        ![
          'workspace',
          'openTabs',
          'preferences',
          'passwords',
          'notes',
        ].includes(key)
    ) ||
    (settings.categories.notes !== undefined &&
      typeof settings.categories.notes !== 'boolean') ||
    (settings.categories.passwords !== undefined &&
      typeof settings.categories.passwords !== 'boolean') ||
    syncCategories.some(
      (category) =>
        category.id !== 'notes' &&
        typeof settings.categories[category.id] !== 'boolean'
    )
  )
    throw new Error('Invalid sync settings');
  if (settings.enabled && !Object.values(settings.categories).some(Boolean))
    throw new Error('Select at least one category to sync');
  return {
    enabled:
      (settings.provider === 'kudiumbrowser' || icloudAvailable) &&
      settings.enabled,
    provider: icloudAvailable ? settings.provider : 'kudiumbrowser',
    icloud:
      settings.icloud ?? (settings.provider === 'icloud' && settings.enabled),
    categories: { notes: true, passwords: true, ...settings.categories },
  };
}
export interface CloudSyncStatus {
  provider: SyncProvider;
  icloudAvailable?: boolean;
  state: 'off' | 'setup-required';
  connected: false;
  message: string;
  lastSyncedAt: null;
}
export function cloudSyncStatus(
  settings: SyncSettings,
  platform: string,
  icloudAvailable = false
): CloudSyncStatus {
  const accountEnabled =
    settings.enabled && settings.provider === 'kudiumbrowser';
  const icloudEnabled =
    settings.icloud || (settings.enabled && settings.provider === 'icloud');
  let message = 'Your sync choices are saved. Sync is off.';
  if (accountEnabled || icloudEnabled) {
    if (accountEnabled)
      message =
        'Connect your Kudium account and enroll your recovery key in Sync settings to start encrypted sync.';
    else if (platform !== 'darwin')
      message =
        'iCloud sync is available only on Mac. Choose Kudium Browser for other platforms.';
    else if (icloudAvailable)
      message =
        'Connect the iCloud account on this Mac to set up encrypted sync.';
    else
      message =
        'iCloud connection is not available in this build. Your choices are saved; no data is uploaded.';
  }
  return {
    provider: !accountEnabled && icloudEnabled ? 'icloud' : settings.provider,
    state: accountEnabled || icloudEnabled ? 'setup-required' : 'off',
    icloudAvailable: platform === 'darwin' && icloudAvailable,
    connected: false,
    message,
    lastSyncedAt: null,
  };
}
