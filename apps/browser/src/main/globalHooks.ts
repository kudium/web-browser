import { stampHookEdits } from '../browser/hookOrdering';
import { hookSourceValidator } from "../browser/hookValidation";
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import {
  ALL_GROUPS_HOOK_SCOPE,
  globalHookEnabledOnWebsite,
  type GlobalHookConfig,
} from '../browser/hookMarketplace';
import {
  emptyDeveloperConfig,
  validDeveloperConfig,
  hookMatchesPath,
  hookMatchesWebsite,
  hookWebsiteExclusions,
  type SiteDeveloperConfig,
} from '../browser/siteDeveloper';
import { getSiteSettings } from './siteSettings';

const events = new EventEmitter();
let cachedFile: string | undefined;
let profiles: Record<string, GlobalHookConfig> = {};
let formToolsRetired = false;
const retirementKey = '@browser-form-tools-retired';
const filename = () => path.join(app.getPath('userData'), 'global-hooks.json');
function persistProfiles(next: Record<string, GlobalHookConfig>) {
  const file = filename();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    `${file}.tmp`,
    JSON.stringify({
      ...next,
      [retirementKey]: formToolsRetired ? 1 : 0,
    }),
    { mode: 0o600 }
  );
  fs.renameSync(`${file}.tmp`, file);
  profiles = JSON.parse(JSON.stringify(next));
}
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
        (h.autoMode === undefined || typeof h.autoMode === 'boolean') &&
        (h.enabledSites === undefined || (Array.isArray(h.enabledSites) && h.enabledSites.length <= 100 && h.enabledSites.every(host => typeof host === 'string' && host.length <= 253 && /^[a-z0-9.-]+$/.test(host)))) &&
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
function isBundledFormTools(hook: GlobalHookConfig['hooks'][number]) {
  const signatures: Record<string, { name: string; contexts: string[] }> = {
    'generate-password': { name: 'Generate password', contexts: ['password'] },
    'save-form': { name: 'Save form to Personal Data', contexts: ['page', 'input', 'password'] },
    'fill-personal-data': { name: 'Fill from Personal Data', contexts: ['input'] },
  };
  const sources: Record<string, string> = {
    'generate-password': 'api.passwords.generateAndFill();',
    'save-form': 'api.personalData.saveForm();',
    'fill-personal-data': 'api.personalData.fill();',
  };
  const actions = hook.actions || [];
  return hook.id === 'browser-form-tools' && hook.name === 'Form tools' &&
    hook.path === '/*' && !hook.before && !hook.after && !hook.css &&
    !hook.exclusions.length && !hook.installed &&
    (actions.length === 2 || actions.length === 3) &&
    new Set(actions.map(action => action.id)).size === actions.length &&
    actions.some(action => action.id === 'generate-password') &&
    actions.some(action => action.id === 'fill-personal-data') &&
    actions.every(action => {
      const signature = signatures[action.id];
      const contexts = action.id === 'save-form' && action.contexts.length === 2
        ? ['input', 'password'] : signature?.contexts;
      return signature && action.name === signature.name &&
        action.source === sources[action.id] &&
        JSON.stringify(action.contexts) === JSON.stringify(contexts);
    });
}
export function getGlobalHooks(profile: string): GlobalHookConfig {
  const file = filename();
  if (cachedFile !== file) {
    profiles = {};
    formToolsRetired = false;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      formToolsRetired = saved[retirementKey] === 1;
      Object.entries(saved).forEach(([key, value]) => {
        if (validGlobalHooks(value)) profiles[key] = value;
      });
    } catch {
      /* Missing settings use the default; individual hooks control execution. */
    }
    cachedFile = file;
  }
  // Retire only unchanged bundled copies. Customizations and marketplace
  // installations remain user-owned, and are never removed on later reloads.
  if (profile === ALL_GROUPS_HOOK_SCOPE && !formToolsRetired) {
    const existing = profiles[profile] || { enabled: true, hooks: [] };
    const hooks = existing.hooks.filter((hook) => !isBundledFormTools(hook));
    formToolsRetired = true;
    try {
      persistProfiles({ ...profiles, [profile]: { ...existing, hooks } });
    } catch (error) {
      formToolsRetired = false;
      throw error;
    }
  }
  return JSON.parse(
    JSON.stringify(profiles[profile] || { enabled: true, hooks: [] })
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
  config.hooks.forEach(hook => hookSourceValidator.assert(hook));
  const next = { ...profiles, [profile]: { ...config, hooks: stampHookEdits(getGlobalHooks(profile).hooks, config.hooks) } };
  persistProfiles(next);
  events.emit('change', profile);
}
export function onGlobalHooksChanged(callback: (profile: string) => void) {
  events.on('change', callback);
  return () => {
    events.removeListener('change', callback);
  };
}
/** An explicit picker click enables only this website, using the normal saved scope. */
export function enableGlobalHookForRun(profile: string, url: string, hookId: string) {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Open a website before running a hook.');
  const allGroups = hookId.startsWith('global:all:');
  if (!hookId.startsWith('global:')) throw new Error('Invalid global hook.');
  const scope = allGroups ? ALL_GROUPS_HOOK_SCOPE : profile;
  const id = hookId.slice(allGroups ? 'global:all:'.length : 'global:'.length);
  const config = getGlobalHooks(scope);
  const hook = config.hooks.find(item => item.id === id);
  if (!hook) throw new Error('This global hook is no longer installed.');
  if (!config.enabled || !hook.enabled) throw new Error('This hook is disabled globally. Enable it in global hook settings first.');
  if (!hookMatchesPath(hook.path, url) || !hookMatchesWebsite(hook, url)) throw new Error('This hook does not match the current page.');
  if (![hook.before, hook.after, hook.css].some(code => code.trim())) throw new Error('This hook has no JavaScript or CSS to run.');
  if (globalHookEnabledOnWebsite(hook, url)) return;
  if (hookWebsiteExclusions(hook.exclusions, url).some(rule => rule.startsWith('*.'))) throw new Error('This website is excluded by a wildcard rule. Change that rule in global hook settings first.');
  saveGlobalHooks(scope, { ...config, hooks: config.hooks.map(item => item.id !== id ? item : {
    ...item,
    exclusions: item.exclusions.filter(rule => rule !== target.hostname),
    ...(item.autoMode ? { enabledSites: [...new Set([...(item.enabledSites || []), target.hostname])] } : {}),
  }) }, globalHookHash(config));
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
          hookMatchesWebsite(hook, url) &&
          globalHookEnabledOnWebsite(hook, url)
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
    name: site.name,
    actions:
      site.enabled && site.defaultEnabled !== false ? site.actions : undefined,
    enabled: !!active.length || site.enabled,
    before: site.enabled && site.defaultEnabled !== false ? site.before : '',
    after: site.enabled && site.defaultEnabled !== false ? site.after : '',
    css: site.enabled && site.defaultEnabled !== false ? site.css : '',
    hooks: [
      ...active,
      ...(site.enabled
        ? (site.hooks || []).filter(
            (hook) =>
              hook.enabled &&
              hookMatchesPath(hook.path, url) &&
              hookMatchesWebsite(hook, url)
          )
        : []),
    ],
  };
}
