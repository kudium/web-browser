import { app, BrowserWindow, ipcMain, session } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  AIScriptRuntime,
  SCRIPT_RUNTIME_CALL,
  SCRIPT_RUNTIME_DOCUMENT,
  SCRIPT_RUNTIME_LOG,
  SCRIPT_RUNTIME_PARTITION,
  ScriptRuntimeWindow,
  scriptRuntimePreloadSource,
} from './aiScriptRuntime';

let preloadPath: string | undefined;
function scriptRuntimePreload() {
  if (!preloadPath) {
    preloadPath = path.join(app.getPath('userData'), 'script-runtime-preload.cjs');
    fs.mkdirSync(path.dirname(preloadPath), { recursive: true });
    fs.writeFileSync(preloadPath, scriptRuntimePreloadSource);
  }
  return preloadPath;
}

const prepared = new WeakSet<Electron.Session>();
/** An in-memory partition that cancels every request and grants no permission. */
function scriptRuntimeSession() {
  const runtime = session.fromPartition(SCRIPT_RUNTIME_PARTITION);
  if (!prepared.has(runtime)) {
    // Only the inline runtime document may load; every network scheme is cancelled.
    runtime.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) =>
      callback({ cancel: !details.url.startsWith('data:') })
    );
    runtime.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false)
    );
    runtime.setPermissionCheckHandler(() => false);
    prepared.add(runtime);
  }
  return runtime;
}

export function createScriptRuntimeWindow(): ScriptRuntimeWindow {
  scriptRuntimeSession();
  const window = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      devTools: false,
      images: false,
      webgl: false,
      spellcheck: false,
      backgroundThrottling: false,
      partition: SCRIPT_RUNTIME_PARTITION,
      preload: scriptRuntimePreload(),
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  return {
    id: window.webContents.id,
    load: () => window.loadURL(SCRIPT_RUNTIME_DOCUMENT),
    execute: (code, worldId) =>
      window.webContents.executeJavaScriptInIsolatedWorld(
        worldId,
        [{ code }],
        true
      ),
    destroy: () => {
      if (!window.isDestroyed()) window.destroy();
    },
    isDestroyed: () => window.isDestroyed(),
    onDestroyed: (listener) => window.once('closed', listener),
  };
}

let registered: AIScriptRuntime | undefined;
/** One runtime per browser; its IPC bridge answers only the live sandbox renderer. */
export function installScriptRuntime(): AIScriptRuntime {
  if (registered) return registered;
  const runtime = new AIScriptRuntime({ createWindow: createScriptRuntimeWindow });
  ipcMain.removeHandler(SCRIPT_RUNTIME_CALL);
  ipcMain.handle(SCRIPT_RUNTIME_CALL, (event, method, args) =>
    runtime.handleCall(event.sender.id, method, args)
  );
  ipcMain.on(SCRIPT_RUNTIME_LOG, (event, text) => {
    runtime.handleLog(event.sender.id, text);
  });
  registered = runtime;
  return runtime;
}
