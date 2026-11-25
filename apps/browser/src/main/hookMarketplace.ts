import { hookSourceValidator } from "../browser/hookValidation";
import { createHookTestWindow, validateHookTest } from './hookTestWindow';
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
import { getBrowserPreferences, showBrowserPreferences } from './preferences';
import { getSiteSettings, updateSiteSettings } from './siteSettings';
import { getGlobalHooks, globalHookHash, saveGlobalHooks } from './globalHooks';
import {
  fetchHookPackage,
  hookPackageHash,
  hookPackageURL,
} from './hookPackageFetch';
import {
  createHookEditorWindow,
  getSiteDeveloperBinding,
} from './siteDeveloperWindow';
import { showBrowserDialog } from './dialogs';
import { resolveHtmlPath } from './util';
import { protectWindowNavigation } from './windowNavigation';

const hosts = new WeakMap<
  WebContents,
  { destinations: () => HookDestination[]; installInPreferences?: boolean; openSiteEditor?: (target: HookDestination, hookId: string) => void }
>();
const globalEditors = new WeakMap<
  WebContents,
  {
    target: HookDestination;
    allGroups: boolean;
    hook: import('../browser/hookMarketplace').GlobalHook;
    testWindow?: BrowserWindow;
    testGeneration?: number;
  }
>();
const globalEditorWindows = new Map<string, BrowserWindow>();
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
  if (!pendingLinks.length) return;
  // Native child windows stay above their browser parent. Present the installer
  // inside visible Preferences rather than opening an obscured parent dialog.
  const preferences = BrowserWindow.getAllWindows().find(
    (window) =>
      !window.isDestroyed() &&
      window.isVisible() &&
      window.getParentWindow() === host &&
      hosts.get(window.webContents)?.installInPreferences &&
      readyHosts.has(window.webContents)
  );
  const destination = preferences || host;
  destination.show();
  destination.focus();
  pendingLinks
    .splice(0)
    .forEach((url) => destination.webContents.send('hook-marketplace-install', url));
}
/** Route in-browser links directly; development builds need no OS registration. */
export function openHookInstallLink(value: string, host: BrowserWindow): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'kudium:' || url.hostname !== 'install-hook') return false;
  } catch {
    return false;
  }
  try {
    queueHookInstallLink(value);
    deliverHookInstallLinks(host);
  } catch (error) {
    void showBrowserDialog(host, {
      message: 'Unable to open hook installer',
      detail: String(error),
      buttons: ['OK'],
    }).catch(() => {});
  }
  return true;
}

/** Settings follows its owning browser window’s live, unlocked destinations. */
export function hookDestinationsFor(contents?: WebContents): HookDestination[] {
  return contents ? hosts.get(contents)?.destinations() || [] : [];
}

/** Reuse the owning browser's editor and its live tab binding. */
export function openInstalledSiteHook(contents: WebContents, target: HookDestination, hookId: string) {
  const open = hosts.get(contents)?.openSiteEditor;
  if (!open) throw new Error('The website is no longer available.');
  open(target, hookId);
}

export function registerHookMarketplace(
  host: BrowserWindow,
  destinations: () => HookDestination[],
  options: { installInPreferences?: boolean; openSiteEditor?: (target: HookDestination, hookId: string) => void } = {}
) {
  hosts.set(host.webContents, { destinations, ...options });
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
        (!hosts.has(event.sender) &&
          !getSiteDeveloperBinding(event.sender) &&
          !globalEditors.has(event.sender))
      )
        throw new Error('Untrusted hook marketplace request.');
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid hook marketplace request.');
      const editorBinding = globalEditors.get(event.sender);
      if (editorBinding) {
        if (
          ![
            'state',
            'browse',
            'global-save',
            'global-test-run',
            'global-test-stop',
            'destinations',
            'account-status',
            'account-preferences',
            'publish',
          ].includes(input.action)
        )
          throw new Error('Unsupported hook editor action.');
        if (
          input.action === 'publish' &&
          input.hookId !== `global:${editorBinding.hook.id}`
        )
          throw new Error('Editor can only publish its selected hook.');
        input = { ...input, allGroups: editorBinding.allGroups };
      }
      if (
        input.action === 'global-test-run' ||
        input.action === 'global-test-stop'
      ) {
        if (!editorBinding)
          throw new Error('Open the Hook Editor to test a hook.');
        if (input.action === 'global-test-run') {
          if (input.hook?.id !== editorBinding.hook.id)
            throw new Error('Editor can only test its selected hook.');
          validateHookTest(input.hook, input.url);
        }
        editorBinding.testGeneration = (editorBinding.testGeneration || 0) + 1;
        const generation = editorBinding.testGeneration;
        editorBinding.testWindow?.destroy();
        editorBinding.testWindow = undefined;
        if (input.action === 'global-test-stop') {
          event.sender.send('global-hook-test-state', {
            url: '',
            status: 'stopped',
            logs: [],
          });
          return null;
        }
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (!owner) throw new Error('Editor window is unavailable.');
        editorBinding.testWindow = createHookTestWindow(
          owner,
          input.hook,
          input.url,
          (state) => {
            if (
              !event.sender.isDestroyed() &&
              editorBinding.testGeneration === generation
            )
              event.sender.send('global-hook-test-state', state);
          }
        );
        return null;
      }
      if (input.action === 'destinations') {
        if (editorBinding) return [editorBinding.target];
        const binding = getSiteDeveloperBinding(event.sender);
        return binding
          ? [resolve(event.sender)]
          : hosts.get(event.sender)!.destinations();
      }
      if (input.action === 'open-install') {
        const host = BrowserWindow.fromWebContents(event.sender);
        if (!host || !hosts.has(event.sender)) throw new Error('Untrusted hook installer.');
        if (!openHookInstallLink(input.url, host)) throw new Error('Invalid hook install link.');
        return;
      }
      if (input.action === 'browse') {
        await shell.openExternal('https://browser.kudium.com/hooks');
        // A retained native editor otherwise covers the main-window installer
        // when the user returns through a marketplace deep link.
        if (editorBinding || getSiteDeveloperBinding(event.sender))
          BrowserWindow.fromWebContents(event.sender)?.hide();
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

      const available = hosts.get(event.sender)?.destinations() || [];
      const globalOnly =
        input.allGroups === true &&
        (['state', 'global-save', 'updates', 'global-editor-open'].includes(
          input.action
        ) ||
          (input.action === 'install' && input.global));
      const target = editorBinding
        ? editorBinding.target
        : globalOnly &&
          hosts.has(event.sender) &&
          (!available.length ||
            ('id' in input && input.id === ALL_GROUPS_HOOK_SCOPE))
        ? {
            id: ALL_GROUPS_HOOK_SCOPE,
            name: 'All websites',
            groupName: 'All groups',
            groupId: ALL_GROUPS_HOOK_SCOPE,
            profile: ALL_GROUPS_HOOK_SCOPE,
            url: 'https://kudium.invalid/',
          }
        : resolve(event.sender, 'id' in input ? input.id : undefined);
      const { origin } = new URL(target.url);
      const hookScope =
        input.allGroups === true ? ALL_GROUPS_HOOK_SCOPE : target.profile;
      const state = () => {
        const global = getGlobalHooks(hookScope);
        return {
          ...(editorBinding
            ? {
                material: {
                  translucentChrome: getBrowserPreferences().translucentChrome,
                  translucentAI: getBrowserPreferences().translucentAI,
                },
                editorHook:
                  global.hooks.find(
                    (hook) => hook.id === editorBinding.hook.id
                  ) || editorBinding.hook,
              }
            : {}),
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
                  ([config.before, config.after, config.css].some((code) =>
                    code.trim()
                  ) || config.actions?.some((action) => action.source.trim()))
                  ? {
                      id: '',
                      name: config.name || 'Default hook',
                      path: '/*',
                      enabled: config.enabled,
                      actions: config.actions,
                      before: config.before,
                      after: config.after,
                      css: config.css,
                    }
                  : undefined;
              })(),
        };
      };
      if (input.action === 'site-editor-open') {
        if (input.allGroups || !state().siteHooks.some(hook => hook.id === input.hookId))
          throw new Error('This hook no longer exists on this website.');
        const binding = getSiteDeveloperBinding(event.sender);
        openInstalledSiteHook(binding?.host || event.sender, target, input.hookId);
        return null;
      }
      if (input.action === 'global-editor-open') {
        const global = getGlobalHooks(hookScope);
        const hook = input.hookId
          ? global.hooks.find((item) => item.id === input.hookId)
          : {
              id: randomUUID(),
              name: 'New global hook',
              testUrl: 'https://example.com',
              path: '/*',
              enabled: false,
              before: '',
              after: '',
              css: '',
              exclusions: [],
            };
        if (!hook) throw new Error('This hook no longer exists.');
        if (!input.hookId && global.hooks.length >= 20)
          throw new Error('Maximum 20 hooks.');
        const key = `${hookScope}\n${hook.id}`;
        const existing = globalEditorWindows.get(key);
        if (existing && !existing.isDestroyed()) {
          existing.show();
          existing.focus();
          return null;
        }
        const editor = createHookEditorWindow(
          `${hook.name} — Hook Editor`,
          BrowserWindow.fromWebContents(event.sender) || undefined
        );
        const contents = editor.webContents;
        globalEditors.set(contents, {
          target,
          allGroups: input.allGroups === true,
          hook,
        });
        globalEditorWindows.set(key, editor);
        const commands = (
          source: import('electron').IpcMainEvent,
          command: unknown
        ) => {
          if (
            source.sender !== contents ||
            source.senderFrame !== contents.mainFrame
          )
            return;
          if (command === 'close') editor.close();
          if (command === 'expand') {
            if (editor.isMaximized()) editor.unmaximize();
            else editor.maximize();
          }
        };
        ipcMain.on('site-developer-command', commands);
        editor.once('closed', () => {
          const binding = globalEditors.get(contents);
          if (binding) {
            binding.testGeneration = (binding.testGeneration || 0) + 1;
            binding.testWindow?.destroy();
          }
          globalEditors.delete(contents);
          globalEditorWindows.delete(key);
          ipcMain.removeListener('site-developer-command', commands);
        });
        const documentURL = resolveHtmlPath('index.html', 'global-hook-editor');
        protectWindowNavigation(contents, documentURL, (url) =>
          shell.openExternal(url)
        );
        let shown = false;
        const showEditor = () => {
          if (shown || editor.isDestroyed()) return;
          shown = true;
          editor.show();
        };
        contents.once('dom-ready', showEditor);
        editor.once('ready-to-show', showEditor);
        editor.loadURL(documentURL).catch(() => editor.close());
        return null;
      }
      if (input.action === 'state') return state();
      if (input.action === 'global-save') {
        if (editorBinding) {
          const current = getGlobalHooks(hookScope);
          const edited = input.config?.hooks?.find(
            (hook) => hook.id === editorBinding.hook.id
          );
          if (
            !edited ||
            input.config.enabled !== current.enabled ||
            JSON.stringify(
              input.config.hooks.filter((hook) => hook.id !== edited.id)
            ) !==
              JSON.stringify(
                current.hooks.filter((hook) => hook.id !== edited.id)
              )
          )
            throw new Error('Editor can only change its selected hook.');
        }
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
        if (!input.global && !packageMatchesSite(pkg, target.url))
          throw new Error('This hook does not support the selected website.');
        const hook: SiteHook = {
          id: randomUUID(),
          name: pkg.name,
          ...(pkg.testUrl ? { testUrl: pkg.testUrl } : {}),
          actions: pkg.actions,
          sites: pkg.sites,
          path: pkg.path,
          before: pkg.lifecycle.before,
          after: pkg.lifecycle.after,
          css: pkg.lifecycle.css,
          enabled: true,
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
              ? { ...h, ...hook, id: h.id, enabled: h.enabled }
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
            developer: { ...config,
              enabled: input.replaceId ? config.enabled : true,
              ...(!input.replaceId && !config.enabled ? { defaultEnabled: false } : {}),
              hooks: replace((config.hooks || []).map(item => !input.replaceId && !config.enabled ? { ...item, enabled: false } : item)),
            },
          });
        }
        previews.delete(input.receipt);
        return {
          ...state(),
          installedHook: {
            id: input.replaceId || hook.id,
            name: hook.name,
            global: input.global,
            enabled: input.replaceId
              ? (input.global ? getGlobalHooks(hookScope).hooks : getSiteSettings(target.profile, origin).developer?.hooks)?.find(item => item.id === input.replaceId)?.enabled
              : true,
            scopeEnabled: input.global
              ? getGlobalHooks(hookScope).enabled
              : getSiteSettings(target.profile, origin).developer?.enabled === true,
          },
        };
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
            testUrl: entry.hook.testUrl,
            applicability: entry.hook.sites?.length
              ? 'site'
              : current.package.applicability,
            sites: entry.hook.sites ?? current.package.sites,
            name: entry.hook.name,
            path: entry.hook.path,
            actions: entry.hook.actions,
            schemaVersion: entry.hook.actions?.length ? 2 : current.package.schemaVersion,
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
              name: config.name || 'Default hook',
              path: '/*',
              enabled: config.enabled,
              actions: config.actions,
                      before: config.before,
              after: config.after,
              css: config.css,
            };
        }
        if (
          !hook ||
          (![hook.before, hook.after, hook.css].some((code) => code.trim()) && !hook.actions?.some((action) => action.source.trim()))
        )
          throw new Error('Add code and save your hook before publishing.');
        const pkg = parseHookPackage({
          schemaVersion: hook.actions?.length ? 2 : 1,
          ...(hook.actions?.length ? { actions: hook.actions } : {}),
          minimumBrowserVersion: '1.0.0',
          ...(input.testUrl ?? hook.testUrl
            ? { testUrl: input.testUrl ?? hook.testUrl }
            : {}),
          name: input.name ?? hook.name,
          description: input.description,
          license: input.license,
          applicability: hook.sites?.length
            ? 'site'
            : input.general
            ? 'general'
            : 'site',
          sites: hook.sites?.length
            ? hook.sites
            : input.general
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
        hookSourceValidator.assert({ ...pkg.lifecycle, actions: pkg.actions });
        const published = await publish({
          package: pkg,
          ...(input.listingId
            ? { id: input.listingId, expectedVersion: input.expectedVersion }
            : {}),
        });
        if (input.hookId.startsWith('global:')) {
          const current = getGlobalHooks(hookScope);
          saveGlobalHooks(
            hookScope,
            {
              ...current,
              hooks: current.hooks.map((item) =>
                item.id === hook!.id
                  ? {
                      ...item,
                      publication: {
                        id: published.id,
                        version: published.version,
                        description: pkg.description,
                        license: pkg.license,
                      },
                    }
                  : item
              ),
            },
            globalHookHash(current)
          );
        }
        return published;
      }
      throw new Error('Unknown hook marketplace action.');
    }
  );
}
