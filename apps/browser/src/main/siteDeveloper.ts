import { app, ipcMain, WebContents } from 'electron';
import fs from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  emptyDeveloperConfig,
  hookMatchesPath,
  SiteDeveloperState,
} from '../browser/siteDeveloper';
import { hookNotifications, hookScriptHash } from './hookNotifications';
import { browserActivity } from './activity';
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
  let generation = 0;
  const owned = new Set();
  const stop = () => {
    generation++;
    for (const dispose of [...owned]) { try { dispose(); } catch (_) {} }
    owned.clear();
  };
  ipcRenderer.on('site-developer-stop', stop);
  addEventListener('pagehide', stop);
  const start = async (route = false) => {
    stop();
    const current = generation;
    const config = ipcRenderer.sendSync('site-developer-config');
    if (!config) return;
    const token = config.token;
    const active = () => current === generation;
    const send = (kind, value, detail = {}) => { if (active()) ipcRenderer.send('site-developer-event', { token, kind, value, ...detail }); };
    const format = value => { try { return typeof value === 'string' ? value : JSON.stringify(value); } catch (_) { return String(value); } };
    const hooks = [{...config, id: undefined, name: 'Default hook'}, ...(config.hooks || [])];
    let failed = false;
    const failedHooks = new Set();
    const run = async (hook, phase) => {
      if (!active() || !hook[phase].trim()) return;
      const detail = {hookId: hook.id || '', phase, runId: token + ':' + (hook.id || 'default') + ':' + phase};
      const controller = new AbortController();
      const cleanups = new Set();
      const dispose = () => {
        controller.abort();
        for (const cleanup of [...cleanups].reverse()) { try { cleanup(); } catch (_) {} }
        cleanups.clear(); owned.delete(dispose);
      };
      owned.add(dispose);
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
      const context = Object.freeze({url: location.href, document, notify, activity, notes,
        runId: token + ':' + (hook.id || 'default') + ':' + phase,
        signal: controller.signal, onCleanup,
        setInterval: (callback, delay, ...args) => { const id = setInterval(() => { guarded(callback, ...args); }, delay); onCleanup(() => clearInterval(id)); return id; },
        setTimeout: (callback, delay, ...args) => { let id; const cleanup = () => clearTimeout(id); id = setTimeout(() => { cleanups.delete(cleanup); guarded(callback, ...args); }, delay); onCleanup(cleanup); return id; },
        listen: (target, type, callback, options) => { const listener = event => guarded(callback, event); target.addEventListener(type, listener, options); onCleanup(() => target.removeEventListener(type, listener, options)); },
        get content() { return document.documentElement?.outerHTML || ''; }, page, log});
      send('running', hook.name + ' · ' + phase);
      let timer;
      try {
        const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
        const callback = new AsyncFunction('context', '"use strict"; const {url, document, content, page, log, notify, activity, notes, setInterval, setTimeout, onCleanup, signal, listen, runId} = context;\n' + hook[phase] + '\n//# sourceURL=kudium-hook-' + encodeURIComponent(hook.id || 'default') + '-' + phase + '.js');
        await Promise.race([callback(context), new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Hook stopped')), {once:true})), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Callback timed out after 10 seconds')), 10000); })]);
        if (alive()) log('completed');
      } catch (error) {
        if (alive()) { failed = true; failedHooks.add(hook.id); send('error', hook.name + ' · ' + phase + ': ' + String(error?.stack || error).slice(0, 1800), detail); }
        dispose();
      } finally { clearTimeout(timer); }
    };
    // Start before-load callbacks synchronously, before CSS IPC can yield to the page.
    const before = route ? Promise.resolve() : (async () => {
      for (const hook of hooks) await run(hook, 'before');
    })();
    for (const hook of hooks) {
      if (!active()) return;
      if (hook.css.trim()) {
        try { const key = await webFrame.insertCSS(hook.css); if (active()) owned.add(() => webFrame.removeInsertedCSS(key).catch(() => {})); else webFrame.removeInsertedCSS(key).catch(() => {}); }
        catch (error) { failed = true; failedHooks.add(hook.id); send('error', hook.name + ' · CSS: ' + String(error)); }
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
  profile: string;
  publish: () => void;
  states: Map<string, SiteDeveloperState>;
  token?: string;
  scriptHash?: string;
  outputs?: number[];
  origin?: string;
  controls: number[];
  events: number[];
  scope: () =>
    | { groupId: string; scope?: string; sourceId?: string }
    | undefined;
}
const pages = new Map<WebContents, ManagedPage>();
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
  const config =
    getSiteSettings(page?.profile || '', origin).developer ||
    emptyDeveloperConfig;
  const previous = page?.states.get(origin);
  return {
    config,
    revisions: getSiteSettings(page?.profile || '', origin).hookRevisions,
    status: previous?.status || 'waiting',
    logs: previous?.logs || [],
    notifications: page?.scope()
      ? hookNotifications().permissions({
          ...page.scope()!,
          profile: page.profile,
          origin,
          config,
        })
      : [],
  } as SiteDeveloperState;
}
export function resetDeveloperState(contents: WebContents, origin: string) {
  const page = pages.get(contents);
  if (!page) return;
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
  })
) {
  const publishState = () => {
    publish();
    developerChanges.emit('change', contents);
  };
  const existing = pages.get(contents);
  if (existing) {
    existing.publish = publishState;
    existing.scope = scope;
    return;
  }
  pages.set(contents, {
    profile,
    publish: publishState,
    states: new Map(),
    controls: [],
    events: [],
    scope,
  });
  contents.once('destroyed', () => pages.delete(contents));
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
      const config = getSiteSettings(changedProfile, origin).developer;
      if (!config?.enabled || hookScriptHash(config) !== page.scriptHash)
        resetDeveloperState(ownedContents, origin);
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
    const identity = page?.scope();
    const origin = siteOrigin(event.senderFrame?.url || '');
    const config =
      page && origin
        ? getSiteSettings(page.profile, origin).developer
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
    const now = Date.now();
    page.outputs = (page.outputs || []).filter((time) => now - time < 60000);
    if (page.outputs.length >= 10)
      throw new Error(
        'Hook output limit reached: ten items per minute per page.'
      );
    const hook =
      data.hookId === undefined
        ? undefined
        : config.hooks?.find(
            (candidate) => candidate.id === data.hookId && candidate.enabled
          );
    if (data.hookId !== undefined && !hook)
      throw new Error('Hook is no longer enabled.');
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
    if (data.kind === 'activity') {
      const input = validateActivity(data.input);
      // Hooks cannot link to arbitrary saved notes or read private data.
      if (input.noteId)
        throw new Error('Use notes.create to create a linked note.');
      page.outputs.push(now);
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
      page.outputs.push(now);
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
    const config = getSiteSettings(page.profile, origin).developer;
    if (!config?.enabled) throw new Error('Site hooks are disabled.');
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
    const config = getSiteSettings(page.profile, origin).developer;
    if (!config?.enabled) {
      event.returnValue = null;
      return;
    }
    page.token = randomUUID();
    page.scriptHash = hookScriptHash(config);
    page.origin = origin;
    const state = developerState(event.sender, origin);
    state.status = 'running';
    state.logs = [
      ...state.logs.slice(-99),
      { time: Date.now(), level: 'info', message: 'Page load started' },
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
      !getSiteSettings(page.profile, page.origin).developer?.enabled ||
      hookScriptHash(getSiteSettings(page.profile, page.origin).developer!) !==
        page.scriptHash ||
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
      if (kind === 'hook-success') {
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
      if (kind === 'idle') state.status = 'waiting';
      if (kind === 'error') state.status = 'error';
      if (kind === 'running' && state.status !== 'error')
        state.status = 'running';
      if (kind === 'success' && state.status !== 'error')
        state.status = 'success';
      state.logs.push({
        time: Date.now(),
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
