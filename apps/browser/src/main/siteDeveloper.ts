import { installPersonalDataAutofill } from '../browser/personalDataAutofill';
import { createPersonalDataMatching } from '../browser/personalDataMatching';
import { app, ipcMain, WebContents, BrowserWindow } from 'electron';
import fs from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import { randomUUID } from 'crypto';
import { effectiveHookConfig, onGlobalHooksChanged } from './globalHooks';
import { ALL_GROUPS_HOOK_SCOPE } from '../browser/hookMarketplace';
import {
  emptyDeveloperConfig,
  hookMatchesPath,
  SiteDeveloperState,
  type SiteDeveloperConfig,
} from '../browser/siteDeveloper';
import { hookNotifications, hookScriptHash } from './hookNotifications';
import { browserActivity } from './activity';
import { sidebarPanelsFor } from './sidebarPanels';
import { showHookPanel, closeHookPanel, removeHookPanels, respondHookPanel } from './hookPanels';
import { saveNoteWithActivity } from './noteActivity';
import { getGroupLocks } from './groupLocks';
import { validateActivity } from '../browser/activity';
import type { HookContext } from './hookNotifications';
import {
  getSiteSettings,
  siteOrigin,
  markHooksWorking,
  onSiteSettingsChanged,
} from './siteSettings';

// No bridge is exposed to website scripts. Hooks run in the sandboxed preload's
// isolated DOM world, with no Node.js or privileged Kudium Browser APIs.
export const developerPreloadSource = String.raw`
const { ipcRenderer, webFrame } = require('electron');
if (window === window.top) {
  (${installPersonalDataAutofill.toString()})(ipcRenderer, (${createPersonalDataMatching.toString()})().score);
  let generation = 0;
  let rerun;
  const owned = new Set();
  const stop = () => {
    generation++;
    rerun = undefined;
    for (const dispose of [...owned]) { try { dispose(); } catch (_) {} }
    owned.clear();
  };
  ipcRenderer.on('site-developer-stop', stop);
  addEventListener('pagehide', stop);
  const start = async (route = false, onlyHook) => {
    stop();
    const current = generation;
    const config = ipcRenderer.sendSync('site-developer-config');
    if (!config) return;
    const token = config.token;
    const active = () => current === generation;
    const panelActions = new Map();
    const panelListener = (_event, request) => {
      if (!active() || request?.token !== token) return;
      const entry = panelActions.get(JSON.stringify([request.hookId,request.action]));
      const answer = input => ipcRenderer.invoke('site-developer-output',{token,kind:'panel-response',hookId:request.hookId || undefined,input:{requestId:request.requestId,...input}}).catch(() => {});
      if (!entry || !entry.alive()) { answer({error:'Panel action handler is not registered.'}); return; }
      Promise.resolve().then(()=>entry.handler(request.payload)).then(value=>{if(entry.alive())answer({value:value ?? null})},error=>{if(entry.alive())answer({error:String(error?.message || error).slice(0,2000)})});
    };
    ipcRenderer.on('site-developer-panel-action',panelListener);
    owned.add(()=>{panelActions.clear();ipcRenderer.removeListener?.('site-developer-panel-action',panelListener)});
    const send = (kind, value, detail = {}) => { if (active()) ipcRenderer.send('site-developer-event', { token, kind, value, ...detail }); };
    const format = value => { try { return typeof value === 'string' ? value : JSON.stringify(value); } catch (_) { return String(value); } };
    const allHooks = [...(config.hooks || []).filter(hook => hook.id?.startsWith('global:')), {...config, id: undefined, name: config.name || 'Default hook'}, ...(config.hooks || []).filter(hook => !hook.id?.startsWith('global:'))];
    const hooks = onlyHook === undefined ? allHooks : allHooks.filter(hook => (hook.id || '') === onlyHook);
    let failed = false;
    const failedHooks = new Set();
    const hookOwned = new Map();
    const own = (hook, cleanup) => {
      owned.add(cleanup);
      if (!hookOwned.has(hook.id)) hookOwned.set(hook.id, new Set());
      hookOwned.get(hook.id).add(cleanup);
    };
    const run = async (hook, phase) => {
      if (!active() || !hook[phase].trim()) return;
      const detail = {hookId: hook.id || '', phase, runId: token + ':' + (hook.id || 'default') + ':' + phase};
      const controller = new AbortController();
      const cleanups = new Set();
      let hasPanel = false;
      const dispose = () => {
        if (controller.signal.aborted) return;
        controller.abort();
        if(hasPanel)ipcRenderer.invoke('site-developer-output',{token,kind:'panel-dispose',hookId:hook.id}).catch(()=>{});
        for (const cleanup of [...cleanups].reverse()) { try { cleanup(); } catch (_) {} }
        cleanups.clear(); owned.delete(dispose);
      };
      own(hook, dispose);
      const alive = () => active() && !controller.signal.aborted;
      const report = error => {
        if (alive()) { failed = true; failedHooks.add(hook.id); send('error', hook.name + ' · ' + phase + ': ' + String(error?.stack || error).slice(0, 1800), detail); }
        dispose();
      };
      const guarded = (callback, ...args) => {
        if (!alive()) return;
        try { const result = callback(...args); if (result && typeof result.catch === 'function') result.catch(report); }
        catch (error) { report(error); }
      };
      const onCleanup = cleanup => {
        if (typeof cleanup !== 'function') throw new TypeError('onCleanup expects a function');
        if (alive()) cleanups.add(cleanup); else cleanup();
      };
      const log = (...values) => { if (alive()) send('log', hook.name + ' · ' + phase + ': ' + values.map(format).join(' ').slice(0, 1800), detail); };
      const page = Object.freeze(Object.fromEntries(['reload','back','forward','stop'].map(action => [action, () => { if (alive()) send('control', action); }])));
      const output = (kind, input) => {
        if (!alive()) return Promise.reject(new Error('This hook run has stopped'));
        return ipcRenderer.invoke('site-developer-output', {token, kind, input, hookId: hook.id});
      };
      const notify = (key, text) => alive() ? ipcRenderer.invoke('site-developer-notify', {token, key, text}) : Promise.reject(new Error('This hook run has stopped'));
      const activity = Object.freeze({create: input => output('activity', input)});
      const notes = Object.freeze({create: input => output('note', input)});
      const panel = Object.freeze({
        show: input => {hasPanel=true;return output('panel', input)}, update: input => {hasPanel=true;return output('panel', input)},
        close: id => output('panel-close', id),
        onAction: (id, handler) => {
          if (typeof id !== 'string' || typeof handler !== 'function') throw new Error('Provide an action id and handler');
          const key = JSON.stringify([hook.id || '',id]);
          const entry = {handler,alive};
          panelActions.set(key,entry);
          const remove = () => {if(panelActions.get(key) === entry)panelActions.delete(key)};
          onCleanup(remove);return remove;
        }
      });
      const context = Object.freeze({url: location.href, document, notify, activity, notes, panel,
        runId: token + ':' + (hook.id || 'default') + ':' + phase,
        signal: controller.signal, onCleanup,
        setInterval: (callback, delay, ...args) => { const id = setInterval(() => { guarded(callback, ...args); }, delay); onCleanup(() => clearInterval(id)); return id; },
        setTimeout: (callback, delay, ...args) => { let id; const cleanup = () => clearTimeout(id); id = setTimeout(() => { cleanups.delete(cleanup); guarded(callback, ...args); }, delay); onCleanup(cleanup); return id; },
        listen: (target, type, callback, options) => { const listener = event => guarded(callback, event); target.addEventListener(type, listener, options); onCleanup(() => target.removeEventListener(type, listener, options)); },
        get content() { return document.documentElement?.outerHTML || ''; }, page, log});
      send('running', hook.name + ' · ' + phase, detail);
      let timer;
      try {
        const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
        const callback = new AsyncFunction('context', '"use strict"; const {url, document, content, page, log, notify, activity, notes, panel, setInterval, setTimeout, onCleanup, signal, listen, runId} = context;\n' + hook[phase] + '\n//# sourceURL=kudium-hook-' + encodeURIComponent(hook.id || 'default') + '-' + phase + '.js');
        await Promise.race([callback(context), new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Hook stopped')), {once:true})), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Callback timed out after 10 seconds')), 10000); })]);
        if (alive()) log('completed');
      } catch (error) {
        if (alive()) { failed = true; failedHooks.add(hook.id); send('error', hook.name + ' · ' + phase + ': ' + String(error?.stack || error).slice(0, 1800), detail); }
        dispose();
      } finally { clearTimeout(timer); }
    };
    const rerunning = new Set();
    rerun = async (id) => {
      const hook = hooks.find(hook => (hook.id || '') === id);
      if (!hook || rerunning.has(id) || !active()) return;
      rerunning.add(id);
      for (const cleanup of hookOwned.get(hook.id) || []) { try { cleanup(); } catch (_) {} owned.delete(cleanup); }
      hookOwned.delete(hook.id);
      failedHooks.delete(hook.id);
      try {
        await run(hook, 'before');
        if (active() && hook.css.trim()) {
          try { const key = await webFrame.insertCSS(hook.css); if (active()) own(hook, () => webFrame.removeInsertedCSS(key).catch(() => {})); else webFrame.removeInsertedCSS(key).catch(() => {}); }
          catch (error) { failedHooks.add(hook.id); send('error', hook.name + ' · CSS: ' + String(error), {hookId: id, phase: 'css'}); }
        }
        await run(hook, 'after');
        if (active() && !failedHooks.has(hook.id)) send('hook-success', id);
      } finally { rerunning.delete(id); }
    };
    // Start before-load callbacks synchronously, before CSS IPC can yield to the page.
    const before = route ? Promise.resolve() : (async () => {
      for (const hook of hooks) await run(hook, 'before');
    })();
    for (const hook of hooks) {
      if (!active()) return;
      if (hook.css.trim()) {
        send('running', hook.name + ' · CSS', {hookId: hook.id || '', phase: 'css'});
        try { const key = await webFrame.insertCSS(hook.css); if (active()) own(hook, () => webFrame.removeInsertedCSS(key).catch(() => {})); else webFrame.removeInsertedCSS(key).catch(() => {}); }
        catch (error) { failed = true; failedHooks.add(hook.id); send('error', hook.name + ' · CSS: ' + String(error), {hookId: hook.id || '', phase: 'css'}); }
      }
    }
    await before;
    if (!route && document.readyState !== 'complete') await new Promise(resolve => {
      const loaded = () => { owned.delete(cancel); resolve(); };
      const cancel = () => { removeEventListener('load', loaded); resolve(); };
      owned.add(cancel); addEventListener('load', loaded, {once:true});
    });
    for (const hook of hooks) await run(hook, 'after');
    for (const hook of hooks) {
      if (active() && !failedHooks.has(hook.id) && (hook.css.trim() || hook.after.trim() || (!route && hook.before.trim()))) send('hook-success', hook.id || '');
    }
    const applicable = hooks.some(hook => hook.css.trim() || hook.after.trim() || (!route && hook.before.trim()));
    if (active() && !failed) send(applicable ? 'success' : 'idle', applicable ? 'Hooks completed' : 'No hooks match this page and stage');
  };
  ipcRenderer.on('site-developer-start-hook', (_event, id) => { if (typeof id === 'string') void start(false, id); });
  ipcRenderer.on('site-developer-rerun', (_event, id) => { if (typeof id === 'string') void rerun?.(id); });
  ipcRenderer.on('site-developer-route', () => { void start(true); });
  void start();
}
`;
let preloadPath: string | undefined;
export function siteDeveloperPreload() {
  if (!preloadPath) {
    preloadPath = path.join(
      app.getPath('userData'),
      'site-developer-preload.cjs'
    );
    fs.mkdirSync(path.dirname(preloadPath), { recursive: true });
    fs.writeFileSync(preloadPath, developerPreloadSource);
  }
  return preloadPath;
}
interface ManagedPage {
  owner?: BrowserWindow;
  previewConfig?: (url: string) => SiteDeveloperConfig;
  profile: string;
  publish: () => void;
  states: Map<string, SiteDeveloperState>;
  token?: string;
  scriptHash?: string;
  outputs?: number[];
  panelOutputs?: number[];
  origin?: string;
  controls: number[];
  events: number[];
  scope: () =>
    | { groupId: string; scope?: string; sourceId?: string }
    | undefined;
}
const pages = new Map<WebContents, ManagedPage>();
function pageConfig(page: ManagedPage, url: string) {
  return page.previewConfig
    ? page.previewConfig(url)
    : effectiveHookConfig(page.profile, url);
}
const developerChanges = new EventEmitter();
export function onDeveloperStateChanged(
  listener: (contents: WebContents) => void
) {
  developerChanges.on('change', listener);
  return () => {
    developerChanges.removeListener('change', listener);
  };
}

let listening = false;
export function developerState(contents: WebContents, origin: string) {
  const page = pages.get(contents);
  const config = page?.previewConfig
    ? page.previewConfig(contents.getURL() || origin)
    : getSiteSettings(page?.profile || '', origin).developer ||
      emptyDeveloperConfig;
  const previous = page?.states.get(origin);
  return {
    config,
    globalHookCount:
      (page
        ? pageConfig(page, contents.getURL() || origin)
        : emptyDeveloperConfig
      ).hooks?.filter((hook) => hook.id.startsWith('global:')).length || 0,
    revisions: page?.previewConfig
      ? []
      : getSiteSettings(page?.profile || '', origin).hookRevisions,
    status: previous?.status || 'waiting',
    hookStatuses: previous?.hookStatuses || {},
    logs: previous?.logs || [],
    notifications: page?.scope()
      ? hookNotifications().permissions({
          ...page.scope()!,
          profile: page.profile,
          origin,
          config: pageConfig(page, contents.getURL() || origin),
        })
      : [],
  } as SiteDeveloperState;
}
/** Rerun only an enabled, currently loaded hook using its existing reviewed runtime. */
export function rerunDeveloperHook(contents: WebContents, origin: string, hookId: string) {
  const page = pages.get(contents);
  if (!page || siteOrigin(contents.getURL()) !== origin) return;
  const identity = page.scope();
  if (identity && getGroupLocks().locked(identity.groupId)) return;
  const state = page.states.get(origin) || developerState(contents, origin);
  const reject = (message: string) => {
    state.hookStatuses ||= {};
    state.hookStatuses[hookId] = 'error';
    state.status = 'error';
    state.logs = [...state.logs.slice(-99), { time: Date.now(), level: 'error' as const, hookId, message }];
    page.states.set(origin, state);
    page.publish();
  };
  const config = pageConfig(page, contents.getURL());
  const hook = hookId ? config.hooks?.find((entry) => entry.id === hookId && entry.enabled) : config;
  if (!config.enabled || !hook) return reject('This hook is disabled or does not match the current page.');
  if (![hook.before, hook.after, hook.css].some((code) => code.trim())) return reject('This hook has no JavaScript or CSS to run.');
  if (page.token && hookScriptHash(config) !== page.scriptHash) return reject('The hook changed. Save it before running again.');
  if (state.hookStatuses?.[hookId] === 'running') return;
  state.hookStatuses ||= {};
  state.hookStatuses[hookId] = 'running';
  state.status = 'running';
  page.states.set(origin, state);
  page.publish();
  contents.send(page.token ? 'site-developer-rerun' : 'site-developer-start-hook', hookId);
}

export function resetDeveloperState(contents: WebContents, origin: string) {
  const page = pages.get(contents);
  if (!page) return;
  removeHookPanels(contents);
  contents.send('site-developer-stop');
  page.token = undefined;
  page.states.delete(origin);
  page.publish();
}
export function clearDeveloperLogs(contents: WebContents, origin: string) {
  const page = pages.get(contents);
  const state = page?.states.get(origin);
  if (state) state.logs = [];
  page?.publish();
}
export function developerSaveError(
  contents: WebContents,
  origin: string,
  message: string
) {
  const page = pages.get(contents);
  if (!page) return;
  const state = developerState(contents, origin);
  state.status = 'error';
  state.logs = [
    ...state.logs.slice(-99),
    { time: Date.now(), level: 'error', message },
  ];
  page.states.set(origin, state);
  page.publish();
}
export function registerDeveloperPage(
  contents: WebContents,
  profile: string,
  publish: () => void,
  scope: () =>
    | { groupId: string; scope?: string; sourceId?: string }
    | undefined = () => ({
    groupId: profile,
  }),
  previewConfig?: (url: string) => SiteDeveloperConfig,
  owner?: BrowserWindow
) {
  const publishState = () => {
    publish();
    developerChanges.emit('change', contents);
  };
  const existing = pages.get(contents);
  if (existing) {
    if (owner && existing.owner !== owner) removeHookPanels(contents);
    existing.publish = publishState;
    existing.scope = scope;
    existing.previewConfig = previewConfig;
    existing.owner = owner || existing.owner;
    return;
  }
  pages.set(contents, {
    owner,
    profile,
    publish: publishState,
    states: new Map(),
    controls: [],
    events: [],
    scope,
    previewConfig,
  });
  contents.once('destroyed', () => {
    removeHookPanels(contents);
    pages.delete(contents);
  });
  contents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
    if (mainFrame) removeHookPanels(contents);
  });
  contents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
    if (isMainFrame) contents.send('site-developer-route');
  });
  if (listening) return;
  listening = true;
  onSiteSettingsChanged((changedProfile, origin) => {
    pages.forEach((page, ownedContents) => {
      if (
        page.profile !== changedProfile ||
        page.origin !== origin ||
        !page.token
      )
        return;
      const config = pageConfig(page, ownedContents.getURL() || origin);
      if (!config?.enabled || hookScriptHash(config) !== page.scriptHash)
        resetDeveloperState(ownedContents, origin);
    });
  });
  onGlobalHooksChanged((changedProfile) => {
    pages.forEach((page, ownedContents) => {
      if (
        (changedProfile === ALL_GROUPS_HOOK_SCOPE ||
          page.profile === changedProfile) &&
        !page.previewConfig &&
        page.origin
      ) {
        hookNotifications().reconcile(
          page.profile,
          page.origin,
          pageConfig(page, ownedContents.getURL())
        );
        resetDeveloperState(ownedContents, page.origin);
      }
    });
  });
  getGroupLocks().subscribe(() => {
    pages.forEach((page, ownedContents) => {
      const identity = page.scope();
      if (identity && page.origin && getGroupLocks().locked(identity.groupId))
        resetDeveloperState(ownedContents, page.origin);
    });
  });
  ipcMain.handle('site-developer-output', (event, request: unknown) => {
    const page = pages.get(event.sender);
    const data = request as {
      token?: unknown;
      kind?: unknown;
      input?: unknown;
      hookId?: unknown;
    };
    const previewGroup = page?.previewConfig && page.owner
      ? sidebarPanelsFor(page.owner).targetGroup || sidebarPanelsFor(page.owner).activeGroup || `hook-test-${event.sender.id}`
      : undefined;
    const identity = page?.scope() ||
      (previewGroup && ['panel', 'panel-close', 'panel-response', 'panel-dispose'].includes(String(data?.kind))
        ? { groupId: previewGroup, sourceId: `hook-test-${event.sender.id}` }
        : undefined);
    const origin = siteOrigin(event.senderFrame?.url || '');
    const config =
      page && origin
        ? pageConfig(page, event.senderFrame?.url || origin)
        : undefined;
    if (
      !page ||
      !identity ||
      !origin ||
      origin !== page.origin ||
      event.senderFrame !== event.sender.mainFrame ||
      !data ||
      !page.token ||
      data.token !== page.token ||
      !config?.enabled ||
      page.scriptHash !== hookScriptHash(config) ||
      getGroupLocks().locked(identity.groupId)
    )
      throw new Error('Unauthorized hook output. Reload the approved hook.');
    const hook =
      data.hookId === undefined
        ? undefined
        : config.hooks?.find(
            (candidate) => candidate.id === data.hookId && candidate.enabled
          );
    if (data.hookId !== undefined && !hook)
      throw new Error('Hook is no longer enabled.');
    if (data.kind === 'panel-dispose')
      return removeHookPanels(event.sender, hook?.id || '');
    if (data.kind === 'panel-response')
      return respondHookPanel(event.sender, data.token, data.hookId, data.input);
    const now = Date.now();
    const panelOutput = data.kind === 'panel' || data.kind === 'panel-close';
    const counter = panelOutput ? 'panelOutputs' : 'outputs';
    page[counter] = (page[counter] || []).filter((time) => now - time < 60000);
    if (page[counter]!.length >= (panelOutput ? 60 : 10))
      throw new Error(panelOutput ? 'Hook panel limit reached: sixty updates per minute per page.' : 'Hook output limit reached: ten items per minute per page.');
    const context = {
      source: 'hook' as const,
      ...identity,
      trigger: {
        sourceId: identity.sourceId,
        profile: page.profile,
        origin,
        pageURL: event.senderFrame.url,
        hookId: hook?.id,
        hookName: hook?.name || 'Default hook',
      },
    };
    if (data.kind === 'panel' || data.kind === 'panel-close') {
      const owner = page.owner || BrowserWindow.fromWebContents(event.sender);
      if (!owner) throw new Error('This hook has no browser panel host.');
      const token = page.token!;
      const binding = {
        source: event.sender, owner, groupId: identity.groupId,
        sourceId: identity.sourceId, token, hookId: hook?.id || '',
        hookName: hook?.name || config.name || 'Default hook',
        authorized: () => {
          const current = page.scope() || (page.previewConfig ? identity : undefined);
          const latest = pageConfig(page, event.sender.getURL());
          return page.token === token && current?.groupId === identity.groupId &&
            !getGroupLocks().locked(identity.groupId) && !!latest.enabled &&
            hookScriptHash(latest) === page.scriptHash;
        },
      };
      page.panelOutputs!.push(now);
      return data.kind === 'panel' ? showHookPanel(binding,data.input) : closeHookPanel(binding,data.input);
    }
    if (data.kind === 'activity') {
      const input = validateActivity(data.input);
      // Hooks cannot link to arbitrary saved notes or read private data.
      if (input.noteId)
        throw new Error('Use notes.create to create a linked note.');
      page.outputs!.push(now);
      return browserActivity().create(
        { ...input, url: input.url || event.senderFrame.url },
        context
      );
    }
    if (data.kind === 'note') {
      const input = data.input as { title?: unknown; body?: unknown };
      if (
        !input ||
        Object.keys(input).some((key) => !['title', 'body'].includes(key)) ||
        typeof input.title !== 'string' ||
        !input.title.trim() ||
        input.title.length > 120 ||
        typeof input.body !== 'string' ||
        input.body.length > 100000
      )
        throw new Error('Provide a note title and Markdown body.');
      page.outputs!.push(now);
      return saveNoteWithActivity(
        {
          id: '',
          kind: 'note',
          title: input.title,
          notes: input.body,
          origin: '',
          username: '',
          password: '',
          fields: [],
          allowAI: false,
          source: {
            label: 'Page hook',
            url: event.senderFrame.url,
            capturedAt: new Date(now).toISOString(),
          },
        },
        identity.scope,
        context,
        event.senderFrame.url
      );
    }
    throw new Error('Invalid hook output kind.');
  });
  ipcMain.handle('site-developer-notify', async (event, request: unknown) => {
    const page = pages.get(event.sender);
    const data = request as { token?: unknown; key?: unknown; text?: unknown };
    const identity = page?.scope();
    const origin = siteOrigin(event.senderFrame?.url || '');
    if (
      !page ||
      !identity ||
      event.senderFrame !== event.sender.mainFrame ||
      !origin ||
      origin !== page.origin ||
      !data ||
      !page.token ||
      typeof data.token !== 'string' ||
      data.token !== page.token ||
      typeof data.key !== 'string' ||
      data.key.length > 60 ||
      typeof data.text !== 'string' ||
      data.text.length > 2000
    )
      throw new Error('Unauthorized hook notification.');
    const config = pageConfig(page, event.senderFrame?.url || origin);
    if (getGroupLocks().locked(identity.groupId) || !config?.enabled)
      throw new Error('Site hooks are disabled.');
    const context: HookContext = {
      ...identity,
      profile: page.profile,
      origin,
      config,
    };
    const controller = new AbortController();
    const abort = () => controller.abort();
    const navigating = (
      _event: unknown,
      _url: string,
      _inPlace: boolean,
      mainFrame: boolean
    ) => {
      if (mainFrame) abort();
    };
    event.sender.once('destroyed', abort);
    event.sender.on('did-start-navigation', navigating);
    try {
      const result = await hookNotifications().notify(
        data.key,
        data.text,
        context,
        controller.signal
      );
      if (!event.sender.isDestroyed() && page.token === data.token) {
        const state = developerState(event.sender, origin);
        state.logs = [
          ...state.logs.slice(-99),
          {
            time: Date.now(),
            level: 'info',
            message: 'Notification accepted by the saved destination.',
          },
        ];
        page.states.set(origin, state);
        page.publish();
      }
      return result;
    } finally {
      event.sender.removeListener('destroyed', abort);
      event.sender.removeListener('did-start-navigation', navigating);
    }
  });

  ipcMain.on('site-developer-config', (event) => {
    const page = pages.get(event.sender);
    const frame = event.senderFrame;
    if (!page || frame !== event.sender.mainFrame) {
      event.returnValue = null;
      return;
    }
    const origin = siteOrigin(frame.url);
    if (!origin) {
      event.returnValue = null;
      return;
    }
    const identity = page.scope();
    const config = pageConfig(page, event.senderFrame?.url || origin);
    if (
      (identity && getGroupLocks().locked(identity.groupId)) ||
      !config?.enabled
    ) {
      event.returnValue = null;
      return;
    }
    removeHookPanels(event.sender);
    page.token = randomUUID();
    page.scriptHash = hookScriptHash(config);
    page.origin = origin;
    const state = developerState(event.sender, origin);
    state.status = 'running';
    state.hookStatuses = {};
    state.logs = [
      ...state.logs.slice(-99),
      { time: Date.now(), level: 'info', category: 'execution', message: 'Page load started' },
    ];
    page.states.set(origin, state);
    if (page.states.size > 20) {
      const oldest = page.states.keys().next().value;
      if (oldest) page.states.delete(oldest);
    }
    event.returnValue = {
      ...config,
      hooks: config.hooks?.filter(
        (hook) => hook.enabled && hookMatchesPath(hook.path, frame.url)
      ),
      token: page.token,
    };
    page.publish();
  });
  ipcMain.on('site-developer-event', (event, message: unknown) => {
    const page = pages.get(event.sender);
    if (
      !page ||
      event.senderFrame !== event.sender.mainFrame ||
      !message ||
      typeof message !== 'object'
    )
      return;
    const { token, kind, value, hookId, phase, runId } = message as Record<
      string,
      unknown
    >;
    if (
      typeof token !== 'string' ||
      token !== page.token ||
      !page.origin ||
      siteOrigin(event.senderFrame.url) !== page.origin ||
      !pageConfig(page, event.senderFrame?.url || page.origin)?.enabled ||
      hookScriptHash(
        pageConfig(page, event.senderFrame?.url || page.origin)!
      ) !== page.scriptHash ||
      typeof value !== 'string'
    )
      return;
    const state = page.states.get(page.origin);
    if (!state) return;
    page.events = page.events.filter((time) => Date.now() - time < 1000);
    if (page.events.length >= 200) {
      state.status = 'error';
      state.logs = [
        ...state.logs.slice(-99),
        {
          time: Date.now(),
          level: 'error',
          message:
            'Hook logging paused: too many messages. Fix the callback and reload.',
        },
      ];
      page.token = undefined;
      page.publish();
      return;
    }
    page.events.push(Date.now());
    if (kind === 'control') {
      if (!['reload', 'back', 'forward', 'stop'].includes(value)) return;
      page.controls = page.controls.filter((time) => Date.now() - time < 10000);
      if (page.controls.length >= 5) {
        state.status = 'error';
        state.logs.push({
          time: Date.now(),
          level: 'error',
          message:
            'Page control loop paused. Disable hooks or fix the callback, then reload.',
        });
        page.token = undefined;
      } else {
        page.controls.push(Date.now());
        state.logs.push({
          time: Date.now(),
          level: 'info',
          message: `Page control: ${value}`,
        });
        if (value === 'reload') event.sender.reload();
        if (value === 'back' && event.sender.navigationHistory.canGoBack())
          event.sender.navigationHistory.goBack();
        if (
          value === 'forward' &&
          event.sender.navigationHistory.canGoForward()
        )
          event.sender.navigationHistory.goForward();
        if (value === 'stop') event.sender.stop();
      }
    } else if (
      ['log', 'error', 'running', 'success', 'idle', 'hook-success'].includes(
        String(kind)
      )
    ) {
      if (kind === 'hook-success' && !page.previewConfig) {
        try {
          const hook = value
            ? state.config.hooks?.find(
                (entry) =>
                  entry.id === value &&
                  entry.enabled &&
                  hookMatchesPath(entry.path, event.senderFrame!.url)
              )
            : undefined;
          if (!value || hook)
            markHooksWorking(page.profile, page.origin, state.config, value);
        } catch {
          /* Execution succeeded; history persistence must not hide its result. */
        }
      }
      if (kind === 'hook-success') {
        const id = value;
        if (id === '' || state.config.hooks?.some((hook) => hook.id === id)) {
          state.hookStatuses ||= {};
          if (state.hookStatuses[id] !== 'error') state.hookStatuses[id] = 'success';
        }
        const statuses = Object.values(state.hookStatuses || {});
        state.status = statuses.includes('error') ? 'error' : statuses.includes('running') ? 'running' : 'success';
        page.publish();
        return;
      }
      const triggeringHook =
        typeof hookId === 'string'
          ? state.config.hooks?.find(
              (entry) => entry.id === hookId && entry.enabled
            )
          : undefined;
      if (kind === 'error' || kind === 'success') {
        const identity = page.scope();
        if (identity && !getGroupLocks().locked(identity.groupId)) {
          try {
            browserActivity().create(
              {
                title:
                  kind === 'error'
                    ? 'Page hook failed'
                    : 'Page hooks completed',
                message:
                  kind === 'error'
                    ? value.slice(0, 2000)
                    : 'The hooks finished for this page.',
                url: event.senderFrame.url,
              },
              {
                source: 'hook',
                ...identity,
                trigger: {
                  sourceId: identity.sourceId,
                  profile: page.profile,
                  origin: page.origin!,
                  pageURL: event.senderFrame.url,
                  hookId: triggeringHook?.id,
                  hookName:
                    triggeringHook?.name ||
                    (kind === 'error' ? 'Default hook' : 'Page hooks'),
                },
              },
              kind === 'success'
            );
          } catch {
            /* Hook status remains visible if activity storage is unavailable. */
          }
        }
      }
      if (typeof hookId === 'string' && (hookId === '' || triggeringHook)) {
        state.hookStatuses ||= {};
        if (kind === 'error') state.hookStatuses[hookId] = 'error';
        if (kind === 'running' && state.hookStatuses[hookId] !== 'error')
          state.hookStatuses[hookId] = 'running';
      }
      if (kind === 'idle') state.status = 'waiting';
      if (kind === 'error') state.status = 'error';
      if (kind === 'running' && state.status !== 'error')
        state.status = 'running';
      if (kind === 'success' && state.status !== 'error')
        state.status = 'success';
      state.logs.push({
        time: Date.now(),
        category: ['running', 'success', 'idle'].includes(String(kind)) ? 'execution' : 'output',
        level: kind === 'error' ? 'error' : 'info',
        message: value.slice(0, 2000),
        hookId: triggeringHook?.id,
        phase: ['before', 'after', 'css'].includes(String(phase))
          ? (phase as 'before' | 'after' | 'css')
          : undefined,
        runId: typeof runId === 'string' ? runId.slice(0, 200) : undefined,
      });
    } else return;
    state.logs = state.logs.slice(-100);
    page.publish();
  });
}
