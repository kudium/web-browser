// eslint-disable-next-line import/no-relative-packages
import {
  validHookActions,
  type HookAction,
} from '../../../../packages/hooks/actions';
import {
  validInstalledHookSource,
  validTestWebsiteUrl,
} from './hookMarketplace';

export interface HookNotificationPermission {
  id: string;
  key: string;
  label: string;
  destinationHost: string;
  active: boolean;
}

export interface SiteHook {
  actions?: HookAction[];
  publication?: {
    id: string;
    version: number;
    description: string;
    license: import('./hookMarketplace').HookPackage['license'];
  };
  sites?: Array<{ host: string; includeSubdomains: boolean }>;
  testUrl?: string;
  installed?: import('./hookMarketplace').InstalledHookSource;
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
  actions?: HookAction[];
  name?: string;
  defaultEnabled?: boolean;
  hooks?: SiteHook[];
  enabled: boolean;
  before: string;
  after: string;
  css: string;
}
export interface SiteDeveloperLog {
  category?: 'execution' | 'output';
  time: number;
  level: 'info' | 'error';
  hookId?: string;
  phase?: 'before' | 'after' | 'css';
  runId?: string;
  message: string;
}
export interface HookRevision {
  time: number;
  config: SiteDeveloperConfig;
  working?: boolean;
  workingHooks?: string[];
}
export interface SiteDeveloperState {
  hookStatuses?: Record<string, SiteDeveloperState['status']>;
  globalHookCount?: number;
  config: SiteDeveloperConfig;
  status: 'waiting' | 'running' | 'success' | 'error';
  logs: SiteDeveloperLog[];
  notifications?: HookNotificationPermission[];
  revisions?: HookRevision[];
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
    (config.actions === undefined || validHookActions(config.actions)) &&
    (config.name === undefined ||
      (typeof config.name === 'string' && config.name.length <= 120)) &&
    (config.defaultEnabled === undefined ||
      typeof config.defaultEnabled === 'boolean') &&
    (config.hooks === undefined ||
      (Array.isArray(config.hooks) &&
        config.hooks.length <= 20 &&
        new Set(config.hooks.map((hook) => hook?.id)).size ===
          config.hooks.length &&
        config.hooks.every(
          (hook) =>
            hook &&
            (hook.actions === undefined || validHookActions(hook.actions)) &&
            typeof hook.id === 'string' &&
            hook.id.length > 0 &&
            hook.id.length <= 100 &&
            !hook.id.startsWith('global:') &&
            (hook.installed === undefined ||
              validInstalledHookSource(hook.installed)) &&
            (hook.testUrl === undefined || validTestWebsiteUrl(hook.testUrl)) &&
            (hook.sites === undefined ||
              (Array.isArray(hook.sites) &&
                hook.sites.length <= 20 &&
                hook.sites.every(
                  (site) =>
                    site &&
                    typeof site.host === 'string' &&
                    site.host.length <= 253 &&
                    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
                      site.host
                    ) &&
                    typeof site.includeSubdomains === 'boolean'
                ))) &&
            (hook.publication === undefined ||
              (typeof hook.publication.id === 'string' &&
                hook.publication.id.length <= 200 &&
                Number.isInteger(hook.publication.version) &&
                hook.publication.version > 0 &&
                typeof hook.publication.description === 'string' &&
                hook.publication.description.length <= 4000 &&
                ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'GPL-3.0-only'].includes(
                  hook.publication.license
                ))) &&
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

export interface SiteDeveloperWindowState {
  material?: { translucentChrome: boolean; translucentAI: boolean };
  selectedHookId?: string;
  origin: string;
  groupName: string;
  pageURL: string;
  available: boolean;
  developer?: SiteDeveloperState;
}

/** Metadata only; script sources remain in the existing editor flow. */
export interface SiteDeveloperPageSummary {
  id: string;
  name: string;
  url: string;
  origin?: string;
  hooks?: Array<{ id: string; name: string; path: string; enabled: boolean; status?: SiteDeveloperState['status'] }>;
  hasHooks: boolean;
  enabled: boolean;
  status: SiteDeveloperState['status'];
}

export interface HookNotificationBinding {
  key: string;
  recordId: string;
  fieldName: string;
  recipientField?: string;
}
export interface HookNotificationGrant extends HookNotificationBinding {
  id: string;
  groupId: string;
  profile: string;
  scope?: string;
  origin: string;
  label: string;
  destinationHost: string;
  endpointHash: string;
  scriptHash: string;
}

export function hookMatchesPath(pattern: string, url: string): boolean {
  const { pathname } = new URL(url);
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(pathname);
}

export function hookMatchesWebsite(hook: SiteHook, url: string): boolean {
  const host = new URL(url).hostname;
  return (
    !hook.sites?.length ||
    hook.sites.some(
      (site) =>
        host === site.host ||
        (site.includeSubdomains && host.endsWith(`.${site.host}`))
    )
  );
}

/** Host exclusions apply to the installed global hook, independently of its master switch. */
export function hookWebsiteExclusions(exclusions: string[], url: string): string[] {
  const host = new URL(url).hostname;
  return exclusions.filter(rule => rule.startsWith('*.')
    ? host === rule.slice(2) || host.endsWith(`.${rule.slice(2)}`)
    : host === rule);
}
