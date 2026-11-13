import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import {
  ALL_GROUPS_HOOK_SCOPE,
  type GlobalHookConfig,
} from '../browser/hookMarketplace';
import {
  emptyDeveloperConfig,
  validDeveloperConfig,
  hookMatchesPath,
  type SiteDeveloperConfig,
} from '../browser/siteDeveloper';
import { getSiteSettings } from './siteSettings';

const events = new EventEmitter();
let cachedFile: string | undefined;
let profiles: Record<string, GlobalHookConfig> = {};
const filename = () => path.join(app.getPath('userData'), 'global-hooks.json');
export const globalHookHash = (value: GlobalHookConfig) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validGlobalHooks(value: unknown): value is GlobalHookConfig {
  const config = value as GlobalHookConfig;
  return (
    !!config &&
    typeof config.enabled === 'boolean' &&
    validDeveloperConfig({
      ...emptyDeveloperConfig,
      enabled: config.enabled,
      hooks: config.hooks,
    }) &&
    Array.isArray(config.hooks) &&
    config.hooks.every(
      (h) =>
        Array.isArray(h.exclusions) &&
        h.exclusions.length <= 100 &&
        h.exclusions.every(
          (host) =>
            typeof host === 'string' &&
            host.length <= 253 &&
            /^(\*\.)?[a-z0-9.-]+$/.test(host)
        )
    )
  );
}
export function getGlobalHooks(profile: string): GlobalHookConfig {
  const file = filename();
  if (cachedFile !== file) {
    profiles = {};
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      Object.entries(saved).forEach(([key, value]) => {
        if (validGlobalHooks(value)) profiles[key] = value;
      });
    } catch {
      /* Missing settings start disabled. */
    }
    cachedFile = file;
  }
  return JSON.parse(
    JSON.stringify(profiles[profile] || { enabled: false, hooks: [] })
  );
}
export function saveGlobalHooks(
  profile: string,
  config: GlobalHookConfig,
  expectedHash: string
) {
  if (!validGlobalHooks(config))
    throw new Error('Invalid global hook settings (maximum 20 hooks).');
  if (globalHookHash(getGlobalHooks(profile)) !== expectedHash)
    throw new Error('Global hooks changed. Reload before saving.');
  const next = { ...profiles, [profile]: config };
  const file = filename();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
  profiles = JSON.parse(JSON.stringify(next));
  events.emit('change', profile);
}
export function onGlobalHooksChanged(callback: (profile: string) => void) {
  events.on('change', callback);
  return () => {
    events.removeListener('change', callback);
  };
}
/**
 * Used for execution and every privileged output check, never as the editor
 * draft.
 */
export function effectiveHookConfig(
  profile: string,
  url: string
): SiteDeveloperConfig {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return emptyDeveloperConfig;
  }
  if (!['http:', 'https:'].includes(target.protocol))
    return emptyDeveloperConfig;
  const site =
    getSiteSettings(profile, target.origin).developer || emptyDeveloperConfig;
  const active = [ALL_GROUPS_HOOK_SCOPE, profile].flatMap((scope) => {
    const global = getGlobalHooks(scope);
    if (!global.enabled) return [];
    return global.hooks
      .filter(
        (hook) =>
          hook.enabled &&
          hookMatchesPath(hook.path, url) &&
          !hook.exclusions.some((rule) =>
            rule.startsWith('*.')
              ? target.hostname === rule.slice(2) ||
                target.hostname.endsWith(`.${rule.slice(2)}`)
              : target.hostname === rule
          )
      )
      .map((hook) => ({
        ...hook,
        id:
          scope === ALL_GROUPS_HOOK_SCOPE
            ? `global:all:${hook.id}`
            : `global:${hook.id}`,
      }));
  });
  return {
    enabled: !!active.length || site.enabled,
    before: site.enabled ? site.before : '',
    after: site.enabled ? site.after : '',
    css: site.enabled ? site.css : '',
    hooks: [
      ...active,
      ...(site.enabled
        ? (site.hooks || []).filter(
            (hook) => hook.enabled && hookMatchesPath(hook.path, url)
          )
        : []),
    ],
  };
}
