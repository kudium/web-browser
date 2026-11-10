import { app, ipcMain, WebContents } from 'electron';
import fs from 'fs';
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
import { getSiteSettings, siteOrigin } from './siteSettings';

// No bridge is exposed to website scripts. Hooks run in the sandboxed preload's
// isolated DOM world, with no Node.js or privileged Kudium Browser APIs.
export const developerPreloadSource = String.raw`
const { ipcRenderer, webFrame } = require('electron');
if (window === window.top) {
  const config = ipcRenderer.sendSync('site-developer-config');
  if (config) {
    const token = config.token;
    const send = (kind, value) => ipcRenderer.send('site-developer-event', {token, kind, value});
    const format = value => {
      try { return typeof value === 'string' ? value : JSON.stringify(value); }
      catch (_) { return String(value); }
    };
    const log = (...values) => send('log', values.map(format).join(' ').slice(0, 2000));
    const page = Object.freeze(Object.fromEntries(['reload','back','forward','stop'].map(action => [action, () => send('control', action)])));
    const notify = (key, text) => ipcRenderer.invoke('site-developer-notify', {token, key, text});
    const activity = Object.freeze({create: input => ipcRenderer.invoke('site-developer-output', {token, kind: 'activity', input})});
    const notes = Object.freeze({create: input => ipcRenderer.invoke('site-developer-output', {token, kind: 'note', input})});
    const context = Object.freeze({url: location.href, document, notify, activity, notes,
      get content() { return document.documentElement?.outerHTML || ''; }, page, log});
    let failed = false;
    const run = async (phase, source) => {
      if (!source.trim()) return;
      send('running', phase);
      try {
        const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
        const callback = new AsyncFunction('context', '"use strict"; const {url, document, content, page, log, notify, activity, notes} = context;\n' + source);
        let timer;
        try { await Promise.race([callback(context), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Callback timed out after 10 seconds')), 10000); })]); }
        finally { clearTimeout(timer); }
        log(phase + ' completed');
      } catch (error) {
        failed = true;
        send('error', phase + ': ' + String(error?.stack || error).slice(0, 2000));
      }
    };
    const hooks = config.hooks || [];
    const before = (async () => {
      await run('Before load', config.before);
      for (const hook of hooks) await run(hook.name + ' · Before load', hook.before);
    })();
    if (config.css.trim()) {
      try { webFrame.insertCSS(config.css); log('CSS applied'); }
      catch (error) { failed = true; send('error', 'CSS: ' + String(error)); }
    }
    for (const hook of hooks) {
      if (hook.css.trim()) {
        try { webFrame.insertCSS(hook.css); log(hook.name + ' · CSS applied'); }
        catch (error) { failed = true; send('error', hook.name + ': ' + String(error)); }
      }
    }
    addEventListener('load', async () => {
      await before;
      await run('After load', config.after);
      for (const hook of hooks) await run(hook.name + ' · After load', hook.after);
      if (!failed) send('success', 'Hooks completed');
    }, {once:true});
  }
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
  scope: () => { groupId: string; scope?: string } | undefined;
}
const pages = new Map<WebContents, ManagedPage>();
let listening = false;
export function developerState(contents: WebContents, origin: string) {
  const page = pages.get(contents);
  const config =
    getSiteSettings(page?.profile || '', origin).developer ||
    emptyDeveloperConfig;
  const previous = page?.states.get(origin);
  return {
    config,
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
  scope: () => { groupId: string; scope?: string } | undefined = () => ({
    groupId: profile,
  })
) {
  const existing = pages.get(contents);
  if (existing) {
    existing.publish = publish;
    existing.scope = scope;
    return;
  }
  pages.set(contents, {
    profile,
    publish,
    states: new Map(),
    controls: [],
    events: [],
    scope,
  });
  contents.once('destroyed', () => pages.delete(contents));
  if (listening) return;
  listening = true;
  ipcMain.handle('site-developer-output', (event, request: unknown) => {
    const page = pages.get(event.sender);
    const data = request as {
      token?: unknown;
      kind?: unknown;
      input?: unknown;
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
    const context = { source: 'hook' as const, ...identity };
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
    const { token, kind, value } = message as Record<string, unknown>;
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
    } else if (['log', 'error', 'running', 'success'].includes(String(kind))) {
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
              { source: 'hook', ...identity },
              kind === 'success'
            );
          } catch {
            /* Hook status remains visible if activity storage is unavailable. */
          }
        }
      }
      if (kind === 'error') state.status = 'error';
      if (kind === 'running' && state.status !== 'error')
        state.status = 'running';
      if (kind === 'success' && state.status !== 'error')
        state.status = 'success';
      state.logs.push({
        time: Date.now(),
        level: kind === 'error' ? 'error' : 'info',
        message: value.slice(0, 2000),
      });
    } else return;
    state.logs = state.logs.slice(-100);
    page.publish();
  });
}
