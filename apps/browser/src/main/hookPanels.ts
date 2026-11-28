import {
  app,
  clipboard,
  BrowserWindow,
  ipcMain,
  session,
  WebContentsView,
  type WebContents,
} from 'electron';
import { randomUUID, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  validateHookPanel,
  hookPanelImageAllowed,
  panelJSON,
  type HookPanelOutput,
} from '../browser/hookPanels';
import { getHookTheme } from './hookTheme';
import { onAppThemeChanged } from './appTheme';
import { sidebarPanelsFor } from './sidebarPanels';
import { attachPanelContextMenu } from './shellContextMenu';
import { openWindowLink } from './windowNavigation';
import { hookPanelDocument, hookPanelPresentation } from './hookPanelDocument';

interface Binding {
  source: WebContents;
  owner: BrowserWindow;
  groupId: string;
  sourceId?: string;
  token: string;
  hookId: string;
  hookName: string;
  authorized: () => boolean;
}
interface Entry {
  binding: Binding;
  output: HookPanelOutput;
  id: string;
  view?: WebContentsView;
}
const entries = new Map<string, Entry>();
const views = new Map<WebContents, Entry>();
const pending = new Map<
  string,
  {
    entry: Entry;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
let listening = false;
let preload: string;
const identity = (b: Binding, id: string) =>
  `hook-${createHash('sha256')
    .update(JSON.stringify([b.owner.id, b.groupId, b.source.id, b.hookId, id]))
    .digest('hex')
    .slice(0, 40)}`;
const available = (e: Entry) =>
  entries.get(e.id) === e &&
  !e.binding.owner.isDestroyed() &&
  !e.binding.source.isDestroyed() &&
  e.binding.authorized() &&
  (!(
    sidebarPanelsFor(e.binding.owner).targetGroup ||
    sidebarPanelsFor(e.binding.owner).activeGroup
  ) ||
    (sidebarPanelsFor(e.binding.owner).targetGroup ||
      sidebarPanelsFor(e.binding.owner).activeGroup) === e.binding.groupId);
function initialize() {
  if (listening) return;
  listening = true;
  preload = path.join(app.getPath('userData'), 'hook-panel-preload.cjs');
  fs.writeFileSync(
    preload,
    `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('kudiumHookPanel',{invoke:(action,payload=null)=>ipcRenderer.invoke('hook-panel-event',{kind:'action',action,payload}),openLink:url=>ipcRenderer.invoke('hook-panel-event',{kind:'link',url}),onThemeChanged:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('hook-panel-theme',listener);return()=>ipcRenderer.removeListener('hook-panel-theme',listener)},onUpdate:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('hook-panel-update',listener);return()=>ipcRenderer.removeListener('hook-panel-update',listener)}});`,
  );
  ipcMain.handle('hook-panel-event', async (event, request) => {
    const e = views.get(event.sender);
    if (!e || event.senderFrame !== event.sender.mainFrame || !available(e))
      throw new Error(
        'This hook panel is no longer available in the selected group.',
      );
    panelJSON(request);
    if (request?.kind === 'link') {
      if (typeof request.url !== 'string' || !/^https?:\/\//i.test(request.url))
        throw new Error('Only website links may open from a hook panel.');
      openWindowLink(
        e.binding.owner.webContents,
        request.url,
        e.binding.groupId,
      );
      return;
    }
    if (
      request?.kind !== 'action' ||
      !e.output.actions?.some((a) => a.id === request.action)
    )
      throw new Error('This panel action is not declared.');
    if (
      pending.size >= 20 ||
      [...pending.values()].filter((p) => p.entry === e).length >= 3
    )
      throw new Error('Wait for the running panel action.');
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Panel action timed out.'));
      }, 10000);
      pending.set(requestId, { entry: e, resolve, reject, timer });
      e.binding.source.send('site-developer-panel-action', {
        token: e.binding.token,
        hookId: e.binding.hookId,
        action: request.action,
        payload: request.payload,
        requestId,
      });
    });
  });
}
export function respondHookPanel(
  source: WebContents,
  token: unknown,
  hookId: unknown,
  response: any,
) {
  const p = pending.get(response?.requestId);
  if (
    !p ||
    p.entry.binding.source !== source ||
    p.entry.binding.token !== token ||
    p.entry.binding.hookId !== (hookId || '') ||
    !available(p.entry)
  )
    throw new Error('Invalid or expired panel action response.');
  panelJSON(response);
  pending.delete(response.requestId);
  clearTimeout(p.timer);
  if (typeof response.error === 'string')
    p.reject(new Error(response.error.slice(0, 2000)));
  else p.resolve(response.value ?? null);
}
function removeEntry(e: Entry) {
  for (const [key, p] of pending)
    if (p.entry === e) {
      clearTimeout(p.timer);
      p.reject(new Error('The hook stopped.'));
      pending.delete(key);
    }
  if (!e.binding.owner.isDestroyed())
    sidebarPanelsFor(e.binding.owner).remove(e.id);
  if (e.view) views.delete(e.view.webContents);
  entries.delete(e.id);
}
export function removeHookPanels(source: WebContents, hookId?: string) {
  for (const e of entries.values())
    if (
      e.binding.source === source &&
      (hookId === undefined || hookId === e.binding.hookId)
    )
      removeEntry(e);
}
export function closeHookPanel(binding: Binding, id: unknown) {
  if (typeof id !== 'string') throw new Error('Provide the panel id.');
  const e = entries.get(identity(binding, id));
  if (e) removeEntry(e);
}
export function showHookPanel(binding: Binding, input: unknown) {
  initialize();
  const output = validateHookPanel(input);
  if (!binding.authorized())
    throw new Error('Hook permission is no longer available.');
  for (const e of entries.values())
    if (
      e.binding.source === binding.source &&
      (!e.binding.authorized() ||
        e.binding.owner !== binding.owner ||
        e.binding.groupId !== binding.groupId)
    )
      removeEntry(e);
  const id = identity(binding, output.id);
  if (
    !entries.has(id) &&
    [...entries.values()].filter((e) => e.binding.source === binding.source)
      .length >= 10
  )
    throw new Error('A page may publish up to ten hook panels.');
  const e = entries.get(id) || { id, binding, output };
  e.binding = binding;
  e.output = output;
  entries.set(id, e);
  const c = output.content;
  const key =
    c.type === 'html'
      ? JSON.stringify([c.type, c.html, c.css, c.script])
      : 'structured';
  sidebarPanelsFor(binding.owner).register({
    info: {
      id,
      title: output.title,
      detail: `${binding.hookName} · ${binding.source.getTitle()}`,
      kind: 'hook',
      key: `hook:${binding.groupId}:${binding.sourceId || binding.source.id}:${binding.hookId}:${output.id}`,
    },
    manage: binding.sourceId ? () => import('./hookMarketplace').then(({ manageInstalledPanelHook }) => manageInstalledPanelHook(binding.owner, binding.sourceId!, binding.hookId)) : undefined,
    groupId: binding.groupId,
    contentKey: key,
    available: () => available(e),
    createView: () => {
      const isolated = session.fromPartition(`hook-panel-${randomUUID()}`, {
        cache: false,
      });
      isolated.setPermissionCheckHandler(() => false);
      isolated.setPermissionRequestHandler((_c, _p, answer) => answer(false));
      const document = hookPanelDocument(e.output);
      const url =
        'data:text/html;charset=utf-8,' + encodeURIComponent(document);
      isolated.webRequest.onBeforeRequest((request, answer) =>
        answer({
          cancel: !available(e) || (request.url !== url && !(request.resourceType === 'image' && (request.url.startsWith('data:image/') || hookPanelImageAllowed(e.output.content, request.url)))),
        }),
      );
      // Explicit image access never borrows page/profile credentials.
      isolated.webRequest.onBeforeSendHeaders((request, answer) => {
        const headers = { ...request.requestHeaders };
        for (const name of Object.keys(headers))
          if (/^(cookie|authorization|proxy-authorization|referer|origin)$/i.test(name)) delete headers[name];
        answer({ requestHeaders: headers });
      });
      isolated.webRequest.onHeadersReceived((response, answer) => {
        const headers = { ...response.responseHeaders };
        for (const name of Object.keys(headers))
          if (/^set-cookie$/i.test(name)) delete headers[name];
        answer({ responseHeaders: headers });
      });
      isolated.on('will-download', (event) => event.preventDefault());
      const view = new WebContentsView({
        webPreferences: {
          session: isolated,
          preload,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          navigateOnDragDrop: false,
        },
      });
      if (e.view) views.delete(e.view.webContents);
      e.view = view;
      views.set(view.webContents, e);
      const contents = view.webContents;
      contents.once('destroyed', () => views.delete(contents));
      view.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
      const link = (destination: string) => {
        if (available(e) && /^https?:\/\//i.test(destination))
          openWindowLink(
            binding.owner.webContents,
            destination,
            binding.groupId,
          );
      };
      attachPanelContextMenu(view.webContents, link, () => available(e), (params) => {
        if (params.isEditable) return [];
        const content = e.output.content;
        const text = content.type === 'json' ? JSON.stringify(content.value, null, 2)
          : content.type === 'table' ? [content.columns, ...content.rows].map(row => row.join('\t')).join('\n')
          : 'text' in content ? content.text : undefined;
        return text === undefined ? [] : [{
          label: content.type === 'json' ? 'Copy JSON' : content.type === 'table' ? 'Copy table' : 'Copy panel content',
          click: () => { if (available(e)) clipboard.writeText(text); },
        }];
      });
      view.webContents.setWindowOpenHandler(({ url: destination }) => {
        link(destination);
        return { action: 'deny' };
      });
      view.webContents.on('will-navigate', (event, destination) => {
        event.preventDefault();
        link(destination);
      });
      view.webContents.on('will-redirect', (event) => event.preventDefault());
      const publishTheme = () => {
        if (!view.webContents.isDestroyed()) view.webContents.send('hook-panel-theme', getHookTheme(binding.owner));
      };
      const stopTheme = onAppThemeChanged(binding.owner, publishTheme);
      view.webContents.once('destroyed', stopTheme);
      view.webContents.on('did-finish-load', publishTheme);
      view.webContents.on('did-finish-load', () =>
        view.webContents.send(
          'hook-panel-update',
          hookPanelPresentation(e.output),
        ),
      );
      void view.webContents.loadURL(url).catch(() => {});
      return view;
    },
  });
  if (e.view && !e.view.webContents.isDestroyed())
    e.view.webContents.send('hook-panel-update', hookPanelPresentation(output));
  if (output.reveal) sidebarPanelsFor(binding.owner).activate(id, true, binding.groupId);
  return { id: output.id };
}
