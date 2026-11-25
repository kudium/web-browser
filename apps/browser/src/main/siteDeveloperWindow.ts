import { onDeveloperStateChanged } from './siteDeveloper';
import { registerAppThemeWindow } from './appTheme';
import path from 'path';
import fs from 'fs';
import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  screen,
  nativeTheme,
} from 'electron';
import type { IpcMainEvent, WebContents } from 'electron';
import type { BrowserCommand } from '../browser/contracts';
import type { SiteDeveloperWindowState } from '../browser/siteDeveloper';
import { isBrowserCommand } from './browserRequests';
import { resolveHtmlPath } from './util';
import { protectWindowNavigation } from './windowNavigation';
import { getBrowserPreferences, onBrowserPreferencesChanged } from './preferences';

const editorContents = new WeakSet<WebContents>();
const editorBindings = new WeakMap<
  WebContents,
  {
    host: WebContents;
    id: string;
    profile: string;
    origin: string;
    current: () => boolean;
  }
>();
export function getSiteDeveloperBinding(contents: WebContents) {
  return editorBindings.get(contents);
}
export function isSiteDeveloperEditor(contents: WebContents) {
  return editorContents.has(contents) && !contents.isDestroyed();
}

function editorSize() {
  const fallback = { width: 820, height: 740 };
  try {
    const saved = JSON.parse(
      fs.readFileSync(
        path.join(app.getPath('userData'), 'hook-window-size.json'),
        'utf8'
      )
    );
    if (!Number.isFinite(saved.width) || !Number.isFinite(saved.height))
      return fallback;
    const { workAreaSize } = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint()
    );
    return {
      width: Math.max(
        400,
        Math.min(Math.round(saved.width), workAreaSize.width)
      ),
      height: Math.max(
        480,
        Math.min(Math.round(saved.height), workAreaSize.height)
      ),
    };
  } catch {
    return fallback;
  }
}
function rememberEditorSize(editor: BrowserWindow) {
  if (editor.isDestroyed() || editor.isMinimized()) return;
  const { width, height } = editor.getNormalBounds();
  try {
    const file = path.join(app.getPath('userData'), 'hook-window-size.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ width, height }));
    fs.renameSync(`${file}.tmp`, file);
  } catch (error) {
    console.warn('Could not remember hook window size', error);
  }
}

/** Shared native window, material, sizing and lifecycle for every hook editor. */
export function createHookEditorWindow(
  title: string,
  themeOwner?: BrowserWindow
) {
  const editor = new BrowserWindow({
    title,
    ...(themeOwner && !themeOwner.isDestroyed() && { parent: themeOwner }),
    ...editorSize(),
    minWidth: 400,
    minHeight: 480,
    show: false,
    resizable: true,
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin' && {
      vibrancy: nativeTheme.prefersReducedTransparency
        ? undefined
        : ('sidebar' as const),
      visualEffectState: 'followWindow' as const,
    }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });
  registerAppThemeWindow(editor, { source: () => themeOwner });
  const updateMaterial = () => {
    if (process.platform === 'darwin' && !editor.isDestroyed())
      editor.setVibrancy(
        nativeTheme.prefersReducedTransparency ||
          nativeTheme.shouldUseHighContrastColors
          ? null
          : 'sidebar'
      );
  };
  if (process.platform === 'darwin') {
    nativeTheme.on('updated', updateMaterial);
    updateMaterial();
    editor.once('closed', () =>
      nativeTheme.removeListener('updated', updateMaterial)
    );
  }
  editorContents.add(editor.webContents);
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  editor.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => rememberEditorSize(editor), 250);
  });
  editor.on('close', () => rememberEditorSize(editor));
  editor.once('closed', () => clearTimeout(resizeTimer));
  return editor;
}

/** Editor actions and breadcrumb navigation are bound to its original tab/group. */
export function registerSiteDeveloperWindows(
  resolve: (id: string) =>
    | {
        contents?: WebContents;
        profile: string;
        groupId: string;
        state: SiteDeveloperWindowState;
      }
    | undefined,
  execute: (event: IpcMainEvent, request: BrowserCommand) => void,
  focus: (id: string, groupId: string, destination: 'group' | 'page') => void
) {
  const editors = new Map<
    string,
    { window: BrowserWindow; update: () => void }
  >();
  const stopRuntime = onDeveloperStateChanged(() => editors.forEach(editor => editor.update()));
  const stopPreferences = onBrowserPreferencesChanged(() => editors.forEach(editor => editor.update()));
  const open = (
    event: IpcMainEvent,
    id: string,
    origin: string,
    hookId?: string
  ) => {
    const target = resolve(id);
    if (!target || target.state.origin !== origin) return;
    const key = `${id}\n${origin}\n${hookId || ''}\n${target.profile}\n${
      target.contents?.id || 'saved'
    }`;
    const existing = editors.get(key);
    if (existing) {
      existing.window.show();
      existing.window.focus();
      return;
    }
    const editor = createHookEditorWindow(
      `${new URL(origin).host} — Developer`,
      BrowserWindow.fromWebContents(event.sender) || undefined
    );
    const current = () => {
      const latest = resolve(id);
      return latest &&
        (target.contents ? latest.contents === target.contents : true) &&
        latest.groupId === target.groupId &&
        latest.profile === target.profile &&
        latest.state.origin === origin
        ? latest.state
        : undefined;
    };
    editorBindings.set(editor.webContents, {
      host: event.sender,
      id,
      profile: target.profile,
      origin,
      current: () => !!current()?.available,
    });
    let previous = '';
    let lastState = target.state;
    const update = (force = false) => {
      if (editor.isDestroyed()) return;
      const latest = current();
      if (latest) lastState = latest;
      const preferences = getBrowserPreferences();
      const state: SiteDeveloperWindowState = {
        ...(latest || { ...lastState, available: false }),
        selectedHookId: hookId,
        material: {
          translucentChrome: preferences.translucentChrome,
          translucentAI: preferences.translucentAI,
        },
      };
      const serialized = JSON.stringify(state);
      if (force || serialized !== previous) {
        previous = serialized;
        editor.webContents.send('site-developer-state', state);
      }
    };
    const receive = (source: IpcMainEvent, request: unknown) => {
      if (
        source.sender !== editor.webContents ||
        source.senderFrame !== editor.webContents.mainFrame
      )
        return;
      if (request === 'focus-group' || request === 'focus-page') {
        focus(id, target.groupId, request === 'focus-group' ? 'group' : 'page');
        // Breadcrumbs switch context while keeping this editor and its draft open.
        if (!editor.isDestroyed()) editor.showInactive();
        return;
      }
      if (request === 'get') {
        update(true);
        return;
      }
      if (request === 'close') {
        editor.close();
        return;
      }
      if (request === 'expand') {
        if (editor.isMaximized()) editor.unmaximize();
        else editor.maximize();
        return;
      }
      if (
        !current() ||
        !isBrowserCommand(request) ||
        ![
          'set-site-developer',
          'run-site-hook',
          'ask-hook-ai',
          'clear-site-developer-logs',
          'reload',
          'activate-hook-notification',
          'revoke-hook-notification',
        ].includes(request.action)
      )
        return;
      if (request.action === 'ask-hook-ai') focus(id, target.groupId, 'page');
      // Ignore caller-supplied tab and URL, always use the main-owned binding.
      execute(event, {
        id,
        url: origin,
        action: request.action,
        ...(request.action === 'ask-hook-ai' ? { prompt: request.prompt } : {}),
        ...(request.action === 'run-site-hook' ? { hookId: request.hookId } : {}),
        ...(request.grantId ? { grantId: request.grantId } : {}),
        ...(request.action === 'set-site-developer'
          ? { developer: request.developer, run: request.run, hookId: request.hookId }
          : {}),
      });
      update(true);
    };
    ipcMain.on('site-developer-command', receive);
    editors.set(key, { window: editor, update });
    const documentURL = resolveHtmlPath('index.html', 'site-developer');
    protectWindowNavigation(editor.webContents, documentURL, (url) =>
      shell.openExternal(url)
    );
    editor.once('ready-to-show', () => {
      editor.show();
      update(true);
    });
    editor.once('closed', () => {
      ipcMain.removeListener('site-developer-command', receive);
      editors.delete(key);
    });
    editor.loadURL(documentURL).catch(() => editor.close());
  };
  return {
    open,
    update: () => editors.forEach((editor) => editor.update()),
    dispose: () => {
      stopRuntime();
      stopPreferences();
      editors.forEach((editor) => editor.window.destroy());
      editors.clear();
    },
  };
}
