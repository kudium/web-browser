import { observeSidebarHoverEdge } from './sidebarHoverEdge';
import { ProjectWorkspaceSync } from './projectWorkspaceSync';
import { activeNoteFor, sameActiveNote } from './activeNote';
import { captureSelectedText } from './selectionCapture';
import { savePageSelection } from './pageSelection';
import { registerTranslationPage, translationMenu, pageTranslationState, translationAction } from './pageTranslation';
import { readFormContextState } from './formContextMenu';
import { PageDevTools } from './pageDevTools';
import { showAppToast } from './appToast';
import { registerEnergySaver } from './energySaver';
import { NativeTooltip } from './nativeTooltip';
import { createSidebarMediaSession } from './sidebarMediaSession';
import { extractWebsitePrimaryColor } from '../utils/websiteTheme';
import { createWebsitePrimaryColorCache } from '../utils/websitePrimaryColorCache';
import { captureTabShortcuts } from './tabShortcutCapture';
import { hookActionMenu } from './hookActions';
/* Native menus and commands deliberately resolve their current host window. */
/* eslint no-shadow: ["error", {"allow": ["window"]}] */
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import log from 'electron-log';
import {
  BrowserWindow,
  clipboard,
  Input,
  Event,
  WebContents,
  IpcMainEvent,
  ipcMain,
  Menu,
  nativeTheme,
  WebContentsView,
  RestoreOptions,
} from 'electron';
import {
  certificateErrorFor,
  allowWebsiteCertificateErrors,
} from './websiteCertificates';
import { effectiveHookConfig, enableGlobalHookForRun } from './globalHooks';
import { registerHookMarketplace, openHookInstallLink } from './hookMarketplace';
import { aiGroupId } from '../browser/aiGroups';
import { projectFileNavigation } from './projectFileNavigation';
import { onWindowClosed } from './windowLifecycle';
import { suspendSidebarPanels, setSidebarPanelSession, sidebarPanelHostFor } from './sidebarPanels';
import { extensionDocumentId, assertExtensionDocument } from './extensionDocuments';
import { extensionCreatedTab } from '../browser/extensionTabs';
import { extensionActiveTab } from './extensionSidePanels';
import { registerExtensionWorkspace } from './extensionWorkspaceGroups';
import { presentSnapshots, captureNativeViewSnapshots } from './snapshotPresentation';
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
  autoLoginMenu,
  personalDataFormActions,
  personalDataFormAvailable,
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
  loginProfileKey as storedProfileKey, profilePartition } from '../utils/groups';

import {
  waitForBrowserNetwork,
  contentPreferences,
} from './advancedPreferences';
import { siteRule } from '../browser/advancedPreferences';
import { registerAI } from './ai';
import { isPrivateSession } from './privateSessions';
import { registerPageCapture } from './pageCapture';
import { registerEmailBrowserDetection } from './emailBrowserDetection';
import { AINewTabs } from './aiTabs';
import { getBrowserWindows } from './browserWindows';
import { WebsiteTabRecovery } from './websiteTabRecovery';
import { PictureInPictureController } from './pictureInPicture';
import { cleanLink } from '../utils/cleanLink';
import { browserProtection } from './browserProtection';
import { configureScreenSharing } from './screenSharing';
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
import { registerTaskSource } from './taskManager';
import type { BrowserTask } from '../browser/taskManager';
import { newPageTab } from '../utils/tabMetadata';
import { showBrowserContextMenu, fillFormMenu } from './browserContextMenu';
import { showBrowserDialog, permissionSummary } from './dialogs';
import {
  applyBrowserPreferences,
  enablePagePinchZoom,
  getBrowserPreferences,
  onBrowserPreferencesChanged,
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
  const hostContents = window.webContents;
  const removals = getGroupRemovalJournal();
  const windows = getBrowserWindows(window);
  const privateMode = isPrivateSession(window.webContents.session);
  const privateProfilePrefix = `private:${window.id}:`;
  const loginProfileKey = (item: IApp) => privateMode
    ? `${privateProfilePrefix}${storedProfileKey(item)}`
    : storedProfileKey(item);
  const hostFor = (id: string) => windows?.host(id) || window;
  const activityLayoutChanges = new EventEmitter();
  const removeView = (view: WebContentsView) => {
    if (windows) windows.remove(view); else if (!window.isDestroyed()) window.contentView.removeChildView(view);
    activityLayoutChanges.emit('change');
  };
  const stateSignatures = new Map<string, string>();
  const resetStateSignatures = () => stateSignatures.clear();
  window.webContents.on('did-start-loading', resetStateSignatures);
  const sendState = (state: BrowserState) => {
    if (windows) return windows.updateState(state);
    const signature = JSON.stringify(state);
    if (stateSignatures.get(state.id) === signature) return;
    stateSignatures.set(state.id, signature);
    window.webContents.send('browser-state', state);
  };
  let developerWindows: ReturnType<typeof registerSiteDeveloperWindows>;
  let synchronizingExtensions = false;
  const groupMutations = new Map<string, { window: BrowserWindow; changes: { id: string; changes: Partial<IApp> }[]; additions: IApp[]; finish(error?: string): void }>();
  // The renderer owns the workspace: group edits round-trip through it and
  // resolve once it confirms the save (extension tab groups and AI share this).
  const updateGroupTabs = (owner: BrowserWindow, changes: { id: string; changes: Partial<IApp> }[], additions: IApp[] = []) =>
    new Promise<void>((resolve, reject) => {
      const mutationId = randomUUID();
      const timer = setTimeout(() => { groupMutations.delete(mutationId); reject(new Error('The workspace did not save the group change')); }, 10000);
      groupMutations.set(mutationId, { window: owner, changes, additions, finish(error) { clearTimeout(timer); error ? reject(new Error(error)) : resolve(); } });
      owner.webContents.send('browser-tab-request', { action: 'extension-group-update', mutationId, groupChanges: changes, groupAdditions: additions });
    });
  const releaseExtensionWorkspace = privateMode ? () => {} : registerExtensionWorkspace({
    apps: () => [...configurations.values()],
    contents: (id) => views.get(id)?.webContents,
    window: (id) => hostFor(id),
    profile: (session) => [...configurations.values()].map(loginProfileKey).find((id) => getExtensionProfile(id)?.session === session),
    assertAccess: (app) => {
      if (isGroupLocked(app) || removals.blocks(app)) throw new Error('Unlock this group before changing it');
    },
    update: (owner, changes) => updateGroupTabs(owner, changes),
  });
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
  const pageDevTools = new PageDevTools(contents => {
    const found = [...views].find(([, view]) => view.webContents === contents);
    if (found && !contents.isDestroyed()) publish(found[0], found[1]);
  }, (contents, view) => {
    const found=[...views].find(([,tab])=>tab.webContents===contents);
    if(!found) throw new Error('Website tab is unavailable.');
    const owner=hostFor(found[0]), host=sidebarPanelHostFor(owner);
    if(!host) throw new Error('Panel host is unavailable.');
    const id=`page-devtools-${contents.id}`;
    host.register({info:{id,title:'Developer Tools',detail:contents.getTitle() || contents.getURL(),kind:'feature'},contentKey:String(contents.id),
      available:()=>!contents.isDestroyed() && !!configurations.get(found[0]) && !isGroupLocked(configurations.get(found[0])!),
      createView:()=>view, manage:()=>showPageDevToolsMenu(contents,owner)});
    host.activate(id,true);
    return ()=>host.remove(id);
  }, (view, owner) => { observeSidebarHoverEdge(view, owner, host => windows ? windows.isSidebarHidden(host) : sidebarHidden && !suspended); });
  window.once('closed', () => pageDevTools.dispose());
  const savedDeveloperErrors = new Map<
    string,
    { time: number; message: string }
  >();
  const keyboardCleanup = new Set<() => void>();
  const keyboardMenuResets = new Set<() => void>();
  window.on('blur', () => {
    keyboardMenuResets.forEach(reset => reset());
    if (!window.isDestroyed())
      window.webContents.send('browser-shortcut', 'tab-switcher-cancel');
  });
  const pendingTabCleanup = new Set<() => void>();
  const keyboard = (
    contents: WebContents,
    dataScope: () => string | undefined = () => undefined
  ) => {
    if (!privateMode && contents !== window.webContents) {
      registerPasswordPage(contents, dataScope);
      registerTranslationPage(contents, () => !getGroupLocks().locked((dataScope() || '').replace(/^group:/, '')), () => { for (const [id, view] of views) if (view.webContents === contents) publish(id, view); }, (title, message, type) => { void showAppToast(window, {id:`page-translation-${contents.id}`, title, message, type}).catch(() => {}); });
    }
    const stopCapture = captureTabShortcuts(contents);
    const resetMenuShortcuts = () => {
      if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(false);
    };
    keyboardMenuResets.add(resetMenuShortcuts);
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
        resetMenuShortcuts();
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
        // Keep modifier releases flowing; the isolated DOM listener consumes
        // page navigation and menu suppression prevents a duplicate accelerator.
        contents.setIgnoreMenuShortcuts(true);
        host.webContents.send(
          'browser-shortcut',
          action === 'next-tab' ? 'tab-switcher-next' : 'tab-switcher-previous'
        );
        return;
      }
      if (action && contents !== window.webContents) {
        if (action === 'page-devtools') {
          event.preventDefault();
          pageDevTools.toggle(contents);
          return;
        }
        if (action === 'copy-clean-link') {
          event.preventDefault();
          if (validURL(contents.getURL())) clipboard.writeText(cleanLink(contents.getURL()));
          return;
        }
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
      stopCapture();
      resetMenuShortcuts();
      keyboardMenuResets.delete(resetMenuShortcuts);
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
  let pipVisible = new Set<string>();
  let suspended = false;
  let sidebarHidden = false;
  let autoPiPEnabled = getBrowserPreferences().automaticPictureInPicture;
  const linkPreviews = new Map<BrowserWindow, { tooltip: NativeTooltip; tabId?: string }>();
  const hideLinkPreview = (id?: string) => {
    linkPreviews.forEach(entry => { if (!id || entry.tabId === id) { entry.tooltip.hide(); entry.tabId = undefined; } });
  };
  const stopPiPPreferences = onBrowserPreferencesChanged?.(() => {
    if (!getBrowserPreferences().showLinkPreview) hideLinkPreview();
    const enabled = getBrowserPreferences().automaticPictureInPicture;
    if(enabled === autoPiPEnabled)return;
    autoPiPEnabled=enabled;
    pictureInPicture.forEach((controller,id) => controller.visibilityChanged(pipVisible.has(id),enabled).catch(() => {}));
  });
  let pendingOverlay: BrowserLayout | undefined;
  let overlayGeneration = 0;
  const playingMedia = new Set<string>();
  const sidebarMediaSessions = new Map<string, ReturnType<typeof createSidebarMediaSession>>();
  const icons = new Map<string, string>();
  const themeColors = new WeakMap<WebContents, string>();
  const primaryColorCache = createWebsitePrimaryColorCache();
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
    const showing = visible.has(id) && !suspended && !failure && !initialLoading;
    if (view.getVisible() !== showing) view.setVisible(showing);
    const origin = siteOrigin(contents.getURL());
    const profile = loginProfileKey(configurations.get(id) || ({} as IApp));
    const state: BrowserState = {
      id,
      translation: pageTranslationState(contents),
      devToolsDock: pageDevTools.mode(contents),
      devToolsFraction: pageDevTools.fraction(contents),
      siteSettings: origin
        ? {
            origin,
            protection: {enabled: getBrowserPreferences().advanced.adBlocking && !getBrowserPreferences().advanced.trackingExceptions.includes(origin) && getSiteSettings(profile,origin).adBlocking !== false,
              globallyEnabled: getBrowserPreferences().advanced.adBlocking && !getBrowserPreferences().advanced.trackingExceptions.includes(origin),
              blocked: browserProtection().count(contents.id), status:browserProtection().status()},
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
      sidebarMediaEligible: sidebarMediaSessions.get(id)?.eligible ?? false,
      pictureInPicture: pictureInPicture.get(id)?.state,
      extensionContext: {
        profile: profilePartition(loginProfileKey(
          configurations.get(id) || ({} as IApp)
        )),
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
    activityLayoutChanges.emit('change');
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
    hideLinkPreview(id);
    websiteTabRecovery.close(id, configurations.get(id)?.restorationId);
    const view = views.get(id);
    if (view) {
      removeView(view);
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
      sidebarMediaSessions.get(id)?.dispose();
      sidebarMediaSessions.delete(id);
      playingMedia.delete(id);
      pictureInPicture.get(id)?.dispose();
      pictureInPicture.delete(id);
    }
    configurations.delete(id);
    hiddenSince.delete(id);
    edited.delete(id);
    sleeping.delete(id);
    lastStates.delete(id);
    stateSignatures.delete(id);
    windows?.forgetState(id);
    failures.delete(id);
    loaded.delete(id);
  };
  const workspaceSync = privateMode ? undefined : new ProjectWorkspaceSync(() =>
    [...configurations.values()].filter((item) => !removals.blocks(item) && !isGroupLocked(item))
  );
  const workspaceFor = (host: BrowserWindow) => workspaceSync ? {
    sync: workspaceSync,
    update: (changes: { id: string; changes: Partial<IApp> }[], additions: IApp[] = []) => {
      for (const patch of changes) {
        const current = configurations.get(patch.id);
        if (!current || hostFor(patch.id) !== host || isGroupLocked(current) || removals.blocks(current))
          throw new Error('This group is no longer available.');
      }
      return updateGroupTabs(host, changes, additions);
    },
  } : undefined;
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
      const snapshots = [...new Set([...visible, ...previewIds])].map(id => {
        const view = views.get(id);
        if (!view) return Promise.resolve([]);
        const inspector = visible.has(id) ? pageDevTools.snapshotView(view.webContents, hostFor(id)) : undefined;
        return captureNativeViewSnapshots(id, [{view}, ...(inspector ? [{view:inspector, surface:'devtools' as const}] : [])], {previewOnly: !visible.has(id)});
      });
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
            frames.flat().filter(
              (frame): frame is NonNullable<typeof frame> =>
                !!frame &&
                !!configurations.get(frame.id) &&
                !isGroupLocked(configurations.get(frame.id)!)
            ),
            undefined,
            80,
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
    if (layout.suspended || focusedId !== layout.focusedId) hideLinkPreview();
    focusedId = layout.focusedId;
    const wasVisible = pipVisible;
    suspended = Boolean(layout.suspended);
    sidebarHidden = Boolean(layout.sidebarHidden);
    visible = new Set(layout.visible.map((item) => item.id));
    linkPreviews.forEach(entry => { if (entry.tabId && !visible.has(entry.tabId)) hideLinkPreview(entry.tabId); });
    if (!suspended) pictureInPicture.forEach((controller, id) => {
      if (wasVisible.has(id) !== visible.has(id))
        controller.visibilityChanged(visible.has(id), getBrowserPreferences().automaticPictureInPicture).catch(() => {});
    });
    if (!suspended) pipVisible = new Set(visible);
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
          !extensionDocumentId(item.url) &&
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
              ...(!privateMode && !extensionDocumentId(item.url) && { preload: siteDeveloperPreload() }),
              ...(privateMode
                ? { session: window.webContents.session }
                : {
                    partition: profilePartition(loginProfileKey(item)),
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
        // Keep renderer viewport, split panes and captures at the same radius.
        view.setBorderRadius(12);
        views.set(item.id, view);
        if (!adopted) window.contentView.addChildView(view);
        const browserView = view;
        const contents = view.webContents;
        observeSidebarHoverEdge(view, () => hostFor(item.id), host => windows ? windows.isSidebarHidden(host) : sidebarHidden && !suspended);
        contents.on('update-target-url', (_event, url) => {
          if (!url || !getBrowserPreferences().showLinkPreview || url.length > 65536 ||
              !visible.has(item.id) || suspended || isGroupLocked(configurations.get(item.id) || item)) {
            hideLinkPreview(item.id);
            return;
          }
          const owner = hostFor(item.id);
          if (owner.isDestroyed() || !owner.isFocused()) return;
          let preview = linkPreviews.get(owner);
          if (!preview) {
            preview = { tooltip: new NativeTooltip(owner) };
            linkPreviews.set(owner, preview);
            owner.once('closed', () => linkPreviews.delete(owner));
          }
          preview.tabId = item.id;
          const bounds = browserView.getBounds();
          preview.tooltip.update({ id: item.id, label: url,
            anchor: { x: bounds.x, y: bounds.y + bounds.height, width: 0, height: 0 },
            dark: nativeTheme.shouldUseDarkColors,
          }, bounds).catch(() => hideLinkPreview(item.id));
        });
        contents.on('did-start-navigation', () => hideLinkPreview(item.id));
        contents.once('destroyed', () => hideLinkPreview(item.id));

        const mediaSession = createSidebarMediaSession(contents, () => playingMedia.has(item.id), () => publish(item.id, browserView));
        sidebarMediaSessions.set(item.id, mediaSession);
        contents.once('destroyed', () => {
          mediaSession.dispose();
          if (sidebarMediaSessions.get(item.id) === mediaSession) sidebarMediaSessions.delete(item.id);
        });
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
            },
            undefined, window
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
          JSON.stringify([loginProfileKey(item), item.id]),
          loginProfileKey(item)
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
                  const activeContents = extensionActiveTab(getExtensionProfile(profileId)?.api, details.windowId);
                  const activeEntry = [...views].find(([, candidate]) => candidate.webContents === activeContents);
                  const sourceItem = (activeEntry && configurations.get(activeEntry[0])) || configurations.get(item.id) || item;
                  const targetWindow = hostFor(sourceItem.id);
                  if (loginProfileKey(sourceItem) !== profileId)
                    throw new Error('Extension target group is unavailable');
                  if (removals.blocks(sourceItem))
                    throw new Error('This group is being removed.');
                  if (isGroupLocked(sourceItem))
                    throw new Error('Unlock this group before opening tabs.');
                  const url = details.url || sourceItem.url;
                  const extensionPage = Boolean(extensionDocumentId(url));
                  if (!extensionPage && !validURL(url))
                    throw new Error(
                      'This extension requested an unsupported page address.'
                    );
                  if (extensionPage) assertExtensionDocument(url, contents.session);
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
                  targetWindow.webContents.send('browser-tab-request', {
                    action: 'create',
                    background: details.active === false,
                    app: extensionCreatedTab(sourceItem, id, url),
                  });
                  return [await tab, targetWindow];
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
            (!validURL(url) && !extensionDocumentId(url) && url !== 'about:blank') ||
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
                ...(!privateMode && !extensionDocumentId(url) && { preload: siteDeveloperPreload() }),
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
                  },
                  undefined, window
                );
              bindDownloadSource(
                childContents,
                JSON.stringify([loginProfileKey(item), id]),
                loginProfileKey(item)
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
            !extensionDocumentId(url) &&
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
        let contextMenuRevision = 0;
        contents.on('context-menu', async (_, params) => {
          const revision = ++contextMenuRevision;
          const menuURL = contents.getURL();
          const fieldState = !privateMode && personalDataFormAvailable(contents)
            ? await readFormContextState(contents, params.x, params.y)
            : { hasValue: false, formHasValues: false };
          if (revision !== contextMenuRevision || contents.isDestroyed() || contents.getURL() !== menuURL) return;
          const window = hostFor(item.id);
          const appendTarget=activeNoteFor(window.webContents);
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
            privateMode ? [] : [translationMenu(contents), fillFormMenu(autoLoginMenu(window, contents), () => {
                const current = configurations.get(item.id);
                if (window.isDestroyed() || contents.isDestroyed() || !current || isGroupLocked(current)) return;
                window.webContents.send('browser-ai-fill-form', current.id);
              }, personalDataFormActions(contents, params.isEditable, params.x, params.y, fieldState)), ...hookActionMenu(window, contents, params, profileId, () => {
              const current = configurations.get(item.id);
              return current && !isGroupLocked(current)
                ? {
                    groupId: groupKey(current),
                    sourceId: current.id,
                    scope: personalDataScope(current),
                  }
                : undefined;
            })],
            () => { void pageDevTools.open(contents, pageDevTools.mode(contents) || 'right').then(() => { if (!contents.isDestroyed()) contents.inspectElement(params.x, params.y); }).catch(error => console.warn('Could not inspect page', error)); },
            privateMode ? undefined : async (kind, text) => {
              const current = configurations.get(item.id);
              if (!current || contents.isDestroyed() || contents.getURL() !== menuURL || isGroupLocked(current)) return;
              try {
                const captured = params.frameURL && params.frameURL !== menuURL ? undefined : await captureSelectedText(contents, params.selectionText);
                if (contents.isDestroyed() || contents.getURL() !== menuURL || configurations.get(item.id) !== current || isGroupLocked(current)) return;
                if(kind==='append' && !sameActiveNote(appendTarget,activeNoteFor(window.webContents))) throw new Error('The current note changed. Try again.');
                const saved = savePageSelection(kind, captured?.markdown || text, personalDataScope(current), captured?.text,appendTarget);
                if(kind !== 'append') window.webContents.send('open-saved-note',{id:saved.recordId,taskId:'taskId' in saved ? saved.taskId : undefined});
                void showAppToast(window, {id:'selection-saved', title:kind === 'append' ? 'Added to current '+(appendTarget?.kind === 'todo' ? 'to-do list' : 'note') : kind === 'note' ? 'Added to Notes' : 'Added to Today', message:kind === 'append' ? 'Your selected text was appended.' : kind === 'note' ? 'Your selected text was saved as a new note.' : 'Your selected text was added to today’s to-do list.', type:'success', action:{label:kind === 'today' ? 'View task' : 'View note', run:() => { if (!window.isDestroyed()) window.webContents.send('open-saved-note', {id:saved.recordId, taskId:'taskId' in saved ? saved.taskId : undefined}); }}}).catch(() => {});
              } catch (error) {
                void showAppToast(window, {id:'selection-saved',title:'Couldn’t save selection', message:error instanceof Error ? error.message : 'Please try again.',type:'error'}).catch(() => {});
              }
            },
            appendTarget?.kind
          );
        });
        const permissionProfile = profileId;
        configureScreenSharing(contents.session, permissionProfile, requester =>
          BrowserWindow.getAllWindows().find(host => !host.isDestroyed() && host.contentView.children.some(child => 'webContents' in child && child.webContents === requester))
        );
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
        contents.on('audio-state-changed', () => {
          mediaSession.refresh();
          publish(item.id, browserView);
        });
        contents.on('media-started-playing', () => {
          playingMedia.add(item.id);
          mediaSession.refresh();
          publish(item.id, browserView);
        });
        contents.on('media-paused', () => {
          playingMedia.delete(item.id);
          mediaSession.refresh();
          publish(item.id, browserView);
        });
        let themeRevision = 0;
        let themeTarget = contents.getURL();
        const themeContext = () => JSON.stringify([permissionProfile, nativeTheme?.shouldUseDarkColors ? 'dark' : 'light']);
        const useCachedTheme = (url: string) => {
          const cached = primaryColorCache.get(url, themeContext());
          if (cached) themeColors.set(contents, cached);
          else themeColors.delete(contents);
        };
        const applyWebsiteTheme = (color: unknown, url: string) => {
          if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
            primaryColorCache.set(url, color, themeContext());
            themeColors.set(contents, color);
          } else useCachedTheme(url);
        };
        const refreshWebsiteTheme = () => {
          const revision = ++themeRevision;
          const expected = contents.getURL();
          const expectedContext = themeContext();
          if (!/^https?:/.test(expected) || expected !== themeTarget || contents.isDestroyed()) return;
          void contents.mainFrame.executeJavaScript(`(${extractWebsitePrimaryColor.toString()})()`).then((color) => {
            if (contents.isDestroyed() || revision !== themeRevision || contents.getURL() !== expected || themeContext() !== expectedContext) return;
            applyWebsiteTheme(color, expected);
            publish(item.id, browserView);
          }).catch(() => {});
        };
        contents.on('did-change-theme-color', (_, color) => {
          if (contents.getURL() === themeTarget) applyWebsiteTheme(color, themeTarget);
          else useCachedTheme(themeTarget);
          publish(item.id, browserView);
          if (!color && !contents.isLoadingMainFrame()) refreshWebsiteTheme();
        });
        contents.on('did-finish-load', refreshWebsiteTheme);
        contents.on('did-navigate', (_, url) => { themeTarget = url; });
        contents.on('did-navigate-in-page', (_, url, mainFrame) => {
          if (mainFrame) { themeTarget = url; refreshWebsiteTheme(); }
        });
        contents.on('did-redirect-navigation', (_, url, inPlace, mainFrame) => {
          if (mainFrame && !inPlace) {
            themeRevision += 1;
            themeTarget = url;
            useCachedTheme(url);
            publish(item.id, browserView);
          }
        });
        contents.on('did-start-navigation', (_, url, inPlace, mainFrame) => {
          if (mainFrame && !inPlace) {
            themeRevision += 1;
            themeTarget = url;
            mediaSession.reset();
            playingMedia.delete(item.id);
            faviconResolver.cancel(item.id);
            useCachedTheme(url);
            failures.delete(item.id);
            publish(item.id, browserView);
          }
        });
        // Show the document as soon as it is usable; decorative loading UI
        // must never wait for images or other late subresources.
        contents.on('dom-ready', () => {
          if (!failures.has(item.id)) loaded.add(item.id);
          publish(item.id, browserView);
          refreshWebsiteTheme();
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
              const destination = tabResumeURL(current);
              if (extensionDocumentId(destination)) assertExtensionDocument(destination, contents.session);
              return contents.loadURL(destination).catch(() => {});
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
      if (!slot || suspended) pageDevTools.hide(view.webContents);
      const showing = Boolean(slot) && !suspended && !failures.has(item.id) && loaded.has(item.id);
      if (view.getVisible() !== showing) view.setVisible(showing);
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
        const bounds = pageDevTools.layout(view.webContents, hostFor(item.id), {
          x: Math.max(0, Math.round(slot.x)),
          y: Math.max(0, Math.round(slot.y)),
          width: Math.max(0, Math.round(slot.width)),
          height: Math.max(0, Math.round(slot.height)),
        }, !suspended && !failures.has(item.id) && loaded.has(item.id));
        const previousBounds = view.getBounds();
        if (bounds.x !== previousBounds.x || bounds.y !== previousBounds.y ||
          bounds.width !== previousBounds.width || bounds.height !== previousBounds.height)
          view.setBounds(bounds);
      }
      publish(item.id, view);
    });
    workspaceSync?.refresh();
    if (!windows && layout.suspended && layout.nativeOverlayToken !== undefined && !window.isDestroyed())
      window.webContents.send('browser-native-overlay-ready', {surface:'page', token:layout.nativeOverlayToken});
    if (!windows && layout.sidebarOverlay && layout.sidebarOverlayToken !== undefined && !window.isDestroyed())
      window.webContents.send('browser-sidebar-overlay-ready', layout.sidebarOverlayToken);
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
    manual = false,
    force = false,
    completed?: (unloaded: boolean) => void
  ) => {
    const contents = view.webContents;
    const item = configurations.get(id);
    if (!item || contents.isDestroyed() || retiringTabs.has(contents.id)) { completed?.(false); return; }
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
      completed?.(false);
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
      completed?.(true);
      contents.removeListener('will-prevent-unload', prevented);
      retiringTabs.delete(contents.id);
      if (views.get(id) !== view) return;
      pictureInPicture.get(id)?.dispose();
      pictureInPicture.delete(id);
      views.delete(id);
      removeView(view);
      hiddenSince.delete(id);
      edited.delete(id);
      sidebarMediaSessions.get(id)?.dispose();
      sidebarMediaSessions.delete(id);
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
    contents.close({ waitForBeforeUnload: !force });
  };
  const disposeTasks = registerTaskSource({
    owns: (owner) => owner === window || Boolean(windows?.contains(owner)),
    list: () => [...configurations].flatMap(([id, item]) => {
      const contents = views.get(id)?.webContents;
      const live = contents && !contents.isDestroyed();
      const locked = isGroupLocked(item);
      let site = '';
      if (!locked) {
        try { site = new URL(lastStates.get(id)?.url || item.url).hostname; } catch { /* Local page. */ }
      }
      const task: Omit<BrowserTask, 'cpu' | 'memory' | 'shared' | 'canForceEnd' | 'processStarted'> = { id, title: locked ? 'Locked tab' : lastStates.get(id)?.title || item.name || 'Untitled tab',
        site, kind: 'tab' as const,
        status: locked ? 'locked' as const : live ? contents.isCrashed() ? 'stopped' as const : 'running' as const : 'sleeping' as const,
        contentsId: live ? contents.id : null, pid: live ? contents.getOSProcessId() : null,
        canEnd: Boolean(live && !locked && !retiringTabs.has(contents.id) && !removals.blocks(item)),
      };
      const frames: typeof task[] = [];
      if (live && !locked && !contents.isCrashed()) {
        const seen = new Set([task.pid]);
        for (const frame of contents.mainFrame.framesInSubtree) {
          if (frame.detached || frame.osProcessId <= 0 || seen.has(frame.osProcessId)) continue;
          seen.add(frame.osProcessId);
          let frameSite = '';
          try { frameSite = new URL(frame.url).hostname; } catch { /* Non-web frame. */ }
          frames.push({ ...task, id: `frame:${id}:${frame.osProcessId}`, title: `Embedded content — ${task.title}`,
            site: frameSite, pid: frame.osProcessId, kind: 'process', canEnd: false });
        }
      }
      return [task, ...frames];
    }),
    close: (task) => {
      const item = configurations.get(task.id);
      if (!item || isGroupLocked(item) || removals.blocks(item)) return;
      const host = hostFor(task.id);
      if (!host.isDestroyed()) host.webContents.send('browser-tab-request', { action: 'close', id: task.id });
    },
    end: (task) => {
      const view = views.get(task.id);
      if (!view || view.webContents.isDestroyed() || view.webContents.id !== task.contentsId) return;
      const host = hostFor(task.id);
      unloadTab(task.id, view, { x: 0, y: 0 }, true, true);
      if (!host.isDestroyed()) host.webContents.send('browser-tab-request', { action: 'task-ended', id: task.id });
    },
    activate: (task) => {
      const host = hostFor(task.id);
      if (host.isDestroyed()) return;
      if (host.isMinimized()) host.restore();
      host.show(); host.focus();
      host.webContents.send('browser-tab-request', { action: 'select', id: task.id });
    },
  });
  const rootWindow = window;
  const showPageDevToolsMenu = (contents: WebContents, window: BrowserWindow) => {
        Menu.buildFromTemplate((['right', 'bottom', 'panel', 'window'] as const).map(mode => ({
          label: mode === 'window' ? 'Separate window' : mode === 'panel' ? 'Dock in panel' : `Dock ${mode}`,
          type: 'radio' as const,
          checked: pageDevTools.mode(contents) === mode,
          click: () => { void pageDevTools.open(contents, mode).catch(error => console.warn('Could not dock Developer Tools', error)); },
        }))).popup({ window });
  };
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
    if (request.action === 'extension-group-result') {
      const pending = groupMutations.get(request.mutationId || '');
      if (!pending || pending.window !== window) return;
      groupMutations.delete(request.mutationId!);
      if (!request.error) for (const patch of pending.changes) {
        const current = configurations.get(patch.id);
        if (current) configurations.set(patch.id, { ...current, ...patch.changes });
      }
      if (!request.error) for (const app of pending.additions) configurations.set(app.id, app);
      if (!request.error) workspaceSync?.refresh();
      pending.finish(request.error);
      return;
    }
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
    if (targetGroup && isGroupLocked(targetGroup) && request.action !== 'unload-space-groups') return;
    if (request.action === 'unload-tab') {
      const item = configurations.get(request.id);
      const view = views.get(request.id);
      if (!item || windows?.visibleElsewhere(window, request.id)) return;
      if (view) unloadTab(request.id, view, { x: 0, y: 0 }, true);
      else resetUnloadedHistory(request.id, item, lastStates.get(request.id));
      return;
    }
    if (request.action === 'close-group' || request.action === 'unload-other-groups' || request.action === 'unload-space-groups') {
      const source = configurations.get(request.id);
      if (!source) return;
      const spaceGroups = request.action === 'unload-space-groups';
      const collapseIds: string[] = [];
      const otherGroups = request.action === 'unload-other-groups';
      const pending: Promise<boolean>[] = [];
      configurations.forEach((item, id) => {
        const sameGroup = groupKey(item) === groupKey(source) && (item.spaceId || 'default') === (source.spaceId || 'default');
        if (item.archived || (spaceGroups ? (item.spaceId || 'default') !== (source.spaceId || 'default') : otherGroups ? sameGroup : !sameGroup)) return;
        collapseIds.push(id);
        const view = views.get(id);
        if (windows?.visibleElsewhere(window, id)) return;
        if (view) pending.push(new Promise(resolve => unloadTab(id, view, { x: 0, y: 0 }, true, false, resolve)));
        else resetUnloadedHistory(id, item, lastStates.get(id));
      });
      void Promise.all(pending).then(results => {
        const total = results.filter(Boolean).length;
        if (!window.isDestroyed()) window.webContents.send('browser-tab-request', { action:'collapse-groups', ids:collapseIds });
        return showAppToast(window, { id: 'groups-unloaded', title: !total ? 'No tabs unloaded' : spaceGroups ? 'Space groups unloaded' : otherGroups ? 'Other groups unloaded' : 'Group unloaded', message: `${total} ${total === 1 ? 'tab' : 'tabs'} unloaded.`, type:'info' });
      }).catch(() => {});
      return;
    }
    if (request.action === 'extensions') {
      const item = configurations.get(request.id);
      if (item) setActiveExtensionProfile(window, loginProfileKey(item));
      Menu.buildFromTemplate(
        extensionMenu(window, views.get(request.id)?.webContents, request.extensionId)
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
              if (request.reloadAfterSave || (request.run && request.developer?.enabled))
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
      case 'toggle-ad-blocking': {
        const origin = siteOrigin(contents.getURL());
        if (origin && (!request.url || request.url === origin)) {
          const profile = loginProfileKey(configurations.get(request.id) || ({} as IApp));
          updateSiteSettings(profile,origin,{adBlocking:getSiteSettings(profile,origin).adBlocking === false});
        }
        break;
      }
      case 'copy-clean-link':
        if (validURL(contents.getURL())) clipboard.writeText(cleanLink(contents.getURL()));
        break;
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
            if (request.reloadAfterSave) contents.reload();
            else if (request.run && request.developer?.enabled) {
              if (typeof request.hookId === 'string')
                rerunDeveloperHook(contents, origin, request.hookId);
              else contents.reload();
            }
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
          if (permission !== 'media' && !permissions.has(permission))
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
                    (settings.permissions[permission] || (['camera', 'microphone'].includes(permission) ? settings.permissions.media : undefined) || 'ask') === choice,
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
      case 'page-translate':
      case 'page-translation-original':
      case 'page-translation-always':
      case 'page-translation-target':
        translationAction(contents, request.action, request.translationTarget);
        break;
      case 'page-devtools-menu':
        showPageDevToolsMenu(contents,window);
        break;
      case 'page-devtools-panel':
      case 'page-devtools-right':
      case 'page-devtools-bottom':
      case 'page-devtools-window':
        void pageDevTools.open(contents, request.action.replace('page-devtools-', '') as 'right' | 'bottom' | 'panel' | 'window').catch(error => console.warn('Could not open page Developer Tools', error));
        break;
      case 'page-devtools-resize':
        pageDevTools.resize(contents, request.devToolsFraction!, request.devToolsLive !== true);
        break;
      case 'page-devtools-close':
        pageDevTools.close(contents);
        break;
      case 'page-devtools':
        pageDevTools.toggle(contents);
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
  let savingEnergy = false;
  const stopEnergySaver = registerEnergySaver(window, async () => {
    if (savingEnergy) return { unloaded: 0, protected: 0 };
    savingEnergy = true;
    let unloaded = 0;
    let protectedCount = 0;
    const key = (item: IApp) => JSON.stringify([item.spaceId || 'default', groupKey(item)]);
    const activeGroups = () => new Set([...configurations.values()].filter(item => visible.has(item.id) || focusedId === item.id).map(key));
    const eligible = (id: string, view: WebContentsView) => {
      const item = configurations.get(id);
      const contents = view.webContents;
      const permissions = lastStates.get(id)?.siteSettings?.permissions || {};
      return !!item && !activeGroups().has(key(item)) && !visible.has(id) && !windows?.visibleElsewhere(window, id) &&
        !isGroupLocked(item) && !edited.has(id) && !playingMedia.has(id) && !pictureInPicture.get(id)?.state.active &&
        !contents.isDestroyed() && !contents.isLoading() && !contents.isCurrentlyAudible() && !contents.isDevToolsOpened() && !pageDevTools.mode(contents) &&
        !hasActiveDownloads(contents.session) && !['media', 'camera', 'microphone', 'display-capture'].some(permission => permissions[permission] === 'allow');
    };
    try {
      for (const [id, view] of [...views]) {
        const item = configurations.get(id);
        if (!item || activeGroups().has(key(item))) continue;
        if (!eligible(id, view)) { protectedCount++; continue; }
        const url = view.webContents.getURL();
        try {
          const scroll = await inspectDiscardCandidate(view.webContents);
          if (!scroll || views.get(id) !== view || !eligible(id, view) || view.webContents.getURL() !== url) { protectedCount++; continue; }
          const didUnload = await new Promise<boolean>((resolve) => {
            const contents = view.webContents;
            let timeout: ReturnType<typeof setTimeout>;
            const finish = (success: boolean) => {
              clearTimeout(timeout);
              contents.removeListener('destroyed', done);
              contents.removeListener('will-prevent-unload', blocked);
              resolve(success);
            };
            const done = () => finish(true);
            const blocked = () => finish(false);
            contents.once('destroyed', done);
            contents.once('will-prevent-unload', blocked);
            timeout = setTimeout(() => finish(false), 2000);
            unloadTab(id, view, scroll);
          });
          if (didUnload) unloaded++;
          else protectedCount++;
        } catch { protectedCount++; }
      }
      const groups = activeGroups();
      const ids = [...configurations.values()].filter(item => !groups.has(key(item))).map(item => item.id);
      if (!window.isDestroyed()) window.webContents.send('browser-tab-request', { action: 'collapse-groups', ids });
      return { unloaded, protected: protectedCount };
    } finally { savingEnergy = false; }
  });
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
        !contents.isDestroyed() &&
        !contents.isLoading() &&
        !contents.isCurrentlyAudible() &&
        !hasActiveDownloads(contents.session) &&
        !contents.isDevToolsOpened() && !pageDevTools.mode(contents)
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
          (contents.isDevToolsOpened() || !!pageDevTools.mode(contents))
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
      onActivityLayoutChanged: (listener) => {
        activityLayoutChanges.on('change', listener);
        return () => { activityLayoutChanges.removeListener('change', listener); };
      },
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
      updateGroup: (changes) => {
        changes.forEach(({ id }) => {
          const item = configurations.get(id);
          if (!item || isGroupLocked(item) || removals.blocks(item))
            throw new Error('Unlock this group before changing it');
        });
        const owner = changes[0] ? hostFor(changes[0].id) : window;
        return updateGroupTabs(owner, changes);
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
  const registerInboxDetection = (host: BrowserWindow) => registerEmailBrowserDetection(host, {
    tabs: () => [...configurations.values()].filter((item) => !isGroupLocked(item) && !removals.blocks(item) && (!windows || windows.allows(host, item.id))),
    contents: (id) => {
      const item = configurations.get(id);
      return item && !isGroupLocked(item) && !removals.blocks(item) && (!windows || windows.allows(host, id)) ? views.get(id)?.webContents : undefined;
    },
  });
  const disposeInboxDetection = registerInboxDetection(window);
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
      { currentTabId: () => focusedId, runHook: (target, hookId) => {
        const view = views.get(target.id);
        if (!view || view.webContents.isDestroyed() || siteOrigin(view.webContents.getURL()) !== new URL(target.url).origin) throw new Error('Open this website before running a hook.');
        enableGlobalHookForRun(target.profile, view.webContents.getURL(), hookId);
        const effective = effectiveHookConfig(target.profile, view.webContents.getURL());
        if (!effective.hooks?.some(hook => hook.id === hookId && hook.enabled)) throw new Error('Enable this hook on this website first. Global disable overrides website choices.');
        rerunDeveloperHook(view.webContents, new URL(target.url).origin, hookId);
      }, openSiteEditor: (target, hookId) => {
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
        (id) => views.get(id)?.webContents,
        workspaceFor(window)
      );
  const releaseGroupLocks = getGroupLocks().subscribe(() => {
    stateSignatures.clear();
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
  const resizeViews = (source: BrowserWindow, layout: BrowserLayout) => {
    if (layout.suspended || suspended || pendingOverlay) return;
    const slots = windows ? windows.resize(source, layout.visible) : layout.visible;
    if (!slots || (!windows && (slots.length !== visible.size || slots.some(slot => !visible.has(slot.id))))) return;
    let changed = false;
    for (const slot of slots) {
      const item = configurations.get(slot.id);
      const view = views.get(slot.id);
      if (!item || !view || view.webContents.isDestroyed() || hostFor(slot.id) !== source || isGroupLocked(item) || removals.blocks(item)) continue;
      const bounds = pageDevTools.layout(view.webContents, source, {
        x: Math.max(0, Math.round(slot.x)), y: Math.max(0, Math.round(slot.y)),
        width: Math.max(0, Math.round(slot.width)), height: Math.max(0, Math.round(slot.height)),
      }, !failures.has(item.id) && loaded.has(item.id));
      const previous = view.getBounds();
      if (previous.x === bounds.x && previous.y === bounds.y && previous.width === bounds.width && previous.height === bounds.height) continue;
      view.setBounds(bounds);
      changed = true;
    }
    if (changed) {
      hideLinkPreview();
      activityLayoutChanges.emit('change');
      developerWindows.update();
    }
  };
  const sync = (event: IpcMainEvent, layout: BrowserLayout) => {
    const source =
      windows?.trusted(event) ||
      (event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame
        ? window
        : undefined);
    if (!source || !isBrowserLayout(layout)) return;
    if (layout.geometryOnly) { resizeViews(source, layout); return; }
    suspendSidebarPanels(source, Boolean(layout.sidebarSuspended ?? layout.suspended), layout.panelOverlayToken);
    const chromeFocused = source.webContents.isFocused();
    if (windows) windows.setLayout(source, layout);
    else applyLayout(layout);
    const panelHost = sidebarPanelHostFor(source);
    const focusedApp = configurations.get(layout.focusedId || '');
    panelHost?.followFocusedGroup(focusedApp && groupKey(focusedApp));
    const groupTargets = new Map<string, IApp>();
    for (const app of configurations.values()) if (!app.archived && !isGroupLocked(app) && !removals.blocks(app) && hostFor(app.id) === source) {
      const key = groupKey(app);
      if (!groupTargets.has(key) || app.id === layout.focusedId) groupTargets.set(key, app);
    }
    panelHost?.setTargets([...groupTargets].map(([id, app]) => ({ id, title: app.sessionName || app.name, profileId: loginProfileKey(app) })), (id) => {
      const item = id ? groupTargets.get(id) : configurations.get(layout.focusedId || '');
      const contents = item && views.get(item.id)?.webContents;
      setSidebarPanelSession(source, contents?.session, item && groupKey(item));
      if (id && item && !contents) source.webContents.send('browser-tab-request', { action: 'select-group', groupId: id });
      if (contents && item) {
        try { synchronizingExtensions = true; getExtensionProfile(loginProfileKey(item))?.api.selectTab(contents); }
        finally { synchronizingExtensions = false; }
      }
    });
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
    snapshotViews: (id, owner) => {
      const view = views.get(id);
      if (!view) return [];
      const inspector = pageDevTools.snapshotView(view.webContents, owner);
      return [{view}, ...(inspector ? [{view:inspector, surface:'devtools' as const}] : [])];
    },
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
      const inboxDetection = registerInboxDetection(host);
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
              windows.allows(host, id) ? views.get(id)?.webContents : undefined,
            workspaceFor(host)
          );
      onWindowClosed(host, () => {
        capture();
        inboxDetection();
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
            [...websiteTabs.values()].every(
              (entry) =>
                loginProfileKey(entry.source) !== profile ||
                entry.contents.isDestroyed()
            )
          );
        }
      );
  const dispose = () => {
    releaseExtensionWorkspace();
    for (const pending of groupMutations.values()) pending.finish('Browser window closed');
    groupMutations.clear();
    workspaceSync?.dispose();
    if (disposed) return;
    disposed = true;
    if (privateMode) clearPrivateSiteSettings(privateProfilePrefix);
    faviconResolver.clear();
    disposeGroupRemoval();
    stopWindows?.();
    stopRuntime?.();
    disposeAI?.();
    disposeCapture();
    disposeInboxDetection();
    developerWindows.dispose();
    disposeDeveloperLibrary();
    releaseGroupLocks();
    aiNewTabs.dispose();
    releaseExtensionOwner(window);
    disposeTasks();
    hideLinkPreview();
    stopPiPPreferences?.();
    stopEnergySaver();
    clearInterval(discardTimer);
    pictureInPicture.forEach((controller) => controller.dispose());
    pictureInPicture.clear();
    gestureCleanup.forEach((cleanup) => cleanup());
    keyboardCleanup.forEach((cleanup) => cleanup());
    pendingTabCleanup.forEach((cleanup) => cleanup());
    window.removeListener('closed', dispose);
    hostContents.removeListener('did-start-loading', resetStateSignatures);
    ipcMain.removeListener('browser-sync', sync);
    ipcMain.removeListener('browser-command', command);
    websiteTabs.forEach(({ contents, cleanup }) => {
      cleanup();
      if (!contents.isDestroyed()) contents.close();
    });
    websiteTabs.clear();
    websiteTabRecovery.clear();
    views.forEach((view) => {
      const contents = view.webContents;
      if (contents && !contents.isDestroyed()) contents.close();
    });
    views.clear();
  };
  onWindowClosed(window, dispose);
  return dispose;
}
