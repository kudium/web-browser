export interface HookNotificationPermission {
  id: string;
  key: string;
  label: string;
  destinationHost: string;
  active: boolean;
}

export interface SiteHook {
  id: string;
  name: string;
  enabled: boolean;
  /** Same-origin pathname glob; * matches any characters. Query/hash ignored. */
  path: string;
  before: string;
  after: string;
  css: string;
}

export interface SiteDeveloperConfig {
  hooks?: SiteHook[];
  enabled: boolean;
  before: string;
  after: string;
  css: string;
}
export interface SiteDeveloperLog {
  time: number;
  level: 'info' | 'error';
  message: string;
}
export interface SiteDeveloperState {
  config: SiteDeveloperConfig;
  status: 'waiting' | 'running' | 'success' | 'error';
  logs: SiteDeveloperLog[];
  notifications?: HookNotificationPermission[];
}
export const emptyDeveloperConfig: SiteDeveloperConfig = {
  enabled: false,
  before: '',
  after: '',
  css: '',
};
export function validDeveloperConfig(
  value: unknown
): value is SiteDeveloperConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as SiteDeveloperConfig;
  return (
    typeof config.enabled === 'boolean' &&
    (config.hooks === undefined ||
      (Array.isArray(config.hooks) &&
        config.hooks.length <= 20 &&
        new Set(config.hooks.map((hook) => hook?.id)).size ===
          config.hooks.length &&
        config.hooks.every(
          (hook) =>
            hook &&
            typeof hook.id === 'string' &&
            hook.id.length > 0 &&
            hook.id.length <= 100 &&
            typeof hook.name === 'string' &&
            hook.name.length <= 120 &&
            typeof hook.enabled === 'boolean' &&
            typeof hook.path === 'string' &&
            hook.path.startsWith('/') &&
            hook.path.length <= 500 &&
            ['before', 'after', 'css'].every(
              (key) =>
                typeof hook[key as 'before'] === 'string' &&
                hook[key as 'before'].length <= 20000
            )
        ))) &&
    ['before', 'after', 'css'].every(
      (key) =>
        typeof config[key as 'before'] === 'string' &&
        config[key as 'before'].length <= 100000
    )
  );
}

