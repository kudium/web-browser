/* Update checks deliberately fetch one source at a time to bound network work. */
/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
/* Shared portable source contract; both apps build this module directly. */
/* eslint-disable import/no-relative-packages */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import type { WebContents } from 'electron';
import { randomUUID } from 'crypto';
import {
  parseHookPackage,
  packageMatchesSite,
} from '../../../../packages/hooks/package';
import {
  ALL_GROUPS_HOOK_SCOPE,
  type HookDestination,
  type HookImportPreview,
  type HookMarketplaceRequest,
  type HookUpdate,
} from '../browser/hookMarketplace';
import type { SiteHook } from '../browser/siteDeveloper';
import { showBrowserPreferences } from './preferences';
import { getSiteSettings, updateSiteSettings } from './siteSettings';
import { getGlobalHooks, globalHookHash, saveGlobalHooks } from './globalHooks';
import {
  fetchHookPackage,
  hookPackageHash,
  hookPackageURL,
} from './hookPackageFetch';
import { getSiteDeveloperBinding } from './siteDeveloperWindow';

const hosts = new WeakMap<
  WebContents,
  { destinations: () => HookDestination[] }
>();
let registered = false;
let publish:
  | ((data: unknown) => Promise<{ id: string; version: number }>)
  | undefined;
let accountStatus: (() => { signedIn: boolean; email?: string }) | undefined;
export function setHookAccountStatus(
  status: () => { signedIn: boolean; email?: string }
) {
  accountStatus = status;
}
export function setHookPublisher(handler: typeof publish) {
  publish = handler;
}
const pendingLinks: string[] = [];
const readyHosts = new WeakSet<WebContents>();
export function queueHookInstallLink(value: string) {
  const url = hookPackageURL(value);
  pendingLinks.push(url.href);
  if (pendingLinks.length > 10) pendingLinks.shift();
}
export function deliverHookInstallLinks(host: BrowserWindow) {
  if (
    !hosts.has(host.webContents) ||
    !readyHosts.has(host.webContents) ||
    host.isDestroyed()
  )
    return;
  pendingLinks
    .splice(0)
    .forEach((url) => host.webContents.send('hook-marketplace-install', url));
}
export function registerHookMarketplace(
  host: BrowserWindow,
  destinations: () => HookDestination[]
) {
  hosts.set(host.webContents, { destinations });
  if (registered) return;
  registered = true;
  ipcMain.on('hook-marketplace-ready', (event) => {
    if (
      event.senderFrame === event.sender.mainFrame &&
      hosts.has(event.sender)
    ) {
      readyHosts.add(event.sender);
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (owner) deliverHookInstallLinks(owner);
    }
  });
  const previews = new Map<
    string,
    { owner: number; expires: number; preview: HookImportPreview }
  >();
  const resolve = (sender: WebContents, id?: string) => {
    const binding = getSiteDeveloperBinding(sender);
    if (binding) {
      const available = binding.current();
      if (!available)
        throw new Error('The original tab is no longer available.');
      const target = hosts
        .get(binding.host)
        ?.destinations()
        .find((item) => item.id === binding.id);
      if (
        !target ||
        target.profile !== binding.profile ||
        new URL(target.url).origin !== binding.origin
      )
        throw new Error('The hook destination changed.');
      return target;
    }
    const registry = hosts.get(sender);
    if (!registry) throw new Error('Untrusted hook marketplace request.');
    const target = registry.destinations().find((item) => item.id === id);
    if (!target)
      throw new Error('Choose an unlocked website tab as the destination.');
    return target;
  };
  const preview = async (sender: WebContents, url: string) => {
    const loaded = await fetchHookPackage(url, app.getVersion());
    if (sender.isDestroyed()) throw new Error('The installer was closed.');
    const result = { ...loaded, receipt: randomUUID() };
    const now = Date.now();
    previews.forEach((value, key) => {
      if (value.expires < now) previews.delete(key);
    });
    const owned = [...previews].filter(([, p]) => p.owner === sender.id);
    if (owned.length >= 20) previews.delete(owned[0][0]);
    previews.set(result.receipt, {
      owner: sender.id,
      expires: now + 10 * 60000,
      preview: result,
    });
    return result;
  };
  ipcMain.handle(
    'hook-marketplace',
    async (event, input: HookMarketplaceRequest) => {
      if (
        event.senderFrame !== event.sender.mainFrame ||
        (!hosts.has(event.sender) && !getSiteDeveloperBinding(event.sender))
      )
        throw new Error('Untrusted hook marketplace request.');
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid hook marketplace request.');
      if (input.action === 'destinations') {
        const binding = getSiteDeveloperBinding(event.sender);
        return binding
          ? [resolve(event.sender)]
          : hosts.get(event.sender)!.destinations();
      }
      if (input.action === 'browse') {
        await shell.openExternal('https://browser.kudium.com/hooks');
        return null;
      }
      if (input.action === 'preview') return preview(event.sender, input.url);
      if (input.action === 'account-status')
        return accountStatus?.() || { signedIn: false };
      if (input.action === 'account-preferences') {
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (!owner) throw new Error('The hook window is unavailable.');
        showBrowserPreferences(owner, 'sync');
        return null;
      }

      const target = resolve(
        event.sender,
        'id' in input ? input.id : undefined
      );
      const { origin } = new URL(target.url);
      const hookScope =
        input.allGroups === true ? ALL_GROUPS_HOOK_SCOPE : target.profile;
      const state = () => {
        const global = getGlobalHooks(hookScope);
        return {
          destination: target,
          global,
          globalHash: globalHookHash(global),
          siteHooks: input.allGroups
            ? []
            : getSiteSettings(target.profile, origin).developer?.hooks || [],
          defaultHook: input.allGroups
            ? undefined
            : (() => {
                const config = getSiteSettings(
                  target.profile,
                  origin
                ).developer;
                return config &&
                  [config.before, config.after, config.css].some((code) =>
                    code.trim()
                  )
                  ? {
                      id: '',
                      name: 'Default hook',
                      path: '/*',
                      enabled: config.enabled,
                      before: config.before,
                      after: config.after,
                      css: config.css,
                    }
                  : undefined;
              })(),
        };
      };
      if (input.action === 'state') return state();
      if (input.action === 'global-save') {
        saveGlobalHooks(hookScope, input.config, input.expectedHash);
        return state();
      }
      if (input.action === 'install') {
        if (input.allGroups && !input.global)
          throw new Error('All groups requires a general hook.');
        const stored = previews.get(input.receipt);
        if (
          !stored ||
          stored.owner !== event.sender.id ||
          stored.expires < Date.now()
        )
          throw new Error('This preview expired. Load the package again.');
        const item = stored.preview;
        const pkg = item.package;
        if (input.global && pkg.applicability !== 'general')
          throw new Error('Only general hooks can be installed globally.');
        if (!input.global && !packageMatchesSite(pkg, target.url))
          throw new Error('This hook does not support the selected website.');
        const hook: SiteHook = {
          id: randomUUID(),
          name: pkg.name,
          path: pkg.path,
          before: pkg.lifecycle.before,
          after: pkg.lifecycle.after,
          css: pkg.lifecycle.css,
          enabled: false,
          installed: {
            url: item.source,
            packageId: item.publication?.id,
            version: item.publication?.version,
            contentHash: hookPackageHash(pkg),
            package: pkg,
          },
        };
        const replace = (hooks: SiteHook[]) => {
          if (!input.replaceId) {
            if (hooks.length >= 20)
              throw new Error(
                'This destination already has 20 hooks. Remove one first.'
              );
            return [...hooks, hook];
          }
          const previous = hooks.find((h) => h.id === input.replaceId);
          if (!previous || hookPackageHash(previous) !== input.expectedHash)
            throw new Error(
              'The installed hook changed. Review the update again.'
            );
          return hooks.map((h) =>
            h.id === input.replaceId
              ? { ...h, ...hook, id: h.id, enabled: false }
              : h
          );
        };
        if (input.global) {
          const global = getGlobalHooks(hookScope);
          const hooks = replace(global.hooks).map((h) => ({
            ...h,
            exclusions:
              global.hooks.find((old) => old.id === h.id)?.exclusions || [],
          }));
          saveGlobalHooks(
            hookScope,
            { ...global, hooks },
            globalHookHash(global)
          );
        } else {
          const config = getSiteSettings(target.profile, origin).developer || {
            enabled: false,
            before: '',
            after: '',
            css: '',
          };
          updateSiteSettings(target.profile, origin, {
            developer: { ...config, hooks: replace(config.hooks || []) },
          });
        }
        previews.delete(input.receipt);
        return state();
      }
      if (input.action === 'updates') {
        const site = input.allGroups
          ? []
          : getSiteSettings(target.profile, origin).developer?.hooks || [];
        const global = getGlobalHooks(hookScope).hooks;
        const result: HookUpdate[] = [];
        for (const entry of [
          ...global.map((hook) => ({ hook, global: true })),
          ...site.map((hook) => ({ hook, global: false })),
        ]) {
          const current = entry.hook.installed;
          if (!current) continue;
          const local = {
            ...current.package,
            name: entry.hook.name,
            path: entry.hook.path,
            lifecycle: {
              before: entry.hook.before,
              after: entry.hook.after,
              css: entry.hook.css,
            },
          };
          const item: HookUpdate = {
            hookId: entry.hook.id,
            global: entry.global,
            modified: hookPackageHash(local) !== current.contentHash,
            localHash: hookPackageHash(entry.hook),
            localPackage: local,
            current,
          };
          try {
            const url = current.packageId
              ? `https://browser.kudium.com/v1/hooks/${encodeURIComponent(
                  current.packageId
                )}/package`
              : current.url;
            const loaded = await preview(event.sender, url);
            if (hookPackageHash(loaded.package) !== current.contentHash)
              item.preview = loaded;
          } catch {
            item.error = 'Could not check this source for updates.';
          }
          result.push(item);
        }
        return result;
      }
      if (input.action === 'publish') {
        if (!publish) throw new Error('Account sign-in is not available yet.');
        const hooks = input.allGroups
          ? []
          : getSiteSettings(target.profile, origin).developer?.hooks || [];
        let hook: SiteHook | undefined;
        if (input.hookId.startsWith('global:'))
          hook = getGlobalHooks(hookScope).hooks.find(
            (h) => `global:${h.id}` === input.hookId
          );
        else if (input.hookId) hook = hooks.find((h) => h.id === input.hookId);
        else if (!input.allGroups) {
          const config = getSiteSettings(target.profile, origin).developer;
          if (config)
            hook = {
              id: '',
              name: 'Default hook',
              path: '/*',
              enabled: config.enabled,
              before: config.before,
              after: config.after,
              css: config.css,
            };
        }
        if (
          !hook ||
          ![hook.before, hook.after, hook.css].some((code) => code.trim())
        )
          throw new Error('Add code and save your hook before publishing.');
        const pkg = parseHookPackage({
          schemaVersion: 1,
          minimumBrowserVersion: '1.0.0',
          name: input.name ?? hook.name,
          description: input.description,
          license: input.license,
          applicability: input.general ? 'general' : 'site',
          sites: input.general
            ? []
            : [
                {
                  host: new URL(target.url).hostname,
                  includeSubdomains: false,
                },
              ],
          path: hook.path,
          lifecycle: { before: hook.before, after: hook.after, css: hook.css },
        });
        return publish({
          package: pkg,
          ...(input.listingId
            ? { id: input.listingId, expectedVersion: input.expectedVersion }
            : {}),
        });
      }
      throw new Error('Unknown hook marketplace action.');
    }
  );
}
