import { hookActionMenu } from './hookActions';
/* Native menus and commands deliberately resolve their current host window. */
/* eslint no-shadow: ["error", {"allow": ["window"]}] */
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import log from 'electron-log';
import {
  BrowserWindow,
  Input,
  Event,
  WebContents,
  IpcMainEvent,
  ipcMain,
  Menu,
  WebContentsView,
  RestoreOptions,
} from 'electron';
import {
  certificateErrorFor,
  allowWebsiteCertificateErrors,
} from './websiteCertificates';
import { effectiveHookConfig } from './globalHooks';
import { registerHookMarketplace, openHookInstallLink } from './hookMarketplace';
import { aiGroupId } from '../browser/aiGroups';
import { projectFileNavigation } from './projectFileNavigation';
import { onWindowClosed } from './windowLifecycle';
import { presentSnapshots } from './snapshotPresentation';
import {
  getGroupRemovalJournal,
  registerGroupRemoval,
  sameRemovalGroup,
} from './groupRemoval';
import { faviconSiteChanged } from './faviconLoader';
import { FaviconResolver } from './faviconResolver';
import { hookNotifications } from './hookNotifications';
import {
  authenticatePersonalData,
  personalDataRevision,
  registerPasswordPage,
} from './passwordManager';
import { getGroupLocks, isGroupLocked } from './groupLocks';
import {
  developerState,
  clearDeveloperLogs,
  developerSaveError,
  registerDeveloperPage,
  resetDeveloperState,
  rerunDeveloperHook,
  siteDeveloperPreload,
} from './siteDeveloper';
import { registerSiteDeveloperLibrary } from './siteDeveloperLibrary';
import { registerSiteDeveloperWindows } from './siteDeveloperWindow';
import {
  groupKey,
  personalDataScope,
  newGroupName,
  loginProfileKey as storedProfileKey,
} from '../utils/groups';

import {
  waitForBrowserNetwork,
  contentPreferences,
} from './advancedPreferences';
import { siteRule } from '../browser/advancedPreferences';
import { registerAI } from './ai';
import { isPrivateSession } from './privateSessions';
import { registerPageCapture } from './pageCapture';
import { AINewTabs } from './aiTabs';
import { getBrowserWindows } from './browserWindows';
import { WebsiteTabRecovery } from './websiteTabRecovery';
import { PictureInPictureController } from './pictureInPicture';
import { registerSpaceGestures } from './spaceGestures';
import { isBrowserCommand, isBrowserLayout } from './browserRequests';
import { clearSessionSiteData } from './siteData';
import { recordVisit } from './history';
import {
  websitePermissionHandler,
  websitePermissionCheckHandler,
} from './websitePermissions';
import { clearPageCookies } from './reload';
import { menuAccelerator, matchShortcut } from '../browser/shortcuts';
import { nativeMenuLabels } from '../browser/menuLabels';
import { excludedFromSleep } from '../browser/sleepingTabs';
import { retainTabHistory, tabResumeURL } from '../browser/tabDefaults';
import { inspectDiscardCandidate } from './tabDiscard';
import { newPageTab } from '../utils/tabMetadata';
import { showBrowserContextMenu } from './browserContextMenu';
import { showBrowserDialog, permissionSummary } from './dialogs';
import {
  applyBrowserPreferences,
  enablePagePinchZoom,
  getBrowserPreferences,
  isAISettingsWindow,
} from './preferences';
import {
  trackDownloads,
  downloadMenu,
  hasActiveDownloads,
  getDownloadsForContents,
  bindDownloadSource,
  controlTabDownload,
} from './downloads';
import {
  applyExtensions,
  configureExtensionStore,
  extensionMenu,
  getExtensionProfile,
  setActiveExtensionProfile,
  setExtensionInstallTarget,
  releaseExtensionOwner,
} from './extensions';
import {
  getSiteSettings,
  clearPrivateSiteSettings,
  updateSiteSettings,
  saveSiteHooks,
  siteOrigin,
  sitePermissions,
  PermissionChoice,
} from './siteSettings';
import { BrowserCommand, BrowserLayout, BrowserState, IApp } from '../types';

/** Only the trusted workspace renderer can manage embedded browsers. */
export function registerElectronBrowser(
  window: BrowserWindow,
  storageReady?: Promise<void>
) {
  const removals = getGroupRemovalJournal();
  const windows = getBrowserWindows(window);
  const privateMode = isPrivateSession(window.webContents.session);
  const privateProfilePrefix = `private:${window.id}:`;
  const loginProfileKey = (item: IApp) => privateMode
    ? `${privateProfilePrefix}${storedProfileKey(item)}`
    : storedProfileKey(item);
  const hostFor = (id: string) => windows?.host(id) || window;
  const removeView = (view: WebContentsView) =>
    windows ? windows.remove(view) : window.contentView.removeChildView(view);
  const sendState = (state: BrowserState) =>
    windows
      ? windows.updateState(state)
      : window.webContents.send('browser-state', state);
  let developerWindows: ReturnType<typeof registerSiteDeveloperWindows>;
  let synchronizingExtensions = false;
  const retiringTabs = new Set<number>();
  const closingHosts = new WeakSet<BrowserWindow>();
  const watchClosing = (host: BrowserWindow) => {
    host.on('close', (event) => {
      closingHosts.add(host);
      queueMicrotask(() => {
        if (event.defaultPrevented) closingHosts.delete(host);
      });
    });
  };
  watchClosing(window);
  const aiNewTabs = new AINewTabs();
  const approvedAIClose = new WeakSet<WebContents>();
  const tabWaiters = new Map<string, (tab: WebContents) => void>();
  const views = new Map<string, WebContentsView>();
  const websiteTabs = new Map<
    string,
    {
      view: WebContentsView;
      timer: ReturnType<typeof setTimeout>;
      favicons: string[];
      capture: (_event: unknown, urls: string[]) => void;
      contents: WebContents;
      cleanup: () => void;
      groupId: string;
      source: IApp;
    }
  >();
  const websiteTabRecovery = new WebsiteTabRecovery();
  const configurations = new Map<string, IApp>();
  const savedDeveloperErrors = new Map<
    string,
    { time: number; message: string }
  >();
  const popups = new Map<string, Set<BrowserWindow>>();
  const popupSources = new WeakMap<BrowserWindow, IApp>();
  const keyboardCleanup = new Set<() => void>();
  window.on('blur', () => {
    if (!window.isDestroyed())
      window.webContents.send('browser-shortcut', 'tab-switcher-cancel');
  });
  const pendingTabCleanup = new Set<() => void>();
  const keyboard = (
    contents: WebContents,
    dataScope: () => string | undefined = () => undefined
  ) => {
    if (!privateMode && contents !== window.webContents)
      registerPasswordPage(contents, dataScope);
    const listener = (event: Event, input: Input) => {
      const target = [...views].find(
        ([, view]) => view.webContents === contents
      )?.[0];
      const host = target
        ? hostFor(target)
        : BrowserWindow.fromWebContents(contents) || window;
      if (
        input.type === 'keyUp' &&
        (input.key === 'Control' ||
          input.code === 'ControlLeft' ||
          input.code === 'ControlRight')
      ) {
        host.webContents.send('browser-shortcut', 'tab-switcher-commit');
        return;
      }
      if (input.type === 'keyDown' && input.key === 'Escape') {
        host.webContents.send('browser-shortcut', 'tab-switcher-cancel');
      }

      if (
        input.type !== 'keyDown' ||
        !(input.meta || input.control || input.alt)
      )
        return;
      const action = matchShortcut(
        input,
        getBrowserPreferences().shortcuts,
        process.platform === 'darwin'
      );
      if (
        (action === 'next-tab' || action === 'previous-tab') &&
        input.control &&
        !input.meta &&
        !input.alt
      ) {
        event.preventDefault();
        host.webContents.send(
          'browser-shortcut',
          action === 'next-tab' ? 'tab-switcher-next' : 'tab-switcher-previous'
        );
        return;
      }
      if (action && contents !== window.webContents) {
        const history = contents.navigationHistory;
        if (action === 'back' || action === 'forward') {
          event.preventDefault();
          if (action === 'back' && history.canGoBack()) history.goBack();
          if (action === 'forward' && history.canGoForward())
            history.goForward();
          return;
        }
        if (
          action === 'reload' ||
          action === 'reload-ignore-cache' ||
          action === 'print' ||
          action.startsWith('zoom-')
        ) {
          event.preventDefault();
          if (action === 'reload') contents.reload();
          if (action === 'reload-ignore-cache') contents.reloadIgnoringCache();
          if (action === 'print') contents.print();
          if (action === 'zoom-in')
            contents.setZoomLevel(Math.min(5, contents.getZoomLevel() + 0.5));
          if (action === 'zoom-out')
            contents.setZoomLevel(Math.max(-5, contents.getZoomLevel() - 0.5));
          if (action === 'zoom-reset') contents.setZoomLevel(0);
          return;
        }
      }
      if (action) {
        event.preventDefault();
        if (action === 'new-window' && windows)
          windows.open(host, 'workspace').catch(() => {});
        else
          host.webContents.send(
            'browser-shortcut',
            action === 'sidebar' &&
              input.key.toLowerCase() === 's' &&
              !input.shift &&
              !input.alt
              ? 'sidebar-or-save'
              : action
          );
      }
    };
    contents.on('before-input-event', listener);
    const cleanup = () => {
      contents.removeListener('before-input-event', listener);
      keyboardCleanup.delete(cleanup);
    };
    keyboardCleanup.add(cleanup);
    contents.once('destroyed', cleanup);
  };
  const gestureCleanup = new Set<() => void>();
  gestureCleanup.add(registerSpaceGestures(window));
  keyboard(window.webContents);
  const hiddenSince = new Map<string, number>();
  const edited = new Set<string>();
  const failures = new Map<
    string,
    { message: string; code: number; url: string }
  >();
  const loaded = new Set<string>();
  const lastStates = new Map<string, BrowserState>();
  const pictureInPicture = new Map<string, PictureInPictureController>();
  const sleeping = new Map<
    string,
    { history: RestoreOptions; x: number; y: number }
  >();
  let focusedId: string | undefined;
  let visible = new Set<string>();
  let suspended = false;
  let pendingOverlay: BrowserLayout | undefined;
  let overlayGeneration = 0;
  const playingMedia = new Set<string>();
  const icons = new Map<string, string>();
  const themeColors = new WeakMap<WebContents, string>();
  const faviconResolver = new FaviconResolver();
  const publish = (id: string, view: WebContentsView, error?: string) => {
    const contents = view.webContents;
    if (window.isDestroyed() || !contents || contents.isDestroyed()) return;
    if (error)
      failures.set(id, {
        message: error,
        code: 0,
        url: configurations.get(id)?.url || contents.getURL(),
      });
    const failure = failures.get(id);
    const initialLoading = !loaded.has(id) && !failure;
    view.setVisible(
      visible.has(id) && !suspended && !failure && !initialLoading
    );
    const origin = siteOrigin(contents.getURL());
    const profile = loginProfileKey(configurations.get(id) || ({} as IApp));
    const state: BrowserState = {
      id,
      siteSettings: origin
        ? {
            origin,
            certificateError: certificateErrorFor(contents.session, origin),
            permissions: getSiteSettings(profile, origin).permissions,
            blocked: getBrowserPreferences().permissions === 'block',
            developer: privateMode
              ? undefined
              : developerState(contents, origin),
          }
        : undefined,
      url: contents.getURL(),
      title: contents.getTitle(),
      themeColor: themeColors.get(contents),
      icon: icons.get(id),
      muted: contents.isAudioMuted(),
      audible: contents.isCurrentlyAudible(),
      mediaPlaying: playingMedia.has(id),
      pictureInPicture: pictureInPicture.get(id)?.state,
      extensionContext: {
        profile: `persist:kudiumbrowser-${loginProfileKey(
          configurations.get(id) || ({} as IApp)
        )}`,
        tab: String(contents.id),
      },
      discarded: false,
      // Late advertising/embedded frame navigation must not make a loaded
      // tab look as though its main document is reloading.
      loading: contents.isLoadingMainFrame(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      error: failure?.message,
      errorCode: failure?.code,
      failedURL: failure?.url,
      initialLoading,
    };
    lastStates.set(id, state);
    sendState(state);
    developerWindows.update();
  };
  const validURL = (url: string) => {
    try {
      return ['https:', 'http:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  };
  const close = (id: string) => {
    websiteTabRecovery.close(id, configurations.get(id)?.restorationId);
    const view = views.get(id);
    if (view) {
      removeView(view);
      const ownedPopups = popups.get(id);
      ownedPopups?.forEach((popup) => {
        if (!popup.isDestroyed()) popup.close();
      });
      // A popup may cancel its close; keep tracking it so removal cannot clear
      // a session while one of the group's windows is still using it.
      if (
        !ownedPopups ||
        [...ownedPopups].every((popup) => popup.isDestroyed())
      )
        popups.delete(id);
      retiringTabs.add(view.webContents.id);
      getExtensionProfile(
        loginProfileKey(configurations.get(id) || ({} as IApp))
      )?.api.removeTab(view.webContents);
      retiringTabs.delete(view.webContents.id);
      view.webContents.close({
        waitForBeforeUnload: approvedAIClose.has(view.webContents),
      });
      views.delete(id);
      faviconResolver.cancel(id);
      icons.delete(id);
      playingMedia.delete(id);
      pictureInPicture.get(id)?.dispose();
      pictureInPicture.delete(id);
    }
    configurations.delete(id);
    hiddenSince.delete(id);
    edited.delete(id);
    sleeping.delete(id);
    lastStates.delete(id);
    failures.delete(id);
    loaded.delete(id);
  };
  const applyLayout = (incomingLayout: BrowserLayout, prepared = false) => {
    if (!incomingLayout.suspended && pendingOverlay) {
      pendingOverlay = undefined;
      overlayGeneration += 1;
    }
    let layout = incomingLayout;
    if (removals.hasRestrictions()) {
      const retired = layout.apps.filter((item) => removals.removed(item.id));
      if (retired.length)
        window.webContents.send('browser-tab-request', {
          action: 'remove',
          ids: retired.map((item) => item.id),
        });
      layout = {
        ...layout,
        apps: layout.apps.filter((item) => !removals.removed(item.id)),
        visible: layout.visible.filter((slot) => {
          const item = layout.apps.find((entry) => entry.id === slot.id);
          return item && !removals.blocks(item);
        }),
        focusedId: layout.apps.some(
          (item) => item.id === layout.focusedId && !removals.blocks(item)
        )
          ? layout.focusedId
          : undefined,
      };
    }
    const rejected = websiteTabRecovery.check(layout.apps);
    if (rejected) {
      if (rejected.archive)
        window.webContents.send('browser-tab-request', {
          action: 'close',
          id: rejected.id,
        });
      return;
    }
    const ids = new Set(layout.apps.map((item) => item.id));
    configurations.forEach((_, id) => {
      if (!ids.has(id)) close(id);
    });
    if (layout.suspended && !suspended && !prepared) {
      if (pendingOverlay) {
        pendingOverlay = layout;
        return;
      }
      pendingOverlay = layout;
      overlayGeneration += 1;
      const generation = overlayGeneration;
      const previewIds = layout.tabSwitcher
        ? layout.apps
            .filter(
              (item) =>
                !isGroupLocked(item) &&
                views.has(item.id) &&
                (item.favorite ||
                  (item.spaceId || 'default') ===
                    (configurations.get(layout.focusedId || '')?.spaceId ||
                      'default'))
            )
            .slice(0, 20)
            .map((item) => item.id)
        : [];
      const snapshots = [...new Set([...visible, ...previewIds])].map(
        async (id) => {
          const browserView = views.get(id);
          if (!browserView || browserView.webContents.isDestroyed())
            return undefined;
          const bounds = browserView.getBounds();
          try {
            const capture = await browserView.webContents.capturePage();
            return {
              id,
              ...bounds,
              previewOnly: !visible.has(id),
              image: (visible.has(id)
                ? capture
                : capture.resize({ width: 480 })
              ).toDataURL(),
            };
          } catch {
            return undefined;
          }
        }
      );
      Promise.all(snapshots)
        .then(async (frames) => {
          if (
            !pendingOverlay ||
            generation !== overlayGeneration ||
            window.isDestroyed()
          )
            return undefined;
          await presentSnapshots(
            window,
            frames.filter(
              (frame): frame is NonNullable<typeof frame> =>
                !!frame &&
                !!configurations.get(frame.id) &&
                !isGroupLocked(configurations.get(frame.id)!)
            )
          );
          if (
            !pendingOverlay ||
            generation !== overlayGeneration ||
            window.isDestroyed()
          )
            return undefined;
          const pending = pendingOverlay;
          pendingOverlay = undefined;
          applyLayout(pending, true);
          return undefined;
        })
        .catch(() => {
          if (generation === overlayGeneration) pendingOverlay = undefined;
        });
      return;
    }
    focusedId = layout.focusedId;
    suspended = Boolean(layout.suspended);
    visible = new Set(layout.visible.map((item) => item.id));
    layout.apps.forEach((item) => {
      if (removals.blocks(item)) {
        configurations.set(item.id, configurations.get(item.id) || item);
        window.webContents.send('browser-tab-request', {
          action: 'unload-group',
          id: item.id,
        });
        return;
      }
      if (
        typeof item.id !== 'string' ||
        (!validURL(item.url) &&
          item.url !== 'about:blank' &&
          !projectFileNavigation(item.url, item))
      )
        return;
      if (
        configurations.has(item.id) &&
        isGroupLocked(configurations.get(item.id)!) &&
        groupKey(configurations.get(item.id)!) !== groupKey(item)
      )
        return;
      if (isGroupLocked(item)) {
        const previous = configurations.get(item.id);
        if (views.has(item.id)) close(item.id);
        configurations.set(item.id, previous || item);
        return;
      }
      const previous = configurations.get(item.id);
      if (previous && loginProfileKey(previous) !== loginProfileKey(item))
        close(item.id);
      let view = views.get(item.id);
      configurations.set(item.id, item);
      // Saved tabs remain metadata until shown. Extension-requested background
      // tabs must initialize to resolve the extension's pending createTab call.
      if (
        !view &&
        !visible.has(item.id) &&
        layout.focusedId !== item.id &&
        !tabWaiters.has(item.id) &&
        !websiteTabs.has(item.id)
      )
        return;
      if (!view) {
        const adopted = websiteTabs.get(item.id);
        if (adopted) {
          adopted.cleanup();
          websiteTabs.delete(item.id);
        }
        view =
          adopted?.view ||
          new WebContentsView({
            webPreferences: {
              ...(!privateMode && { preload: siteDeveloperPreload() }),
              ...(privateMode
                ? { session: window.webContents.session }
                : {
                    partition: `persist:kudiumbrowser-${loginProfileKey(item)}`,
                  }),
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              webSecurity: true,
              defaultFontSize: getBrowserPreferences().defaultFontSize,
              autoplayPolicy: contentPreferences(
                getBrowserPreferences().advanced,
                item.url
              ).autoplayPolicy,
            },
          });
        view.setBorderRadius(12);
        views.set(item.id, view);
        if (!adopted) window.contentView.addChildView(view);
        const browserView = view;
        const contents = view.webContents;
        let faviconPageURL = item.url;
        contents.on('did-navigate', (_, url) => {
          if (faviconSiteChanged(faviconPageURL, url)) icons.set(item.id, '');
          faviconPageURL = url;
        });
        allowWebsiteCertificateErrors(contents, () =>
          publish(item.id, browserView)
        );
        if (!privateMode)
          registerDeveloperPage(
            contents,
            loginProfileKey(item),
            () => publish(item.id, browserView),
            () => {
              const current = configurations.get(item.id);
              return current && !isGroupLocked(current)
                ? {
                    groupId: groupKey(current),
                    sourceId: current.id,
                    scope: personalDataScope(current),
                  }
                : undefined;
            }
          );
        if ((adopted || item.restorationId) && !contents.isLoadingMainFrame())
          loaded.add(item.id);
        contents.once('destroyed', () => {
          aiNewTabs.fail(
            item.id,
            new Error('New tab closed during initialization.')
          );
          if (adopted && !retiringTabs.has(contents.id)) {
            // A website may destroy its renderer before the archive IPC arrives.
            // Retire its native view now; never access a destroyed view's contents.
            views.delete(item.id);
            if (!window.isDestroyed()) {
              removeView(browserView);
              window.webContents.send('browser-tab-request', {
                action: 'close',
                id: item.id,
              });
            }
          }
        });
        if (adopted)
          (contents as unknown as EventEmitter).on(
            'close',
            (closeEvent: { preventDefault(): void }) => {
              if (retiringTabs.has(contents.id) || closingHosts.has(hostFor(item.id))) return;
              // Website window.close must archive only its tab, not its host window.
              closeEvent.preventDefault();
              if (!window.isDestroyed())
                window.webContents.send('browser-tab-request', {
                  action: 'close',
                  id: item.id,
                });
            }
          );
        keyboard(contents, () =>
          personalDataScope(configurations.get(item.id) || item)
        );
        contents.on('before-input-event', (_, input) => {
          if (
            input.type === 'keyDown' &&
            (input.key.length === 1 ||
              ['Backspace', 'Delete', 'Enter'].includes(input.key))
          )
            edited.add(item.id);
        });
        contents.on('did-navigate', () => edited.delete(item.id));
        contents.on('did-finish-load', () => {
          const saved = sleeping.get(item.id);
          if (!saved) return;
          sleeping.delete(item.id);
          contents
            .executeJavaScript(`window.scrollTo(${saved.x}, ${saved.y})`)
            .catch(() => {});
        });
        if (
          !privateMode &&
          new URL(item.url).origin === 'https://chromewebstore.google.com'
        )
          configureExtensionStore(contents, loginProfileKey(item));
        applyBrowserPreferences(contents, loginProfileKey(item));
        bindDownloadSource(
          contents,
          JSON.stringify([loginProfileKey(item), item.id])
        );
        trackDownloads(contents.session);
        const profileId = loginProfileKey(item);
        const ready = privateMode
          ? Promise.resolve()
          : applyExtensions(
              contents.session,
              profileId,
              item.sessionName || item.name,
              window,
              {
                createTab: async (details) => {
                  if (removals.blocks(item))
                    throw new Error('This group is being removed.');
                  if (isGroupLocked(configurations.get(item.id) || item))
                    throw new Error('Unlock this group before opening tabs.');
                  const url = details.url || item.url;
                  const extensionPage = url.startsWith('chrome-extension://');
                  if (!extensionPage && !validURL(url))
                    throw new Error(
                      'This extension requested an unsupported page address.'
                    );
                  if (
                    extensionPage ||
                    new URL(url).origin !== new URL(item.url).origin
                  ) {
                    if (
                      extensionPage &&
                      !contents.session.extensions.getExtension(
                        new URL(url).hostname
                      )
                    )
                      throw new Error(
                        'Extension is unavailable in this group.'
                      );
                    const popup = new BrowserWindow({
                      parent: window,
                      show: false,
                      width: 960,
                      height: 720,
                      webPreferences: {
                        session: contents.session,
                        sandbox: true,
                        contextIsolation: true,
                        nodeIntegration: false,
                      },
                    });
                    applyBrowserPreferences(popup.webContents);
                    const api = getExtensionProfile(profileId)?.api;
                    api?.addTab(popup.webContents, popup);
                    const owned =
                      popups.get(item.id) || new Set<BrowserWindow>();
                    popupSources.set(popup, { ...item });
                    owned.add(popup);
                    popups.set(item.id, owned);
                    popup.on('closed', () => owned.delete(popup));
                    try {
                      await popup.loadURL(url);
                      if (
                        removals.blocks(item) ||
                        isGroupLocked(configurations.get(item.id) || item) ||
                        popup.isDestroyed()
                      )
                        throw new Error('Group access was revoked.');
                      if (details.active === false) popup.showInactive();
                      else {
                        popup.show();
                        popup.webContents.focus();
                      }
                      return [popup.webContents, popup];
                    } catch (error) {
                      if (!popup.isDestroyed()) popup.destroy();
                      throw error;
                    }
                  }
                  const id = randomUUID();
                  const tab = new Promise<WebContents>((resolve, reject) => {
                    let timeout: ReturnType<typeof setTimeout>;
                    const cancel = () => {
                      clearTimeout(timeout);
                      pendingTabCleanup.delete(cancel);
                      tabWaiters.delete(id);
                      reject(
                        new Error('Browser detached or tab creation timed out')
                      );
                    };
                    timeout = setTimeout(cancel, 10000);
                    pendingTabCleanup.add(cancel);
                    tabWaiters.set(id, (created) => {
                      clearTimeout(timeout);
                      pendingTabCleanup.delete(cancel);
                      resolve(created);
                      tabWaiters.delete(id);
                    });
                  });
                  window.webContents.send('browser-tab-request', {
                    action: 'create',
                    app: {
                      ...item,
                      id,
                      url,
                      favorite: false,
                      pinned: false,
                      customName: undefined,
                    },
                  });
                  return [await tab, window];
                },
                selectTab: (tab) => {
                  if (synchronizingExtensions || window.isDestroyed()) return;
                  const entry = [...views].find(
                    ([, candidate]) => candidate.webContents === tab
                  );
                  if (entry)
                    window.webContents.send('browser-tab-request', {
                      action: 'select',
                      id: entry[0],
                    });
                },
                removeTab: (tab) => {
                  if (retiringTabs.has(tab.id) || window.isDestroyed()) return;
                  const entry = [...views].find(
                    ([, candidate]) => candidate.webContents === tab
                  );
                  if (entry)
                    window.webContents.send('browser-tab-request', {
                      action: 'close',
                      id: entry[0],
                    });
                },
                requestPermissions: async (extension, permissions) => {
                  const answer = await showBrowserDialog(window, {
                    message: `${extension.name} requests additional access`,
                    detail: permissionSummary([
                      ...(permissions.permissions || []),
                      ...(permissions.origins || []),
                    ]),
                    technicalDetail: [
                      ...(permissions.permissions || []),
                      ...(permissions.origins || []),
                    ].join('\n'),
                    buttons: ['Deny', 'Allow'],
                    defaultId: 0,
                    cancelId: 0,
                  });
                  return answer.response === 1;
                },
              }
            );
        contents.setWindowOpenHandler(({ url, disposition }) => {
          const window = hostFor(item.id);
          if (openHookInstallLink(url, window)) return { action: 'deny' };
          const behavior = siteRule(
            getBrowserPreferences().advanced,
            contents.getURL()
          );
          if (behavior?.popups === false) return { action: 'deny' };
          const linkTab =
            disposition === 'background-tab' ||
            disposition === 'foreground-tab';
          if (
            (!validURL(url) && url !== 'about:blank') ||
            (!linkTab &&
              !(behavior?.popups ?? getBrowserPreferences().allowPopups))
          )
            return { action: 'deny' };
          return {
            action: 'allow',
            outlivesOpener: true,
            overrideBrowserWindowOptions: {
              webPreferences: {
                session: contents.session,
                ...(!privateMode && { preload: siteDeveloperPreload() }),
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                webSecurity: true,
              },
            },
            createWindow: (options) => {
              if (removals.blocks(item))
                throw new Error('This group is being removed.');
              const id = randomUUID();
              const child = new WebContentsView({
                ...options,
                webPreferences: {
                  ...options.webPreferences,
                  session: contents.session,
                  sandbox: true,
                  contextIsolation: true,
                  nodeIntegration: false,
                  webSecurity: true,
                },
              });
              child.setVisible(false);
              child.setBounds({ x: 0, y: 0, width: 1, height: 1 });
              child.webContents.setUserAgent(contents.getUserAgent());
              window.contentView.addChildView(child);
              const capture = (_event: unknown, urls: string[]) => {
                const pending = websiteTabs.get(id);
                if (pending) pending.favicons = urls;
              };
              const childContents = child.webContents;
              enablePagePinchZoom(childContents);
              if (!privateMode)
                registerDeveloperPage(
                  childContents,
                  profileId,
                  () => {
                    const current = views.get(id);
                    if (current) publish(id, current);
                  },
                  () => {
                    const current = configurations.get(id);
                    return current && !isGroupLocked(current)
                      ? {
                          groupId: groupKey(current),
                          sourceId: current.id,
                          scope: personalDataScope(current),
                        }
                      : undefined;
                  }
                );
              bindDownloadSource(
                childContents,
                JSON.stringify([loginProfileKey(item), id])
              );
              trackDownloads(childContents.session);
              let timer: ReturnType<typeof setTimeout>;
              let onClose: (closeEvent: { preventDefault(): void }) => void;
              let onDestroyed: () => void;
              const cleanup = () => {
                clearTimeout(timer);
                childContents.removeListener('page-favicon-updated', capture);
                (childContents as unknown as EventEmitter).removeListener(
                  'close',
                  onClose
                );
                childContents.removeListener('destroyed', onDestroyed);
              };
              const retire = (closeContents: boolean) => {
                if (!websiteTabs.has(id)) return;
                websiteTabs.delete(id);
                websiteTabRecovery.retire(id);
                cleanup();
                if (!window.isDestroyed()) {
                  window.contentView.removeChildView(child);
                  window.webContents.send('browser-tab-request', {
                    action: 'close',
                    id,
                  });
                }
                if (closeContents && !childContents.isDestroyed())
                  childContents.close();
              };
              onClose = (closeEvent) => {
                if (closingHosts.has(window)) return;
                closeEvent.preventDefault();
                // The intercepted close was cancelled; finish closing after
                // removing our listener so the pending page cannot stay alive.
                retire(true);
              };
              onDestroyed = () => retire(false);
              timer = setTimeout(() => retire(true), 10000);
              websiteTabs.set(id, {
                source: { ...item },
                groupId: groupKey(item),
                view: child,
                contents: childContents,
                timer,
                favicons: [],
                capture,
                cleanup,
              });
              childContents.on('page-favicon-updated', capture);
              (childContents as unknown as EventEmitter).on('close', onClose);
              childContents.once('destroyed', onDestroyed);
              window.webContents.send('browser-tab-request', {
                action: 'create',
                background: disposition === 'background-tab',
                app: {
                  ...newPageTab(configurations.get(item.id) || item, url, id),
                  openerTabId: item.id,
                },
              });
              // Chromium owns the child load, window.opener and form body. Adoption
              // must not issue a second loadURL or create a separate native window.
              return child.webContents;
            },
          };
        });
        contents.on('will-redirect', (navigation, url) => {
          if (openHookInstallLink(url, hostFor(item.id))) navigation.preventDefault();
        });
        contents.on('will-navigate', (navigation, url) => {
          if (openHookInstallLink(url, hostFor(item.id))) {
            navigation.preventDefault();
            return;
          }
          if (
            !validURL(url) &&
            url !== 'about:blank' &&
            !projectFileNavigation(url, configurations.get(item.id) || item)
          )
            navigation.preventDefault();
        });
        const pip = new PictureInPictureController(
          contents,
          () => visible.has(item.id) && !suspended,
          () => {
            if (views.get(item.id) === browserView)
              publish(item.id, browserView);
          }
        );
        pictureInPicture.set(item.id, pip);
        contents.on('context-menu', (_, params) => {
          const window = hostFor(item.id);
          showBrowserContextMenu(
            window,
            contents,
            params,
            (url, newSession) => {
              if (!validURL(url)) return;
              const source = configurations.get(item.id) || item;
              window.webContents.send('browser-tab-request', {
                action: 'create',
                app: {
                  ...newPageTab(source, url, randomUUID()),
                  sessionId: newSession ? randomUUID() : source.sessionId,
                  groupDisplay: newSession ? 'folder' : source.groupDisplay,
                  sessionMode: newSession ? 'separate' : source.sessionMode,
                  sessionProfileId: newSession
                    ? undefined
                    : source.sessionProfileId,
                  sessionName: newSession
                    ? newGroupName(
                        [...configurations.values()],
                        source.sessionName || source.name,
                        source.sessionNameCustom
                      )
                    : source.sessionName,
                  sessionNameCustom: newSession
                    ? false
                    : source.sessionNameCustom,
                  sessionNameGenerated: newSession
                    ? true
                    : source.sessionNameGenerated,
                  favorite: false,
                  pinned: false,
                  customName: undefined,
                },
              });
            },
            getExtensionProfile(profileId)?.api.getContextMenuItems(
              contents,
              params
            ) || [],
            pip.contextAction(params),
            privateMode ? [] : hookActionMenu(window, contents, params, profileId, () => {
              const current = configurations.get(item.id);
              return current && !isGroupLocked(current)
                ? {
                    groupId: groupKey(current),
                    sourceId: current.id,
                    scope: personalDataScope(current),
                  }
                : undefined;
            })
          );
        });
        const permissionProfile = profileId;
        contents.session.setPermissionCheckHandler(
          websitePermissionCheckHandler(permissionProfile)
        );
        contents.session.setPermissionRequestHandler(
          (requesting, permission, callback, details) => {
            const target =
              requesting &&
              [...views].find(
                ([, candidate]) => candidate.webContents === requesting
              )?.[0];
            websitePermissionHandler(
              target ? hostFor(target) : window,
              permissionProfile
            )(requesting, permission, callback, details);
          }
        );
        const applySiteMute = () => {
          const origin = siteOrigin(contents.getURL());
          contents.setAudioMuted(
            origin ? getSiteSettings(permissionProfile, origin).muted : false
          );
          publish(item.id, browserView);
        };
        contents.on('did-navigate', applySiteMute);

        contents.on('did-navigate-in-page', (_, url, mainFrame) => {
          if (!privateMode && mainFrame)
            recordVisit(url, contents.getTitle(), permissionProfile);
        });
        contents.on('audio-state-changed', () => publish(item.id, browserView));
        contents.on('media-started-playing', () => {
          playingMedia.add(item.id);
          publish(item.id, browserView);
        });
        contents.on('media-paused', () => {
          playingMedia.delete(item.id);
          publish(item.id, browserView);
        });
        contents.on('did-change-theme-color', (_, color) => {
          if (color && /^#[0-9a-f]{6}$/i.test(color))
            themeColors.set(contents, color);
          else themeColors.delete(contents);
          publish(item.id, browserView);
        });
        contents.on('did-start-navigation', (_, _url, inPlace, mainFrame) => {
          if (mainFrame && !inPlace) {
            faviconResolver.cancel(item.id);
            themeColors.delete(contents);
            failures.delete(item.id);
            publish(item.id, browserView);
          }
        });
        // Show the document as soon as it is usable; decorative loading UI
        // must never wait for images or other late subresources.
        contents.on('dom-ready', () => {
          if (!failures.has(item.id)) loaded.add(item.id);
          publish(item.id, browserView);
        });
        contents.on('did-finish-load', () => {
          if (!failures.has(item.id)) {
            loaded.add(item.id);
            if (!privateMode)
              recordVisit(
                contents.getURL(),
                contents.getTitle(),
                permissionProfile
              );
          }
          publish(item.id, browserView);
        });
        contents.on('render-process-gone', (_, details) => {
          failures.set(item.id, {
            message: 'The page stopped responding',
            code: -10000,
            url: contents.getURL() || item.url,
          });
          publish(item.id, browserView);
        });
        [
          'did-start-loading',
          'did-stop-loading',
          'did-navigate',
          'did-navigate-in-page',
          'page-title-updated',
        ].forEach((name) => {
          contents.on(name as 'did-stop-loading', () => {
            if (
              (adopted || item.restorationId) &&
              name === 'did-stop-loading' &&
              !contents.getURL() &&
              !failures.has(item.id)
            )
              loaded.add(item.id);
            publish(item.id, browserView);
          });
        });
        contents.on('focus', () => {
          const window = hostFor(item.id);
          if (browserView.getVisible() && !window.isDestroyed())
            window.webContents.send('browser-tab-request', {
              action: 'select',
              id: item.id,
            });
        });
        let declaredFavicons: string[] = [];
        const refreshFavicon = (urls: string[]) => {
          // eslint-disable-next-line no-void
          void faviconResolver
            .resolve(item.id, contents, urls, (icon) => {
              icons.set(item.id, icon);
              publish(item.id, browserView);
            })
            .catch((error) => {
              if (error?.name !== 'AbortError')
                log.debug('Favicon candidates failed', {
                  tab: item.id,
                  reason: String(error),
                });
            });
        };
        contents.on('did-start-navigation', (_, _url, inPlace, mainFrame) => {
          if (mainFrame && !inPlace) declaredFavicons = [];
        });
        contents.on('page-favicon-updated', (_, urls: string[]) => {
          declaredFavicons = urls;
          refreshFavicon(urls);
        });
        contents.on('did-finish-load', () => {
          if (!declaredFavicons.length) refreshFavicon([]);
        });
        contents.on('did-fail-load', (_, code, description, url, mainFrame) => {
          if (mainFrame && code !== -3) {
            failures.set(item.id, { message: description, code, url });
            publish(item.id, browserView);
          }
        });
        ready
          .then(() => waitForBrowserNetwork(contents))
          .then(() => {
            if (!contents.isDestroyed()) {
              synchronizingExtensions = true;
              try {
                getExtensionProfile(profileId)?.api.addTab(contents, window);
                // Cleanup must run on both success and failure; the promise returns below.
                // eslint-disable-next-line promise/always-return
              } finally {
                synchronizingExtensions = false;
              }
              if (adopted) {
                if (adopted.favicons.length)
                  contents.emit('page-favicon-updated', {}, adopted.favicons);
                publish(item.id, browserView);
                return null;
              }
              if (aiNewTabs.ready(item.id, contents)) return null;
              tabWaiters.get(item.id)?.(contents);
              const current = configurations.get(item.id) || item;
              const saved = sleeping.get(item.id);
              if (
                retainTabHistory(current) &&
                saved &&
                saved.history.entries.length
              )
                return contents.navigationHistory.restore(saved.history);
              sleeping.delete(item.id);
              // Navigation failures are displayed by did-fail-load.
              // eslint-disable-next-line promise/no-nesting
              return contents.loadURL(tabResumeURL(current)).catch(() => {});
            }
            return null;
          })
          .catch((error) => {
            aiNewTabs.fail(item.id, error);
            publish(
              item.id,
              browserView,
              `Extension initialization failed: ${String(error)}`
            );
          });
      } else if (
        previous?.url !== item.url &&
        view.webContents.getURL() !== item.url
      ) {
        view.webContents.loadURL(item.url).catch(() => {});
      }
      setExtensionInstallTarget(
        loginProfileKey(item),
        item.extensionInstallTarget
      );
      configurations.set(item.id, item);
      if (windows) windows.place(item.id, view);
      const slot = layout.visible.find((entry) => entry.id === item.id);
      if (slot || focusedId === item.id) hiddenSince.delete(item.id);
      else if (!hiddenSince.has(item.id)) hiddenSince.set(item.id, Date.now());
      view.setVisible(
        Boolean(slot) &&
          !suspended &&
          !failures.has(item.id) &&
          loaded.has(item.id)
      );
      if (slot) {
        const profileId = loginProfileKey(item);
        if ((layout.focusedId || layout.visible[0]?.id) === item.id)
          setActiveExtensionProfile(hostFor(item.id), profileId);
        const profile = getExtensionProfile(profileId);
        if (
          profile &&
          (layout.focusedId || layout.visible[0]?.id) === item.id
        ) {
          profile.name = item.sessionName || item.name;
          try {
            synchronizingExtensions = true;
            profile.api.selectTab(view.webContents);
          } catch {
            /* Tab initialization may still be pending. */
          } finally {
            synchronizingExtensions = false;
          }
        }
      }
      if (
        slot &&
        [slot.x, slot.y, slot.width, slot.height].every(Number.isFinite)
      ) {
        view.setBounds({
          x: Math.max(0, Math.round(slot.x)),
          y: Math.max(0, Math.round(slot.y)),
          width: Math.max(0, Math.round(slot.width)),
          height: Math.max(0, Math.round(slot.height)),
        });
      }
      publish(item.id, view);
    });
  };
  const resetUnloadedHistory = (
    id: string,
    item: IApp,
    state?: BrowserState
  ) => {
    sleeping.delete(id);
    const url = tabResumeURL(item, state?.url);
    configurations.set(id, { ...item, url });
    if (!state || window.isDestroyed()) return;
    const next = {
      ...state,
      url,
      discarded: true,
      audible: false,
      mediaPlaying: false,
      pictureInPicture: undefined,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: undefined,
      errorCode: undefined,
      failedURL: undefined,
    };
    failures.delete(id);
    lastStates.set(id, next);
    sendState(next);
  };
  const unloadTab = (
    id: string,
    view: WebContentsView,
    scroll: { x: number; y: number },
    manual = false
  ) => {
    const contents = view.webContents;
    const item = configurations.get(id);
    if (!item || contents.isDestroyed() || retiringTabs.has(contents.id))
      return;
    const state = lastStates.get(id);
    sleeping.set(id, {
      history: {
        entries: contents.navigationHistory.getAllEntries(),
        index: contents.navigationHistory.getActiveIndex(),
      },
      ...scroll,
    });
    retiringTabs.add(contents.id);
    let unloaded: () => void;
    const cancel = () => {
      sleeping.delete(id);
      hiddenSince.set(id, Date.now());
      retiringTabs.delete(contents.id);
      contents.removeListener('destroyed', unloaded);
      if (manual && !window.isDestroyed())
        window.webContents.send('browser-tab-request', {
          action: 'select',
          id,
        });
    };
    const prevented = () => {
      if (!manual) {
        cancel();
        return;
      }
      showBrowserDialog(window, {
        message: 'Unload this tab with unsaved changes?',
        detail:
          'The tab stays saved in its group, but unsaved page changes will be lost.',
        buttons: ['Cancel', 'Unload Tab'],
        defaultId: 0,
        cancelId: 0,
      })
        .then((answer) => {
          if (contents.isDestroyed()) return undefined;
          if (answer.response !== 1) {
            cancel();
            return undefined;
          }
          contents.close({ waitForBeforeUnload: false });
          return undefined;
        })
        .catch(cancel);
    };
    unloaded = () => {
      contents.removeListener('will-prevent-unload', prevented);
      retiringTabs.delete(contents.id);
      if (views.get(id) !== view) return;
      pictureInPicture.get(id)?.dispose();
      pictureInPicture.delete(id);
      views.delete(id);
      removeView(view);
      const ownedPopups = popups.get(id);
      ownedPopups?.forEach((popup) => {
        if (!popup.isDestroyed()) popup.close();
      });
      // A popup may cancel its close; keep tracking it so removal cannot clear
      // a session while one of the group's windows is still using it.
      if (
        !ownedPopups ||
        [...ownedPopups].every((popup) => popup.isDestroyed())
      )
        popups.delete(id);
      hiddenSince.delete(id);
      edited.delete(id);
      playingMedia.delete(id);
      loaded.delete(id);
      faviconResolver.cancel(id);
      const current = configurations.get(id) || item;
      if (!retainTabHistory(current, manual)) {
        resetUnloadedHistory(id, current, state);
        return;
      }
      const currentURL = state?.url || current.url;
      configurations.set(id, { ...current, url: currentURL });
      if (state && !window.isDestroyed()) {
        const next = {
          ...state,
          discarded: true,
          audible: false,
          mediaPlaying: false,
          pictureInPicture: undefined,
          loading: false,
        };
        lastStates.set(id, next);
        sendState(next);
      }
    };
    contents.once('will-prevent-unload', prevented);
    contents.once('destroyed', unloaded);
    contents.close({ waitForBeforeUnload: true });
  };
  const rootWindow = window;
  const command = (event: IpcMainEvent, incoming: BrowserCommand) => {
    if (
      privateMode &&
      /hook|developer|extension|personal|notification/i.test(
        String(incoming?.action)
      )
    )
      return;
    let request = incoming;
    const requestWindow =
      windows?.trusted(event) ||
      (event.sender === rootWindow.webContents &&
      event.senderFrame === rootWindow.webContents.mainFrame
        ? rootWindow
        : undefined);
    if (
      !requestWindow ||
      !isBrowserCommand(request) ||
      (windows && request.id && !windows.allows(requestWindow, request.id))
    )
      return;
    const window = requestWindow;
    if (request.action === 'focus-chrome') {
      if (window.isFocused()) window.webContents.focus();
      return;
    }
    const targetGroup = configurations.get(request.id);
    if (
      targetGroup &&
      removals.blocks(targetGroup) &&
      request.action !== 'close-group'
    )
      return;
    if (targetGroup && isGroupLocked(targetGroup)) return;
    if (request.action === 'unload-tab') {
      const item = configurations.get(request.id);
      const view = views.get(request.id);
      if (!item || windows?.visibleElsewhere(window, request.id)) return;
      if (view) unloadTab(request.id, view, { x: 0, y: 0 }, true);
      else resetUnloadedHistory(request.id, item, lastStates.get(request.id));
      return;
    }
    if (request.action === 'close-group') {
      const source = configurations.get(request.id);
      if (!source) return;
      configurations.forEach((item, id) => {
        if (
          groupKey(item) !== groupKey(source) ||
          (item.spaceId || 'default') !== (source.spaceId || 'default')
        )
          return;
        const view = views.get(id);
        if (windows?.visibleElsewhere(window, id)) return;
        if (view) unloadTab(id, view, { x: 0, y: 0 }, true);
        else resetUnloadedHistory(id, item, lastStates.get(id));
      });
      return;
    }
    if (request.action === 'extensions') {
      const item = configurations.get(request.id);
      if (item) setActiveExtensionProfile(window, loginProfileKey(item));
      Menu.buildFromTemplate(
        extensionMenu(window, views.get(request.id)?.webContents)
      ).popup({ window });
      return;
    }
    const contents = views.get(request.id)?.webContents;
    if (
      ['activate-hook-notification', 'revoke-hook-notification'].includes(
        request.action
      ) &&
      targetGroup &&
      request.grantId
    ) {
      const origin = siteOrigin(contents?.getURL() || targetGroup.url);
      if (!origin || origin !== request.url) return;
      const config = effectiveHookConfig(
        loginProfileKey(targetGroup),
        contents?.getURL() || targetGroup.url
      );
      if (!config) return;
      const context = {
        groupId: groupKey(targetGroup),
        profile: loginProfileKey(targetGroup),
        scope: personalDataScope(targetGroup),
        origin,
        config,
      };
      const permissions = hookNotifications();
      const epoch = personalDataRevision();
      (async () => {
        if (request.action === 'revoke-hook-notification')
          permissions.revoke(request.grantId!, context);
        else {
          const grant = permissions.find(request.grantId!, context);
          permissions.verify(grant, context);
          const answer = await showBrowserDialog(window, {
            type: 'question',
            message: 'Allow this saved hook to send notifications?',
            detail: `Website: ${origin}\nDestination: ${
              grant.destinationHost
            }\nSaved fields: ${grant.label} — ${grant.fieldName}${
              grant.recipientField ? `, ${grant.recipientField}` : ''
            }\nOnly this exact script and group are allowed for the current browser session. Credentials stay local.`,
            technicalDetailLabel: 'Review script',
            technicalDetail: `After load:\n${config.after}\n\nBefore load:\n${config.before}\n\nCSS:\n${config.css}`,
            buttons: ['Cancel', 'Allow notifications'],
            defaultId: 0,
            cancelId: 0,
          });
          if (answer.response !== 1) return;
          await authenticatePersonalData();
          const current = configurations.get(request.id);
          if (
            window.isDestroyed() ||
            !current ||
            isGroupLocked(current) ||
            groupKey(current) !== context.groupId ||
            personalDataScope(current) !== context.scope ||
            loginProfileKey(current) !== context.profile ||
            personalDataRevision() !== epoch ||
            siteOrigin(
              views.get(request.id)?.webContents.getURL() || current.url
            ) !== origin
          )
            throw new Error('Group or permissions changed during review.');
          permissions.activate(request.grantId!, {
            ...context,
            config: effectiveHookConfig(
              context.profile,
              views.get(request.id)?.webContents.getURL() || current.url
            ),
          });
        }
        if (!window.isDestroyed())
          window.webContents.send('site-developer-library-changed');
      })()
        .catch((error) => {
          if (contents && !contents.isDestroyed())
            developerSaveError(contents, origin, String(error));
          else
            savedDeveloperErrors.set(request.id, {
              time: Date.now(),
              message: String(error),
            });
        })
        .finally(() => {
          if (!window.isDestroyed()) developerWindows.update();
        })
        .catch(() => {});
      return;
    }
    if (request.action === 'run-site-hook') {
      if (contents && request.url && typeof request.hookId === 'string')
        rerunDeveloperHook(contents, request.url, request.hookId);
      return;
    }
    if (request.action === 'toggle-site-hook') {
      const origin = siteOrigin(contents?.getURL() || targetGroup?.url || '');
      if (
        !targetGroup ||
        !origin ||
        origin !== request.url ||
        typeof request.hookId !== 'string'
      )
        return;
      const config = getSiteSettings(
        loginProfileKey(targetGroup),
        origin
      ).developer;
      if (!config) return;
      const hook = config.hooks?.find((item) => item.id === request.hookId);
      if (request.hookId && !hook) return;
      const enabled = !(
        config.enabled &&
        (hook ? hook.enabled : config.defaultEnabled !== false)
      );
      request = {
        ...request,
        action: 'set-site-developer',
        developer: {
          ...config,
          enabled: enabled || config.enabled,
          ...(hook
            ? {
                hooks: config.hooks?.map((item) =>
                  item.id === hook.id ? { ...item, enabled } : item
                ),
              }
            : { defaultEnabled: enabled }),
        },
      };
    }
    if (request.action === 'open-site-developer') {
      if (request.url)
        developerWindows.open(event, request.id, request.url, request.hookId);
      return;
    }
    if (targetGroup && (!contents || contents.isDestroyed())) {
      const origin = siteOrigin(targetGroup.url);
      if (
        request.action === 'set-site-developer' &&
        origin &&
        origin === request.url
      ) {
        try {
          saveSiteHooks(
            loginProfileKey(targetGroup),
            origin,
            request.developer!,
            () => {
              savedDeveloperErrors.delete(request.id);
              views.forEach((view, id) => {
                const item = configurations.get(id);
                if (
                  item &&
                  loginProfileKey(item) === loginProfileKey(targetGroup) &&
                  siteOrigin(view.webContents.getURL()) === origin
                ) {
                  resetDeveloperState(view.webContents, origin);
                  publish(id, view);
                }
              });
              window.webContents.send('site-developer-library-changed');
              if (request.run && request.developer?.enabled)
                window.webContents.send('browser-tab-request', {
                  action: 'select',
                  id: request.id,
                });
            }
          );
        } catch (error) {
          savedDeveloperErrors.set(request.id, {
            time: Date.now(),
            message: `Could not save developer hooks: ${String(error)}`,
          });
        }
        developerWindows.update();
        return;
      }
      if (request.action === 'ask-hook-ai') {
        window.show();
        window.focus();
        window.webContents.send('browser-hook-ai', request.prompt);
        return;
      }
      if (request.action === 'reload') {
        window.webContents.send('browser-tab-request', {
          action: 'select',
          id: request.id,
        });
        return;
      }
    }
    if (
      (!contents || contents.isDestroyed()) &&
      request.action === 'settings'
    ) {
      Menu.buildFromTemplate([
        { label: 'Extensions', submenu: extensionMenu(window, contents) },
        {
          label: 'Downloads',
          submenu: downloadMenu().length
            ? downloadMenu()
            : [{ label: 'No downloads this run', enabled: false }],
        },
      ]).popup({ window });
      return;
    }
    if (!contents || contents.isDestroyed()) return;
    switch (request.action) {
      case 'toggle-picture-in-picture':
        if (request.id === focusedId && visible.has(request.id) && !suspended)
          pictureInPicture.get(request.id)?.toggle();
        break;
      case 'back':
        if (contents.navigationHistory.canGoBack())
          contents.navigationHistory.goBack();
        break;
      case 'forward':
        if (contents.navigationHistory.canGoForward())
          contents.navigationHistory.goForward();
        break;
      case 'reload':
        if (failures.get(request.id)?.url)
          contents.loadURL(failures.get(request.id)!.url).catch(() => {});
        else contents.reload();
        break;
      case 'reload-ignore-cache':
        if (failures.get(request.id)?.url)
          contents
            .loadURL(failures.get(request.id)!.url, {
              extraHeaders: 'Cache-Control: no-cache\n',
            })
            .catch(() => {});
        else contents.reloadIgnoringCache();
        break;
      case 'clear-cookies-reload': {
        const url = failures.get(request.id)?.url || contents.getURL();
        clearPageCookies(contents.session, url)
          .then(() => {
            if (
              !contents.isDestroyed() &&
              views.get(request.id)?.webContents === contents
            )
              command(event, { id: request.id, action: 'reload-ignore-cache' });
            return undefined;
          })
          .catch(() => {});
        break;
      }
      case 'reload-menu': {
        const { shortcuts } = getBrowserPreferences();
        Menu.buildFromTemplate([
          {
            label: 'Reload',
            type: 'checkbox',
            checked: true,
            accelerator: menuAccelerator(shortcuts.reload[0]),
            registerAccelerator: false,
            click: () => command(event, { id: request.id, action: 'reload' }),
          },
          {
            label: 'Refresh (Ignore Cache)',
            accelerator: menuAccelerator(shortcuts['reload-ignore-cache'][0]),
            registerAccelerator: false,
            click: () =>
              command(event, { id: request.id, action: 'reload-ignore-cache' }),
          },
          { type: 'separator' },
          {
            label: 'Clear Cookies and Refresh',
            enabled: /^https?:/.test(
              failures.get(request.id)?.url || contents.getURL()
            ),
            click: () =>
              command(event, {
                id: request.id,
                action: 'clear-cookies-reload',
              }),
          },
        ]).popup({ window });
        break;
      }
      case 'stop':
        contents.stop();
        if (!loaded.has(request.id)) {
          failures.set(request.id, {
            message: 'Loading was stopped',
            code: -3,
            url: contents.getURL() || configurations.get(request.id)?.url || '',
          });
          publish(request.id, views.get(request.id)!);
        }
        break;
      case 'ask-hook-ai':
        window.show();
        window.focus();
        window.webContents.send('browser-hook-ai', request.prompt);
        break;
      case 'set-site-developer':
      case 'clear-site-developer-logs': {
        const origin = siteOrigin(contents.getURL());
        if (!origin || origin !== request.url) break;
        const profile = loginProfileKey(
          configurations.get(request.id) || ({} as IApp)
        );
        try {
          if (request.action === 'clear-site-developer-logs') {
            clearDeveloperLogs(contents, origin);
            break;
          }
          saveSiteHooks(profile, origin, request.developer!, () => {
            window.webContents.send('site-developer-library-changed');
            views.forEach((view, id) => {
              if (
                view.webContents.session === contents.session &&
                siteOrigin(view.webContents.getURL()) === origin
              ) {
                resetDeveloperState(view.webContents, origin);
                publish(id, view);
              }
            });
            if (request.run && request.developer?.enabled) contents.reload();
          });
        } catch (error) {
          developerSaveError(
            contents,
            origin,
            `Could not save developer hooks: ${String(error)}`
          );
        }
        break;
      }
      case 'set-permission':
      case 'reset-permissions': {
        const origin = siteOrigin(contents.getURL());
        if (!origin || origin !== request.url) break;
        const profile = loginProfileKey(
          configurations.get(request.id) || ({} as IApp)
        );
        const latest = getSiteSettings(profile, origin);
        if (request.action === 'set-permission') {
          if (
            !request.permission ||
            !(['ask', 'allow', 'block'] as unknown[]).includes(request.choice)
          )
            break;
          if (
            !sitePermissions.some(
              ([permission]) => permission === request.permission
            ) &&
            !Object.prototype.hasOwnProperty.call(
              latest.permissions,
              request.permission
            )
          )
            break;
          updateSiteSettings(profile, origin, {
            permissions: {
              ...latest.permissions,
              [request.permission]: request.choice!,
            },
          });
        } else updateSiteSettings(profile, origin, { permissions: {} });
        views.forEach((view, id) => {
          if (
            view.webContents.session === contents.session &&
            siteOrigin(view.webContents.getURL()) === origin
          )
            publish(id, view);
        });
        break;
      }
      case 'media-play-pause':
      case 'media-previous':
      case 'media-next': {
        const keyCode = {
          'media-play-pause': 'MediaPlayPause',
          'media-previous': 'MediaPreviousTrack',
          'media-next': 'MediaNextTrack',
        }[request.action];
        if (request.action === 'media-play-pause') {
          // Chromium does not apply synthetic media keys to ordinary HTML media.
          for (const frame of contents.mainFrame.framesInSubtree) {
            frame.executeJavaScript(`(async () => {
              const media = [...document.querySelectorAll('audio, video')];
              const playing = media.filter(item => !item.paused && !item.ended);
              if (playing.length) playing.forEach(item => item.pause());
              else {
                const item = media.find(item => item.currentTime > 0) || media[0];
                if (item) await item.play();
              }
            })()`, true).catch(() => {});
          }
        } else {
          contents.sendInputEvent({ type: 'keyDown', keyCode });
          contents.sendInputEvent({ type: 'keyUp', keyCode });
        }
        break;
      }
      case 'toggle-mute': {
        const origin = siteOrigin(contents.getURL());
        if (!origin || (request.url && request.url !== origin)) break;
        const muted = !contents.isAudioMuted();
        const profile = loginProfileKey(
          configurations.get(request.id) || ({} as IApp)
        );
        updateSiteSettings(profile, origin, { muted });
        views.forEach((view, id) => {
          if (
            view.webContents.session === contents.session &&
            siteOrigin(view.webContents.getURL()) === origin
          ) {
            view.webContents.setAudioMuted(muted);
            publish(id, view);
          }
        });
        break;
      }
      case 'settings': {
        const origin = siteOrigin(contents.getURL());
        if (!origin) break;
        const profile = loginProfileKey(
          configurations.get(request.id) || ({} as IApp)
        );
        const settings = getSiteSettings(profile, origin);
        const certificateError = certificateErrorFor(contents.session, origin);
        const secure = origin.startsWith('https:') && !certificateError;
        const permissions = new Map<string, string>(sitePermissions);
        Object.keys(settings.permissions).forEach((permission) => {
          if (!permissions.has(permission))
            permissions.set(permission, permission.replace(/-/g, ' '));
        });
        Menu.buildFromTemplate([
          { label: new URL(origin).host, enabled: false },
          {
            label: secure
              ? 'Connection uses HTTPS'
              : 'Connection is not secure',
            click: () => {
              showBrowserDialog(window, {
                message: secure
                  ? 'Connection uses HTTPS'
                  : 'Connection is not secure',
                detail: secure
                  ? `${origin} uses TLS to encrypt its connection. This does not guarantee the website is trustworthy.`
                  : certificateError
                  ? `${origin} has an invalid TLS certificate (${certificateError}). The website’s identity could not be verified.`
                  : `${origin} uses HTTP. Information you send can be read or changed in transit.`,
                buttons: ['Done'],
              });
            },
          },
          { type: 'separator' },
          ...(getBrowserPreferences().permissions === 'block'
            ? [
                {
                  label: 'All permissions blocked in browser settings',
                  enabled: false,
                },
              ]
            : []),
          {
            label: 'Permissions',
            submenu: [...permissions].map(([permission, label]) => ({
              label,
              submenu: (['ask', 'allow', 'block'] as PermissionChoice[]).map(
                (choice) => ({
                  label: { ask: 'Ask', allow: 'Allow', block: 'Block' }[choice],
                  type: 'radio' as const,
                  checked:
                    (settings.permissions[permission] || 'ask') === choice,
                  click: () => {
                    const latest = getSiteSettings(profile, origin);
                    updateSiteSettings(profile, origin, {
                      permissions: {
                        ...latest.permissions,
                        [permission]: choice,
                      },
                    });
                  },
                })
              ),
            })),
          },
          {
            label: nativeMenuLabels.resetPermissions,
            click: () =>
              updateSiteSettings(profile, origin, { permissions: {} }),
          },
          {
            label: nativeMenuLabels.reloadToApplyPermissionChanges,
            click: () => contents.reload(),
          },
          { type: 'separator' },
          {
            label: contents.isAudioMuted()
              ? nativeMenuLabels.unmuteSite
              : nativeMenuLabels.muteSite,
            click: () =>
              command(event, { id: request.id, action: 'toggle-mute' }),
          },
          {
            label: nativeMenuLabels.clearSessionSiteData,
            click: () =>
              command(event, { id: request.id, action: 'clear-data' }),
          },
        ]).popup({ window });
        break;
      }
      case 'menu':
        Menu.buildFromTemplate([
          {
            label: nativeMenuLabels.findInPage,
            accelerator: 'CmdOrCtrl+F',
            click: () => window.webContents.send('browser-shortcut', 'find'),
          },
          {
            label: nativeMenuLabels.print,
            accelerator: 'CmdOrCtrl+P',
            click: () => contents.print(),
          },
          {
            label: 'Zoom',
            submenu: [
              {
                label: nativeMenuLabels.zoomIn,
                click: () =>
                  contents.setZoomLevel(
                    Math.min(5, contents.getZoomLevel() + 0.5)
                  ),
              },
              {
                label: nativeMenuLabels.zoomOut,
                click: () =>
                  contents.setZoomLevel(
                    Math.max(-5, contents.getZoomLevel() - 0.5)
                  ),
              },
              {
                label: nativeMenuLabels.actualSize,
                click: () => contents.setZoomLevel(0),
              },
            ],
          },
          { type: 'separator' },
          { label: 'Extensions', submenu: extensionMenu(window, contents) },
          {
            label: 'Downloads',
            submenu: downloadMenu().length
              ? downloadMenu()
              : [{ label: 'No downloads this run', enabled: false }],
          },
          {
            label: nativeMenuLabels.clearSessionSiteData,
            click: () =>
              command(event, { id: request.id, action: 'clear-data' }),
          },
        ]).popup({ window });
        break;
      case 'print':
        contents.print();
        break;
      case 'zoom-in':
        contents.setZoomLevel(Math.min(5, contents.getZoomLevel() + 0.5));
        break;
      case 'zoom-out':
        contents.setZoomLevel(Math.max(-5, contents.getZoomLevel() - 0.5));
        break;
      case 'zoom-reset':
        contents.setZoomLevel(0);
        break;
      case 'find':
        if (request.url) contents.findInPage(request.url);
        else contents.stopFindInPage('clearSelection');
        break;
      case 'clear-data': {
        const currentTarget = () =>
          !window.isDestroyed() &&
          event.sender === window.webContents &&
          event.senderFrame === window.webContents.mainFrame &&
          views.get(request.id)?.webContents === contents &&
          !contents.isDestroyed();
        showBrowserDialog(window, {
          message: 'Clear cookies and site data for this session?',
          detail: 'You will be signed out of all tabs in this session.',
          buttons: ['Cancel', 'Clear data'],
          cancelId: 0,
          defaultId: 0,
        })
          .then(async (answer) => {
            if (answer.response === 1 && currentTarget()) {
              await clearSessionSiteData(contents.session);
              if (currentTarget()) contents.reload();
            }
            return undefined;
          })
          .catch(() => {});
        break;
      }
      case 'navigate':
        if (request.url && openHookInstallLink(request.url, window)) break;
        if (request.url && validURL(request.url))
          contents.loadURL(request.url).catch(() => {});
        break;
      default:
        break;
    }
  };
  let checkingIdle = false;
  const discardTimer = setInterval(() => {
    if (checkingIdle || suspended || window.isDestroyed()) return;
    const preferences = getBrowserPreferences();
    if (!preferences.discardInactiveTabs) return;
    const threshold = preferences.discardAfterMinutes * 60000;
    if (!Number.isFinite(threshold) || threshold < 60000) return;
    checkingIdle = true;
    const candidate = [...views].find(([id, view]) => {
      const hidden = hiddenSince.get(id);
      const contents = view.webContents;
      return (
        hidden !== undefined &&
        Date.now() - hidden >= threshold &&
        !visible.has(id) &&
        focusedId !== id &&
        !(
          preferences.keepPinnedTabsAwake &&
          configurations.get(id)?.pinned !== false
        ) &&
        !(
          preferences.keepFavoriteTabsAwake && configurations.get(id)?.favorite
        ) &&
        !excludedFromSleep(
          contents.getURL(),
          preferences.discardExcludedSites
        ) &&
        !edited.has(id) &&
        !playingMedia.has(id) &&
        !pictureInPicture.get(id)?.state.active &&
        !popups.get(id)?.size &&
        !contents.isDestroyed() &&
        !contents.isLoading() &&
        !contents.isCurrentlyAudible() &&
        !hasActiveDownloads(contents.session) &&
        !contents.isDevToolsOpened()
      );
    });
    if (!candidate) {
      checkingIdle = false;
      return;
    }
    const [id, view] = candidate;
    const contents = view.webContents;
    const state = lastStates.get(id);
    const inspectedUrl = contents.getURL();
    const candidateHiddenSince = hiddenSince.get(id);
    const permissions = state?.siteSettings?.permissions || {};
    if (
      ['media', 'camera', 'microphone', 'display-capture'].some(
        (permission) => permissions[permission] === 'allow'
      )
    ) {
      hiddenSince.set(id, Date.now());
      checkingIdle = false;
      return;
    }
    // eslint-disable-next-line no-void
    void inspectDiscardCandidate(contents)
      .then((scroll) => {
        if (
          !scroll ||
          suspended ||
          visible.has(id) ||
          focusedId === id ||
          views.get(id) !== view ||
          edited.has(id) ||
          playingMedia.has(id) ||
          pictureInPicture.get(id)?.state.active ||
          contents.isDestroyed() ||
          contents.isCurrentlyAudible() ||
          contents.isLoading() ||
          hasActiveDownloads(contents.session) ||
          !getBrowserPreferences().discardInactiveTabs ||
          (getBrowserPreferences().keepPinnedTabsAwake &&
            configurations.get(id)?.pinned !== false) ||
          (getBrowserPreferences().keepFavoriteTabsAwake &&
            Boolean(configurations.get(id)?.favorite)) ||
          excludedFromSleep(
            contents.getURL(),
            getBrowserPreferences().discardExcludedSites
          ) ||
          contents.getURL() !== inspectedUrl ||
          hiddenSince.get(id) !== candidateHiddenSince ||
          Date.now() - (candidateHiddenSince || 0) <
            getBrowserPreferences().discardAfterMinutes * 60000 ||
          contents.isDevToolsOpened() ||
          Boolean(popups.get(id)?.size)
        ) {
          hiddenSince.set(id, Date.now());
          return undefined;
        }
        const item = configurations.get(id);
        if (!item) return undefined;
        unloadTab(id, view, scroll);
        return undefined;
      })
      .catch(() => {
        hiddenSince.set(id, Date.now());
      })
      .finally(() => {
        checkingIdle = false;
      });
  }, 60000);
  discardTimer.unref?.();
  let disposed = false;
  const attachAI = () =>
    registerAI(window, {
      settingsWindow: (contents) => isAISettingsWindow?.(contents) || false,
      tabs: () =>
        [...configurations.values()].filter(
          (item) => !isGroupLocked(item) && !removals.blocks(item)
        ),
      focused: () => focusedId,
      activityBounds: (id) => {
        const view = views.get(id);
        return view?.getVisible() ? view.getBounds() : undefined;
      },
      contents: (id) => {
        const item = configurations.get(id);
        return item && !isGroupLocked(item) && !removals.blocks(item)
          ? views.get(id)?.webContents
          : undefined;
      },
      createTab: (item, signal) =>
        aiNewTabs.request(item.id, signal, () => {
          if (removals.blocks(item))
            throw new Error('This group is being removed.');
          (focusedId ? hostFor(focusedId) : window).webContents.send(
            'browser-tab-request',
            {
              action: 'create',
              app: item,
            }
          );
        }),
      prepareClose: (contents) => {
        const sourceURL = contents.getURL();
        let used = false;
        const permit = (event: Event) => {
          if (
            !used &&
            !contents.isDestroyed() &&
            contents.getURL() === sourceURL
          ) {
            used = true;
            event.preventDefault();
          }
        };
        approvedAIClose.add(contents);
        contents.on('will-prevent-unload', permit);
        return () => {
          approvedAIClose.delete(contents);
          contents.removeListener('will-prevent-unload', permit);
        };
      },
      downloads: getDownloadsForContents,
      downloadAction: controlTabDownload,
    });
  // Tabs and chrome are usable while Keychain initializes. Do not construct
  // encrypted AI stores until initialization (or the user's decline) finishes.
  let disposeAI: (() => void) | undefined;
  if (storageReady) {
    storageReady
      .then(() => {
        if (!disposed && !window.isDestroyed()) disposeAI = attachAI();
        return undefined;
      })
      .catch((error) => log.error('AI startup failed.', error));
  } else disposeAI = attachAI();
  const disposeCapture = registerPageCapture(window, (id) => {
    const item = configurations.get(id);
    return item && !isGroupLocked(item) && !removals.blocks(item)
      ? views.get(id)?.webContents
      : undefined;
  });
  if (!privateMode)
    registerHookMarketplace(window, () =>
      [...configurations].flatMap(([id, item]) => {
        if (item.archived || isGroupLocked(item) || removals.blocks(item))
          return [];
        const url = views.get(id)?.webContents.getURL() || item.url;
        if (!siteOrigin(url)) return [];
        return [
          {
            id,
            name: item.name,
            groupName: item.sessionName || item.name,
            groupId: aiGroupId(item),
            profile: loginProfileKey(item),
            url,
          },
        ];
      }),
      { openSiteEditor: (target, hookId) => {
        developerWindows.open({ sender: window.webContents } as IpcMainEvent, target.id, new URL(target.url).origin, hookId);
      } }
    );
  developerWindows = privateMode
    ? ({ update() {}, dispose() {}, open() {} } as unknown as ReturnType<
        typeof registerSiteDeveloperWindows
      >)
    : registerSiteDeveloperWindows(
        (id) => {
          const contents = views.get(id)?.webContents;
          const config = configurations.get(id);
          if (!config || isGroupLocked(config)) return undefined;
          const live =
            contents && !contents.isDestroyed() ? contents : undefined;
          const pageURL = live?.getURL() || config.url;
          const origin = siteOrigin(pageURL);
          if (!origin) return undefined;
          return {
            contents: live,
            profile: loginProfileKey(config),
            groupId: groupKey(config),
            state: {
              origin,
              groupName: config.sessionName || config.name,
              pageURL,
              available: true,
              developer: live
                ? developerState(live, origin)
                : {
                    config: getSiteSettings(loginProfileKey(config), origin)
                      .developer || {
                      enabled: false,
                      before: '',
                      after: '',
                      css: '',
                    },
                    revisions: getSiteSettings(loginProfileKey(config), origin)
                      .hookRevisions,
                    notifications: hookNotifications().permissions({
                      groupId: groupKey(config),
                      profile: loginProfileKey(config),
                      scope: personalDataScope(config),
                      origin,
                      config: effectiveHookConfig(
                        loginProfileKey(config),
                        pageURL
                      ),
                    }),
                    status: savedDeveloperErrors.has(id) ? 'error' : 'waiting',
                    logs: savedDeveloperErrors.has(id)
                      ? [
                          {
                            time: savedDeveloperErrors.get(id)!.time,
                            level: 'error',
                            message: savedDeveloperErrors.get(id)!.message,
                          },
                        ]
                      : [],
                  },
            },
          };
        },
        command,
        (id, sourceGroup, destination) => {
          if (window.isDestroyed()) return;
          // Renderer-held group metadata survives unloading browser contents.
          window.webContents.send(
            'browser-tab-request',
            destination === 'group'
              ? { action: 'select-group', groupId: sourceGroup }
              : { action: 'select', id }
          );
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        }
      );
  const disposeDeveloperLibrary = privateMode
    ? () => {}
    : registerSiteDeveloperLibrary(
        window,
        () =>
          [...configurations.values()].filter((item) => !removals.blocks(item)),
        (id) => views.get(id)?.webContents
      );
  const releaseGroupLocks = getGroupLocks().subscribe(() => {
    [...configurations.entries()].forEach(([id, item]) => {
      if (!isGroupLocked(item)) return;
      const view = views.get(id);
      if (view) approvedAIClose.delete(view.webContents);
      close(id);
      configurations.set(id, item);
    });
    websiteTabs.forEach((entry, id) => {
      if (!getGroupLocks().locked(entry.groupId)) return;
      entry.cleanup();
      websiteTabs.delete(id);
      if (!entry.contents.isDestroyed())
        entry.contents.close({ waitForBeforeUnload: false });
      if (!window.isDestroyed()) window.contentView.removeChildView(entry.view);
    });
    developerWindows.update();
  });
  const sync = (event: IpcMainEvent, layout: BrowserLayout) => {
    const source =
      windows?.trusted(event) ||
      (event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame
        ? window
        : undefined);
    if (!source || !isBrowserLayout(layout)) return;
    const chromeFocused = source.webContents.isFocused();
    if (windows) windows.setLayout(source, layout);
    else applyLayout(layout);
    // Reparenting/showing a WebContentsView must not take the first responder
    // away from the sidebar or an address field the user is interacting with.
    if (chromeFocused && !source.webContents.isDestroyed())
      source.webContents.focus();
  };
  const stopWindows = windows?.subscribe(() =>
    applyLayout(windows.mergedLayout())
  );
  const stopRuntime = windows?.attach({
    view: (id) => views.get(id),
    state: (id) => lastStates.get(id),
    chrome: (host) => {
      watchClosing(host);
      const stopGestures = registerSpaceGestures(host);
      gestureCleanup.add(stopGestures);
      onWindowClosed(host, () => {
        stopGestures();
        gestureCleanup.delete(stopGestures);
      });
      keyboard(host.webContents);
      const capture = registerPageCapture(host, (id) =>
        windows.allows(host, id) ? views.get(id)?.webContents : undefined
      );
      const library = privateMode
        ? () => {}
        : registerSiteDeveloperLibrary(
            host,
            () =>
              [...configurations.values()].filter((item) =>
                windows.allows(host, item.id)
              ),
            (id) =>
              windows.allows(host, id) ? views.get(id)?.webContents : undefined
          );
      onWindowClosed(host, () => {
        capture();
        library();
      });
    },
  });
  ipcMain.on('browser-sync', sync);
  ipcMain.on('browser-command', command);
  const disposeGroupRemoval = privateMode
    ? () => {}
    : registerGroupRemoval(
        window,
        (id) => configurations.get(id),
        (source) => {
          return (
            [...views.entries()].every(([id, view]) => {
              const item = configurations.get(id);
              return (
                !item ||
                !sameRemovalGroup(item, source) ||
                view.webContents.isDestroyed()
              );
            }) &&
            [...popups.entries()].every(([id, entries]) => {
              return [...entries].every((popup) => {
                const item = popupSources.get(popup) || configurations.get(id);
                return (
                  !item ||
                  !sameRemovalGroup(item, source) ||
                  popup.isDestroyed()
                );
              });
            }) &&
            [...websiteTabs.values()].every(
              (entry) =>
                !sameRemovalGroup(entry.source, source) ||
                entry.contents.isDestroyed()
            )
          );
        },
        (profile) => {
          return (
            [...views.entries()].every(
              ([id, view]) =>
                loginProfileKey(configurations.get(id) || ({} as IApp)) !==
                  profile || view.webContents.isDestroyed()
            ) &&
            [...popups.entries()].every(([id, entries]) =>
              [...entries].every((popup) => {
                const item = popupSources.get(popup) || configurations.get(id);
                return (
                  !item ||
                  loginProfileKey(item) !== profile ||
                  popup.isDestroyed()
                );
              })
            ) &&
            [...websiteTabs.values()].every(
              (entry) =>
                loginProfileKey(entry.source) !== profile ||
                entry.contents.isDestroyed()
            )
          );
        }
      );
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (privateMode) clearPrivateSiteSettings(privateProfilePrefix);
    faviconResolver.clear();
    disposeGroupRemoval();
    stopWindows?.();
    stopRuntime?.();
    disposeAI?.();
    disposeCapture();
    developerWindows.dispose();
    disposeDeveloperLibrary();
    releaseGroupLocks();
    aiNewTabs.dispose();
    releaseExtensionOwner(window);
    clearInterval(discardTimer);
    pictureInPicture.forEach((controller) => controller.dispose());
    pictureInPicture.clear();
    gestureCleanup.forEach((cleanup) => cleanup());
    keyboardCleanup.forEach((cleanup) => cleanup());
    pendingTabCleanup.forEach((cleanup) => cleanup());
    window.removeListener('closed', dispose);
    ipcMain.removeListener('browser-sync', sync);
    ipcMain.removeListener('browser-command', command);
    websiteTabs.forEach(({ contents, cleanup }) => {
      cleanup();
      if (!contents.isDestroyed()) contents.close();
    });
    websiteTabs.clear();
    websiteTabRecovery.clear();
    views.forEach((view) => {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    });
    popups.forEach((owned) =>
      owned.forEach((popup) => {
        if (!popup.isDestroyed()) popup.close();
      })
    );
    popups.clear();
    views.clear();
  };
  onWindowClosed(window, dispose);
  return dispose;
}
