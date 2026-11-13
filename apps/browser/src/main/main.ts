import { registerAppThemeWindow, refreshAppThemes } from './appTheme';
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
  screen,
} from 'electron';
import log from 'electron-log';
import fs from 'fs';
import {
  registerHookMarketplace,
  hookDestinationsFor,
  queueHookInstallLink,
  deliverHookInstallLinks,
} from './hookMarketplace';
import { onWindowClosed } from './windowLifecycle';
import {
  initializeLocalStorage,
  localStorageStatus,
  confirmLocalStorageLaunch,
} from './localStorage';
import { STORAGE_OS_IDENTITY } from './storageIdentity';
import { registerAccountSync } from './sync/register';
import { explainSecureStorage } from './storageWelcome';
import { rememberWindowSize, restoreWindowSize } from './windowSize';
import { version as projectVersion } from '../../package.json';
import { restrictPackagedDebugging } from './runtimeSecurity';
import { registerGroupLocks } from './groupLocks';
import { validateAdvanced } from '../browser/advancedPreferences';
import { configureDNS, registerAdvancedLifecycle } from './advancedPreferences';
import { getBrowserPreferences, registerPreferences } from './preferences';
import { browserUserAgent } from './browserIdentity';
import { registerPasswordManager } from './passwordManager';
import { isSiteDeveloperEditor } from './siteDeveloperWindow';
import { registerHookLanguage } from './hookLanguage';
import { registerActivity } from './activity';
import { registerBrowserMigration } from './browserMigration';
import { registerAppUpdates, startAppUpdates } from './appUpdates';
import { registerSystemSpaceRetention } from './systemSpaceRetention';
import { registerHistory } from './history';
import MenuBuilder from './menu';
import { consolidateExtensionWarnings } from './extensionWarnings';
import { registerNativeUi } from './nativeUi';
import { registerDownloadLibrary, registerDownloadTracking } from './downloads';
import { registerBrowser } from './browser';
import { registerBrowserWindows } from './browserWindows';
import { resolveHtmlPath } from './util';
import { protectWindowNavigation } from './windowNavigation';
import { NewWindowParams, View } from '../types';
import { MAIN_WINDOW } from '../utils/constant';
import { eventBus } from '../utils/EventBus';
import { registerWindowCommands } from './windowCommands';
import { registerTelemetry } from './telemetry';

app.setName(STORAGE_OS_IDENTITY);
if (!app.isPackaged && process.env.KUDIUM_DUMMY) {
  app.setPath(
    'userData',
    path.join(app.getPath('appData'), 'Kudium Browser Demo')
  );
}

app.setAboutPanelOptions({
  applicationName: 'Kudium Browser',
  applicationVersion: app.isPackaged ? app.getVersion() : projectVersion,
  version: '',
  copyright: `Copyright © ${new Date().getFullYear()} Kudium LTD`,
  website: 'https://browser.kudium.com',
  iconPath: app.isPackaged
    ? path.join(process.resourcesPath, 'assets/app-icon.png')
    : path.join(__dirname, '../../assets/app-icon.png'),
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

const activeWindows: Partial<Record<string, BrowserWindow | null>> = {};
const externalLinks: { url: string; activeGroup: boolean }[] = [];
let tabRequestsReady = false;
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
});
let createAdditionalWindow: () => Promise<BrowserWindow>;
const browserWindows = registerBrowserWindows(() => createAdditionalWindow());
const isBrowserChrome = (contents: import('electron').WebContents) =>
  Object.entries(activeWindows).some(
    ([key, window]) =>
      (key === 'main' || key.startsWith('browser-')) &&
      window?.webContents === contents
  );
let finishStorageStartup: () => void;
const storageReady = new Promise<void>((resolve) => {
  finishStorageStartup = resolve;
});
let storageStartup: Promise<void> | undefined;
const startStorage = (window: BrowserWindow) => {
  if (!storageStartup) {
    storageStartup = (async () => {
      try {
        if (await explainSecureStorage(window)) await initializeLocalStorage();
        if (!window.isDestroyed()) confirmLocalStorageLaunch();
      } catch (error) {
        log.error(
          'Secure storage startup failed; browsing remains available.',
          error
        );
      } finally {
        finishStorageStartup();
      }
    })();
  }
};
ipcMain.handle('browser-storage-ready', async (event) => {
  if (
    event.senderFrame !== event.sender.mainFrame ||
    !Object.values(activeWindows).some(
      (window) => window?.webContents === event.sender
    )
  )
    throw new Error('Untrusted storage request.');
  await storageReady;
  return localStorageStatus();
});
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
  additional = false,
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
    return undefined;
  }
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const preferencesOwner =
    view === 'settings' &&
    Object.entries(activeWindows).find(
      ([key, window]) =>
        (key === 'main' || key.startsWith('browser-')) &&
        window === focusedWindow
    )?.[1];
  const parentWindow =
    view === 'settings'
      ? preferencesOwner ||
        activeWindows.settings?.getParentWindow() ||
        activeWindows[MAIN_WINDOW.view]
      : isChild && activeWindows[MAIN_WINDOW.view];

  if (activeWindows[view] && !additional) {
    const existing = activeWindows[view]!;
    if (view === 'settings' && parentWindow && !parentWindow.isDestroyed()) {
      existing.setParentWindow(parentWindow);
      refreshAppThemes();
      if (parentWindow.isMinimized()) parentWindow.restore();
    }
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    if (view === 'settings' && preferencesSection) {
      const selectSection = () =>
        existing.webContents.send('preferences-section', preferencesSection);
      if (existing.webContents.isLoadingMainFrame())
        existing.webContents.once('did-finish-load', selectSection);
      else selectSection();
    }
    return undefined;
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');
  const getAssetPath = (...paths: string[]): string =>
    path.join(RESOURCES_PATH, ...paths);

  const sizeFile = path.join(
    app.getPath('userData'),
    'browser-window-size.json'
  );
  const savedSize =
    view === 'main' && !additional
      ? restoreWindowSize(sizeFile, screen.getPrimaryDisplay().workAreaSize)
      : undefined;

  const newWindow = new BrowserWindow({
    show: false,
    title: 'Kudium Browser',
    width: savedSize?.width ?? 1160,
    height: savedSize?.height ?? 950,
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

  registerAppThemeWindow(newWindow, {
    producer: view === 'main',
    source: () =>
      newWindow.getParentWindow() || activeWindows.main || undefined,
  });
  if (view === 'settings') {
    registerHookMarketplace(newWindow, () => {
      const owner = newWindow.getParentWindow();
      return owner && !owner.isDestroyed()
        ? hookDestinationsFor(owner.webContents)
        : [];
    });
  }
  const windowKey = additional ? `browser-${newWindow.id}` : view;
  activeWindows[windowKey] = newWindow;
  if (savedSize) rememberWindowSize(newWindow, sizeFile);
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
  if (view === 'main' && !additional) {
    browserWindows.register(newWindow);
    tabRequestsReady = false;
    newWindow.webContents.on('did-start-loading', () => {
      tabRequestsReady = false;
    });
    registerBrowser(newWindow, storageReady);
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
    onWindowClosed(newWindow, () =>
      nativeTheme.removeListener('updated', updateMaterial)
    );
  }

  const documentURL = resolveHtmlPath('index.html', view);
  const initialURL = preferencesSection
    ? `${documentURL}#${preferencesSection}`
    : documentURL;
  protectWindowNavigation(
    newWindow.webContents,
    documentURL,
    (url) => shell.openExternal(url),
    view === 'main'
  );
  newWindow.once('ready-to-show', () => {
    if (!activeWindows[windowKey]) {
      throw new Error(`Window "${view}" is not defined`);
    }
    if (savedSize?.maximized) newWindow.maximize();
    if (process.env.START_MINIMIZED) {
      activeWindows[windowKey]!.minimize();
    } else {
      activeWindows[windowKey]!.show();
    }
    // Let the real browser paint before prompting for or accessing Keychain.
    if (view === 'main' && !additional) startStorage(newWindow);
  });

  newWindow.loadURL(initialURL);

  onWindowClosed(newWindow, () => {
    activeWindows[windowKey] = null;
  });

  if (view === 'main' && !additional) {
    newWindow.on('close', (event) => {
      if (!quitting && browserWindows.hasOtherWindows(newWindow)) {
        event.preventDefault();
        newWindow.hide();
      }
    });
  }
  if (!parentWindow && view === 'main') {
    const menuBuilder = new MenuBuilder({
      mainWindow: newWindow,
      createNewWindow,
    });
    menuBuilder.buildMenu();
    startAppUpdates();
  }
  return newWindow;
};

createAdditionalWindow = async () => {
  const created = await createNewWindow({ view: 'main', additional: true });
  if (!created) throw new Error('Could not create a browser window.');
  return created;
};

const openExternalLink = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol === 'kudium:' && url.hostname === 'install-hook')
      queueHookInstallLink(value);
    else if (['http:', 'https:'].includes(url.protocol))
      externalLinks.push({ url: value, activeGroup: true });
    else return;
    if (app.isReady()) {
      createNewWindow(MAIN_WINDOW)
        .then(() => {
          const host = activeWindows.main;
          if (host?.isMinimized()) host.restore();
          host?.show();
          host?.focus();
          deliverExternalLinks();
          if (host) deliverHookInstallLinks(host);
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
if (app.isPackaged) app.setAsDefaultProtocolClient('kudium');
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    argv
      .filter((value) => /^(https?:\/\/|kudium:\/\/install-hook)/i.test(value))
      .forEach(openExternalLink);
    const host = activeWindows.main;
    if (host?.isMinimized()) host.restore();
    host?.show();
    host?.focus();
  });
  process.argv
    .filter((value) => /^(https?:\/\/|kudium:\/\/install-hook)/i.test(value))
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

registerSystemSpaceRetention();

registerAppUpdates(
  (contents) =>
    activeWindows.settings?.webContents === contents ||
    isBrowserChrome(contents)
);

registerBrowserMigration(
  (contents) =>
    activeWindows.settings?.webContents === contents ||
    isBrowserChrome(contents)
);
registerActivity((contents) => isBrowserChrome(contents));
registerHookLanguage(
  (contents) => isBrowserChrome(contents) || isSiteDeveloperEditor(contents)
);
registerPasswordManager(
  (contents) =>
    activeWindows.settings?.webContents === contents ||
    isBrowserChrome(contents)
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
    await createNewWindow(mainWindowConfig);
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
    isBrowserChrome(contents) ||
    activeWindows.settings?.webContents === contents ||
    activeWindows['add-app']?.webContents === contents
);
