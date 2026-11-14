import { hookSourceValidator } from "../browser/hookValidation";
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
  hookMatchesWebsite,
  type SiteDeveloperConfig,
} from '../browser/siteDeveloper';
import { getSiteSettings } from './siteSettings';
import { defaultGlobalHooks } from '../browser/defaultGlobalHooks';

const events = new EventEmitter();
let cachedFile: string | undefined;
let profiles: Record<string, GlobalHookConfig> = {};
let defaultsSeeded = false;
const defaultsKey = '@browser-default-hooks';
let formSaveVersion = 0;
const formSaveKey = '@browser-save-form-action';
const filename = () => path.join(app.getPath('userData'), 'global-hooks.json');
function persistProfiles(next: Record<string, GlobalHookConfig>) {
  const file = filename();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    `${file}.tmp`,
    JSON.stringify({
      ...next,
      [defaultsKey]: defaultsSeeded ? 1 : 0,
      [formSaveKey]: formSaveVersion,
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
    defaultsSeeded = false;
    formSaveVersion = 0;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      defaultsSeeded = saved[defaultsKey] === 1;
      formSaveVersion =
        saved[formSaveKey] === 2 ? 2 : saved[formSaveKey] === 1 ? 1 : 0;
      Object.entries(saved).forEach(([key, value]) => {
        if (validGlobalHooks(value)) profiles[key] = value;
      });
    } catch {
      /* Missing settings use the default; individual hooks control execution. */
    }
    cachedFile = file;
  }
  // Seed once. Edits, deletion, disabled state and exclusions remain user-owned.
  if (profile === ALL_GROUPS_HOOK_SCOPE && !defaultsSeeded) {
    const existing = profiles[profile] || { enabled: true, hooks: [] };
    const missing = defaultGlobalHooks.filter(
      (h) => !existing.hooks.some((saved) => saved.id === h.id)
    );
    if (existing.hooks.length + missing.length <= 20) {
      defaultsSeeded = true;
      try {
        persistProfiles({
          ...profiles,
          [profile]: { ...existing, hooks: [...existing.hooks, ...missing] },
        });
      } catch (error) {
        defaultsSeeded = false;
        throw error;
      }
    }
  }
  if (profile === ALL_GROUPS_HOOK_SCOPE && formSaveVersion < 2) {
    const existing = profiles[profile] || { enabled: true, hooks: [] };
    const action = defaultGlobalHooks[0].actions!.find(
      (entry) => entry.id === 'save-form'
    )!;
    const hooks = existing.hooks.map((hook) => {
      if (hook.id !== 'browser-form-tools') return hook;
      const savedAction = hook.actions?.find((entry) => entry.id === action.id);
      if (savedAction) {
        if (
          savedAction.source === 'api.personalData.saveForm();' &&
          savedAction.contexts.length === 2 &&
          savedAction.contexts.includes('input') &&
          savedAction.contexts.includes('password')
        )
          return {
            ...hook,
            actions: hook.actions!.map((entry) =>
              entry === savedAction
                ? { ...entry, contexts: action.contexts }
                : entry
            ),
          };
        return hook;
      }
      if (formSaveVersion === 0 && (hook.actions?.length || 0) < 20)
        return { ...hook, actions: [...(hook.actions || []), action] };
      return hook;
    });
    const previousVersion = formSaveVersion;
    formSaveVersion = 2;
    try {
      persistProfiles({ ...profiles, [profile]: { ...existing, hooks } });
    } catch (error) {
      formSaveVersion = previousVersion;
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
  const next = { ...profiles, [profile]: config };
  persistProfiles(next);
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
          hookMatchesWebsite(hook, url) &&
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
