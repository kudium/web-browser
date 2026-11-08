/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled
 * to `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { randomUUID } from 'crypto';
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  ipcMain,
  dialog,
  nativeTheme,
  shell,
} from 'electron';
import log from 'electron-log';
import fs from 'fs';
import {
  initializeLocalStorage,
  confirmLocalStorageLaunch,
} from './localStorage';
import { STORAGE_OS_IDENTITY } from './storageIdentity';
import { registerAccountSync } from './sync/register';
import { explainSecureStorage } from './storageWelcome';
import { version as projectVersion } from '../../package.json';
import { restrictPackagedDebugging } from './runtimeSecurity';
import { registerGroupLocks } from './groupLocks';
import { validateAdvanced } from '../browser/advancedPreferences';
import { configureDNS, registerAdvancedLifecycle } from './advancedPreferences';
import { getBrowserPreferences, registerPreferences } from './preferences';
import { browserUserAgent } from './browserIdentity';
import { registerPasswordManager } from './passwordManager';
import { registerAppUpdates, startAppUpdates } from './appUpdates';
import { registerHistory } from './history';
import MenuBuilder from './menu';
import { consolidateExtensionWarnings } from './extensionWarnings';
import { registerNativeUi } from './nativeUi';
import { registerDownloadLibrary, registerDownloadTracking } from './downloads';
import { registerBrowser } from './browser';
import { resolveHtmlPath } from './util';
import { protectWindowNavigation } from './windowNavigation';
import { NewWindowParams, View } from '../types';
import { MAIN_WINDOW } from '../utils/constant';
import { eventBus } from '../utils/EventBus';
import { registerWindowCommands } from './windowCommands';
import { registerTelemetry } from './telemetry';

app.setName(STORAGE_OS_IDENTITY);
app.setAboutPanelOptions({
  applicationName: 'Kudium Browser',
  applicationVersion: app.isPackaged ? app.getVersion() : projectVersion,
  version: app.isPackaged ? app.getVersion() : projectVersion,
  copyright: 'Copyright © 2026 Kudium',
  website: 'https://kudium.com',
});

restrictPackagedDebugging();
consolidateExtensionWarnings();

// Out-of-process frames can fall back to the app identity rather than the
// tab/session override. Set this before any renderer or session is created.
app.userAgentFallback = browserUserAgent(app.userAgentFallback);
try {
  const saved = JSON.parse(
    fs.readFileSync(
      path.join(app.getPath('userData'), 'browser-preferences.json'),
      'utf8'
    )
  );
  if (!validateAdvanced(saved.advanced || {}).hardwareAcceleration)
    app.disableHardwareAcceleration();
} catch {
  /* First launch uses default acceleration. */
}
registerAdvancedLifecycle();

const activeWindows: Partial<Record<View, BrowserWindow | null>> = {};
const externalLinks: { url: string; activeGroup: boolean }[] = [];
let tabRequestsReady = false;
const deliverExternalLinks = () => {
  const host = activeWindows.main;
  if (!tabRequestsReady || !host || host.isDestroyed()) return;
  while (externalLinks.length) {
    const { url, activeGroup } = externalLinks.shift()!;
    if (activeGroup) {
      host.webContents.send('browser-tab-request', {
        action: 'open-external',
        url,
      });
    } else {
      host.webContents.send('browser-tab-request', {
        action: 'create',
        app: {
          id: randomUUID(),
          sessionId: randomUUID(),
          name: new URL(url).hostname,
          url,
          icon: '',
        },
      });
    }
  }
};
if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}
const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

export const createNewWindow = async ({
  options = {},
  view = 'main',
  isChild = false,
  intent,
  preferencesSection,
}: NewWindowParams) => {
  await app.whenReady();
  if (view === 'add-app' && intent !== 'edit') {
    if (!activeWindows.main) await createNewWindow({ view: 'main' });
    const host = activeWindows.main;
    if (host) {
      host.show();
      host.focus();
      const command = () =>
        setTimeout(() => {
          if (!host.isDestroyed())
            host.webContents.send(
              'browser-shortcut',
              intent === 'new-session' ? 'new-session' : 'command'
            );
        }, 50);
      if (host.webContents.isLoadingMainFrame())
        host.webContents.once('did-finish-load', command);
      else command();
    }
    return;
  }
  if (activeWindows[view]) {
    const existing = activeWindows[view]!;
    existing.show();
    existing.focus();
    if (view === 'settings' && preferencesSection) {
      const selectSection = () =>
        existing.webContents.send('preferences-section', preferencesSection);
      if (existing.webContents.isLoadingMainFrame())
        existing.webContents.once('did-finish-load', selectSection);
      else selectSection();
    }
    return;
  }

  const parentWindow = isChild && activeWindows[MAIN_WINDOW.view];

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');
  const getAssetPath = (...paths: string[]): string =>
    path.join(RESOURCES_PATH, ...paths);

  activeWindows[view] = new BrowserWindow({
    show: false,
    title: 'Kudium Browser',
    width: 1160,
    height: 950,
    center: true,
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hiddenInset' as const,
      ...(view === 'main' && { trafficLightPosition: { x: 12, y: 13 } }),
      vibrancy: nativeTheme.prefersReducedTransparency
        ? undefined
        : ('sidebar' as const),
      visualEffectState: 'followWindow' as const,
    }),
    ...(parentWindow && { parent: parentWindow }),
    icon: getAssetPath('app-icon.png'),
    webPreferences: {
      spellcheck: true,
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
    ...options,
  });

  const newWindow = activeWindows[view]!;
  if (view === 'main') {
    // Paint a visible, isolated welcome surface before any Keychain access.
    await newWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        '<html><body style="margin:0;background:#f5f5f7;color:#1d1d1f;font:16px -apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;height:100vh"><div style="text-align:center"><h1 style="font-size:28px">Welcome to Kudium</h1><p>Your space to browse.</p></div></body></html>'
      )}`
    );
    newWindow.show();
    if (await explainSecureStorage(newWindow)) await initializeLocalStorage();
    if (newWindow.isDestroyed()) return;
  }
  if (process.platform === 'darwin')
    app.dock?.setIcon(getAssetPath('app-icon.png'));
  if (view === 'downloads')
    newWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !(input.meta || input.control)) return;
      if (input.key.toLowerCase() === 'w') {
        event.preventDefault();
        newWindow.close();
      }
      if (input.key.toLowerCase() === 'f') {
        event.preventDefault();
        newWindow.webContents.send('browser-shortcut', 'find');
      }
    });
  if (view === 'main') {
    tabRequestsReady = false;
    newWindow.webContents.on('did-start-loading', () => {
      tabRequestsReady = false;
    });
    registerBrowser(newWindow);
  }
  if (process.platform === 'darwin') {
    const updateMaterial = () =>
      newWindow.setVibrancy(
        nativeTheme.prefersReducedTransparency ||
          nativeTheme.shouldUseHighContrastColors
          ? null
          : 'sidebar'
      );
    nativeTheme.on('updated', updateMaterial);
    updateMaterial();
    newWindow.on('closed', () =>
      nativeTheme.removeListener('updated', updateMaterial)
    );
  }

  const documentURL = resolveHtmlPath('index.html', view);
  const initialURL = preferencesSection
    ? `${documentURL}#${preferencesSection}`
    : documentURL;
  protectWindowNavigation(newWindow.webContents, documentURL, (url) =>
    shell.openExternal(url)
  );
  newWindow.loadURL(initialURL);

  newWindow.on('ready-to-show', () => {
    if (view === 'main') confirmLocalStorageLaunch();
    if (!activeWindows[view]) {
      throw new Error(`Window "${view}" is not defined`);
    }
    if (process.env.START_MINIMIZED) {
      activeWindows[view]!.minimize();
    } else {
      activeWindows[view]!.show();
    }
  });

  newWindow.on('closed', () => {
    activeWindows[view] = null;
  });

  if (!parentWindow && view === 'main') {
    const menuBuilder = new MenuBuilder({
      mainWindow: newWindow,
      createNewWindow,
    });
    menuBuilder.buildMenu();
    startAppUpdates();
  }
};

const openExternalLink = (value: string) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return;
    externalLinks.push({ url: value, activeGroup: true });
    if (app.isReady()) {
      createNewWindow(MAIN_WINDOW)
        .then(() => {
          const host = activeWindows.main;
          if (host?.isMinimized()) host.restore();
          host?.show();
          host?.focus();
          deliverExternalLinks();
        })
        .catch(() => log.error('Unable to open external link window'));
    }
  } catch {
    /* Ignore malformed external URLs. */
  }
};
ipcMain.on('browser-tab-requests-ready', (event) => {
  const host = activeWindows.main;
  if (
    !host ||
    event.sender !== host.webContents ||
    event.senderFrame !== host.webContents.mainFrame
  )
    return;
  tabRequestsReady = true;
  deliverExternalLinks();
});
app.on('open-url', (event, url) => {
  event.preventDefault();
  openExternalLink(url);
});
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    argv
      .filter((value) => /^https?:\/\//i.test(value))
      .forEach(openExternalLink);
    const host = activeWindows.main;
    if (host?.isMinimized()) host.restore();
    host?.show();
    host?.focus();
  });
  process.argv
    .filter((value) => /^https?:\/\//i.test(value))
    .forEach(openExternalLink);
}

registerHistory((contents) =>
  Object.values(activeWindows).some(
    (window) => window?.webContents === contents
  )
);
registerDownloadTracking();
registerDownloadLibrary(
  () => {
    const host = activeWindows.main;
    if (host && !host.isDestroyed()) {
      host.show();
      host.focus();
      host.webContents.send('browser-shortcut', 'downloads');
    }
  },
  (contents) =>
    Object.values(activeWindows).some(
      (window) => window?.webContents === contents
    )
);
registerPreferences(
  (preferencesSection) => {
    createNewWindow({
      view: 'settings',
      preferencesSection,
      options: { width: 1080, height: 800, minWidth: 760, minHeight: 600 },
    });
  },
  (contents) =>
    Object.values(activeWindows).some(
      (window) => window?.webContents === contents
    ),
  (contents) => activeWindows.settings?.webContents === contents
);

registerAppUpdates((contents) =>
  activeWindows.settings?.webContents === contents ||
  activeWindows.main?.webContents === contents
);

registerPasswordManager(
  (contents) =>
    activeWindows.settings?.webContents === contents ||
    activeWindows.main?.webContents === contents
);

registerNativeUi((contents) =>
  Object.values(activeWindows).some(
    (window) => window?.webContents === contents
  )
);

/** Window to Window communication */
eventBus.registerOnMain(ipcMain, activeWindows);

registerAccountSync(
  (window) =>
    window === activeWindows.main || window === activeWindows.settings,
  (window) => window === activeWindows.main
);
registerWindowCommands(ipcMain, activeWindows, createNewWindow);
registerTelemetry((contents) =>
  Object.values(activeWindows).some(
    (window) => window?.webContents === contents
  )
);

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    // If using method B for the session you should first construct the BrowserWindow
    // const filter = { urls: ['*://*.google.com/*'] };
    // session.defaultSession.webRequest.onBeforeSendHeaders(
    //   filter,
    //   (details, callback) => {
    //     // details.requestHeaders['Origin'] = null;
    //     // details.headers['Origin'] = null;
    //     // details.headers['Access-Control-Allow-Origin'] = [
    //     //   'capacitor-electron://-',
    //     // ];
    //     callback?.({ requestHeaders: details.requestHeaders });
    //   }
    // );

    // createNewWindow(ADD_APP_WINDOW);
    if (!hasInstanceLock) return;
    const { advanced } = getBrowserPreferences();
    configureDNS(advanced);
    if (advanced.startupMode === 'pages')
      externalLinks.push(
        ...advanced.startupPages.map((url) => ({ url, activeGroup: false }))
      );
    const mainWindowConfig = MAIN_WINDOW;
    createNewWindow(mainWindowConfig);
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (activeWindows[mainWindowConfig.view] === null)
        createNewWindow(mainWindowConfig);
    });
  })
  .catch((error) => {
    log.error('Browser startup failed', error);
    dialog.showErrorBox(
      'Kudium Browser could not start',
      error instanceof Error ? error.message : String(error)
    );
  });

registerGroupLocks(
  (contents) =>
    activeWindows.main?.webContents === contents ||
    activeWindows.settings?.webContents === contents ||
    activeWindows['add-app']?.webContents === contents
);
