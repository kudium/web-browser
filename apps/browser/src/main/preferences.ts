import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  WebContents,
  IpcMainInvokeEvent,
  Session,
  session,
  shell,
  nativeTheme,
} from 'electron';
import fs from 'fs';
import path from 'path';
import { validActivitySound } from '../browser/activitySound';
import { validateLinkRoutingRules } from '../browser/linkRouting';
import { browserProtection } from './browserProtection';
import { version as projectVersion } from '../../package.json';
import { watchIPCRequest } from './ipcRequestBinding';
import { validateAdvanced } from '../browser/advancedPreferences';
import {
  applyAdvancedContents,
  configureDNS,
  advancedDiagnostic,
  waitForBrowserNetwork,
} from './advancedPreferences';
import {
  cloudSyncStatus,
  defaultSyncSettings,
  validateSyncSettings,
} from '../browser/cloudSync';
import { restoreShortcuts, validateShortcuts } from '../browser/shortcuts';
import { normalizeSleepSites } from '../browser/sleepingTabs';
import { validateSearchEngines } from '../browser/searchEngines';
import { clearSessionSiteData } from './siteData';
import { showBrowserDialog } from './dialogs';
import {
  extensionMenu,
  extensionCatalog,
  setActiveExtensionProfile,
  getExtensionProfile,
  getExtensionProfiles,
  configureExtensionToolbar,
} from './extensions';
import {
  BrowserPreferences,
  defaultPreferences,
  preferenceControls,
  PreferenceAction,
} from '../browser/preferences';

const browsers = new Set<WebContents>();

const preferenceListeners = new Set<() => void>();
export function onBrowserPreferencesChanged(listener: () => void) {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}
const systemLanguages = new WeakMap<Session, string[]>();
const filename = () =>
  path.join(app.getPath('userData'), 'browser-preferences.json');
let cachedPreferences:
  | { file: string; value: Readonly<BrowserPreferences> }
  | undefined;

function freezePreferences(value: BrowserPreferences) {
  // Own all nested values: defaults and validated patches can share arrays.
  const snapshot = JSON.parse(JSON.stringify(value)) as BrowserPreferences;
  const freeze = (item: object) => {
    Object.values(item).forEach((child) => {
      if (child && typeof child === 'object') freeze(child);
    });
    Object.freeze(item);
  };
  freeze(snapshot);
  return Object.freeze(snapshot);
}
let openPage:
  | ((
      section?:
        | 'ai'
        | 'archive'
        | 'sync'
        | 'import'
        | 'passwords'
        | 'spaces'
        | 'hooks' | 'appearance' | 'shortcuts' | 'performance' | 'routing' | 'ai' | 'extensions'
      | 'updates',
      personalDataScope?: string
    ) => void)
  | undefined;
let aiSettingsWindow: (contents: WebContents) => boolean = () => false;
export const isAISettingsWindow = (contents: WebContents) =>
  aiSettingsWindow(contents);
let trustedPreferenceWindow: (contents: WebContents) => boolean = () => false;
export function validatePreferences(
  patch: Partial<BrowserPreferences>
): Partial<BrowserPreferences> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new Error('Invalid preferences');
  const validated: Partial<BrowserPreferences> = {};
  Object.entries(patch).forEach(([key, value]) => {
    if (key === 'pageTranslation') {
      const setting = value as BrowserPreferences['pageTranslation'];
      const validLanguage = (code: unknown) => typeof code === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(code);
      if (!setting || !validLanguage(setting.target) || !setting.always || typeof setting.always !== 'object' || Array.isArray(setting.always) || Object.keys(setting.always).length > 100 ||
        Object.entries(setting.always).some(([source, target]) => !validLanguage(source) || !validLanguage(target)) || !Array.isArray(setting.never) || setting.never.length > 200 ||
        setting.never.some(site => { try { return new URL(site).origin !== site || !/^https?:/.test(site); } catch { return true; } })) throw new Error('Invalid translation preferences');
      validated.pageTranslation = { target: setting.target, always: { ...setting.always }, never: [...new Set(setting.never)] }; return;
    }
    if(key === 'usageDiagnosticsConsentVersion' && (value === 0 || value === 1)) {
      validated.usageDiagnosticsConsentVersion=value;
      return;
    }
    if (key === 'linkRoutingRules') {
      validated.linkRoutingRules = validateLinkRoutingRules(value);
      return;
    }
    if ((key === 'activityNotifications' || key === 'activityToasts') && typeof value === 'boolean') {
      validated[key] = value;
      return;
    }
    if (key === 'activitySoundName' && validActivitySound(value)) {
      validated.activitySoundName = value;
      return;
    }
    if (key === 'activitySound' && typeof value === 'boolean') {
      validated.activitySound = value;
      return;
    }
    if (key === 'setupCompleted' && typeof value === 'boolean') {
      validated.setupCompleted = value;
      return;
    }
    if (key === 'advanced') {
      validated.advanced = validateAdvanced(value);
      return;
    }
    if (key === 'extensionToolbarOrder') {
      if (
        value !== null &&
        (!Array.isArray(value) ||
          value.length > 256 ||
          value.some(
            (id) => typeof id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(id)
          ))
      )
        throw new Error('Invalid extension toolbar order');
      validated.extensionToolbarOrder =
        value === null ? null : [...new Set(value as string[])];
      return;
    }
    if (key === 'cloudSync') {
      validated.cloudSync = validateSyncSettings(value);
      return;
    }
    if (key === 'shortcuts') {
      validated.shortcuts = validateShortcuts(
        value,
        process.platform === 'darwin'
      );
      return;
    }
    if (key === 'personalDataAutofillPositions') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 200) throw new Error('Invalid autofill positions');
      const positions: BrowserPreferences['personalDataAutofillPositions'] = {};
      for (const [origin, placement] of Object.entries(value)) {
        const url = new URL(origin);
        const point = placement as BrowserPreferences['personalDataAutofillPositions'][string];
        if (url.protocol !== 'https:' || url.origin !== origin || !point || !['left', 'right'].includes(point.side) ||
            !Number.isFinite(point.x) || Math.abs(point.x) > 128 || !Number.isFinite(point.y) || Math.abs(point.y) > 128) throw new Error('Invalid autofill position');
        positions[origin] = { side: point.side, x: point.x, y: point.y };
      }
      validated.personalDataAutofillPositions = positions;
      return;
    }
    if (key === 'personalDataAutofillExcludedSites') {
      if (!Array.isArray(value) || value.length > 1000) throw new Error('Invalid autofill website list');
      validated.personalDataAutofillExcludedSites = [...new Set(value.map((entry) => {
        if (typeof entry !== 'string') throw new Error('Invalid autofill website');
        const url = new URL(entry);
        if (url.protocol !== 'https:') throw new Error('Invalid autofill website');
        return url.origin;
      }))];
      return;
    }
    if (key === 'discardExcludedSites') {
      validated.discardExcludedSites = normalizeSleepSites(value);
      return;
    }
    if (key === 'searchEngines') {
      validated.searchEngines = validateSearchEngines(value);
      return;
    }
    if (
      key === 'searchEngine' &&
      typeof value === 'string' &&
      /^[\w-]{1,80}$/.test(value)
    ) {
      validated.searchEngine = value;
      return;
    }
    if (key === 'startPageURL') {
      if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid start page URL.');
      if (value) {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS start page URL.');
        validated.startPageURL = url.href;
      } else validated.startPageURL = '';
      return;
    }
    const control = preferenceControls.find((item) => item.key === key);
    if (control?.kind === 'toggle' && typeof value === 'boolean')
      Object.assign(validated, { [key]: value });
    else if (
      control?.kind === 'number' &&
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= (control.min || 1) &&
      value <= (control.max || 1440)
    )
      Object.assign(validated, { [key]: value });
    else if (control?.options?.some((option) => option.value === value))
      Object.assign(validated, { [key]: value });
    else if (
      key === 'spellcheckLanguage' &&
      typeof value === 'string' &&
      (!value ||
        session.defaultSession.availableSpellCheckerLanguages.includes(value))
    )
      validated.spellcheckLanguage = value;
    else throw new Error(`Invalid preference: ${key}`);
  });
  return validated;
}
/** Main-process read-only snapshot. External file edits take effect on restart. */
export function getBrowserPreferences(): Readonly<BrowserPreferences> {
  const file = filename();
  if (cachedPreferences?.file === file) return cachedPreferences.value;
  let preferences: BrowserPreferences;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Earlier builds persisted an automatic-on default, not explicit consent.
    if(saved.usageDiagnosticsConsentVersion !== 1) saved.shareUsageDiagnostics=false;
    if (saved.shortcuts)
      saved.shortcuts = restoreShortcuts(
        saved.shortcuts,
        process.platform === 'darwin'
      );
    const directory =
      typeof saved.downloadDirectory === 'string'
        ? saved.downloadDirectory
        : '';
    delete saved.downloadDirectory;
    if (saved.systemSpaceRetentionDays === 7)
      saved.systemSpaceRetentionDays = 14;
    const result = {
      ...defaultPreferences,
      cloudSync: defaultSyncSettings(process.platform),
      ...validatePreferences(saved),
      downloadDirectory: directory,
    };
    if (
      !result.searchEngines.some((engine) => engine.id === result.searchEngine)
    )
      result.searchEngine = result.searchEngines[0].id;
    preferences = result;
  } catch {
    preferences = {
      ...defaultPreferences,
      cloudSync: defaultSyncSettings(process.platform),
    };
  }
  cachedPreferences = { file, value: freezePreferences(preferences) };
  return cachedPreferences.value;
}
function apply(
  contents: WebContents,
  preferences: BrowserPreferences,
  previous?: BrowserPreferences
) {
  if (contents.isDestroyed()) return;
  if (!previous || previous.zoom !== preferences.zoom)
    contents.setZoomFactor(preferences.zoom);
  applyAdvancedContents(contents, preferences.advanced);
  contents.session.setSpellCheckerEnabled(preferences.spellcheck);
  if (!systemLanguages.has(contents.session))
    systemLanguages.set(
      contents.session,
      contents.session.getSpellCheckerLanguages?.() || []
    );
  contents.session.setSpellCheckerLanguages?.(
    preferences.spellcheckLanguage
      ? [preferences.spellcheckLanguage]
      : systemLanguages.get(contents.session)!
  );
}
export function enablePagePinchZoom(contents: WebContents) {
  if (contents.isDestroyed()) return;
  contents.setVisualZoomLevelLimits(1, 5).catch(() => {
    // Closing a page while its zoom limits are being set needs no recovery.
  });
}
export function applyBrowserPreferences(contents: WebContents, profile = '') {
  enablePagePinchZoom(contents);
  browsers.add(contents);
  contents.once('destroyed', () => browsers.delete(contents));
  const preferences = getBrowserPreferences();
  applyAdvancedContents(contents, preferences.advanced, profile);
  apply(contents, preferences);
}

function persist(preferences: BrowserPreferences) {
  const previous = getBrowserPreferences();
  const snapshot = freezePreferences(preferences);
  configureDNS(snapshot.advanced);
  const file = filename();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(snapshot, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  // Publish before callbacks so permission checks and reentrant reads are current.
  cachedPreferences = { file, value: snapshot };
  browsers.forEach((contents) => apply(contents, snapshot, previous));
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed() && trustedPreferenceWindow(window.webContents))
      window.webContents.send('browser-preferences-changed', snapshot);
  });
  preferenceListeners.forEach((listener) => listener());
  return snapshot;
}
export function updateBrowserPreferences(patch: Partial<BrowserPreferences>) {
  const next = { ...getBrowserPreferences(), ...validatePreferences(patch) };
  if(typeof patch.shareUsageDiagnostics === 'boolean')
    next.usageDiagnosticsConsentVersion=patch.shareUsageDiagnostics ? 1 : 0;
  if (!next.searchEngines.some((engine) => engine.id === next.searchEngine))
    throw new Error('Choose a default search engine from the list.');
  return persist(next);
}
export function showBrowserPreferences(
  _owner: BrowserWindow,
  section?: 'archive' | 'sync' | 'import' | 'passwords' | 'spaces' | 'hooks' | 'appearance' | 'shortcuts' | 'performance' | 'routing' | 'ai' | 'extensions'
      | 'updates',
  personalDataScope?: string
) {
  openPage?.(section, personalDataScope);
}
export function registerPreferences(
  opener?: (
    section?:
      | 'ai'
      | 'archive'
      | 'sync'
      | 'import'
      | 'passwords'
      | 'spaces'
      | 'hooks' | 'appearance' | 'shortcuts' | 'performance' | 'routing' | 'ai' | 'extensions'
      | 'updates',
    personalDataScope?: string
  ) => void,
  isTrusted: (contents: WebContents) => boolean = () => false,
  isSettings: (contents: WebContents) => boolean = () => false
) {
  openPage = opener;
  aiSettingsWindow = isSettings;
  trustedPreferenceWindow = isTrusted;
  const ownerOf = (event: IpcMainInvokeEvent) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (
      !owner ||
      event.senderFrame !== event.sender.mainFrame ||
      !isTrusted(event.sender)
    )
      throw new Error('Untrusted request.');
    return owner;
  };
  ipcMain.handle('ai-open-preferences', (event) => {
    ownerOf(event);
    openPage?.('ai');
  });
  ipcMain.handle('browser-native-appearance', (event, appearance: unknown) => {
    ownerOf(event);
    if (
      appearance !== 'system' &&
      appearance !== 'light' &&
      appearance !== 'dark'
    )
      throw new Error('Unknown appearance.');
    nativeTheme.themeSource = appearance;
  });
  ipcMain.handle(
    'browser-preferences',
    (
      event,
      action: string,
      patch?: Partial<BrowserPreferences> & {
        section?:
          | 'archive'
          | 'sync'
          | 'import'
          | 'passwords'
          | 'spaces'
          | 'hooks' | 'appearance' | 'shortcuts' | 'performance' | 'routing' | 'ai' | 'extensions'
          | 'updates';
      }
    ) => {
      const owner = ownerOf(event);
      if (action === 'open')
        showBrowserPreferences(
          owner,
          patch?.section === 'archive' ||
            patch?.section === 'sync' ||
            patch?.section === 'import' ||
            patch?.section === 'passwords' ||
            patch?.section === 'spaces' ||
            patch?.section === 'hooks' || patch?.section === 'updates' || ['appearance', 'shortcuts', 'performance', 'routing', 'ai', 'extensions'].includes(patch?.section || '')
            ? patch?.section
            : undefined
        );
      if (action === 'update') {
        const result = updateBrowserPreferences(patch!);
        return Promise.all(
          [...browsers]
            .filter((contents) => !contents.isDestroyed())
            .map(waitForBrowserNetwork)
        ).then(() => result);
      }
      if (!['get', 'open'].includes(action))
        throw new Error('Unknown preference action');
      return getBrowserPreferences();
    }
  );
  ipcMain.handle(
    'browser-preference-action',
    async (event, action: PreferenceAction, profileId?: string) => {
      const owner = ownerOf(event);
      const requestBinding = watchIPCRequest(event, isTrusted);
      try {
        if (action === 'protection-status') return browserProtection().status();
        if (action === 'update-protection') return browserProtection().update();
        if (
          action === 'shortcut-capture-start' ||
          action === 'shortcut-capture-end'
        ) {
          owner.webContents.setIgnoreMenuShortcuts(
            action === 'shortcut-capture-start'
          );
          return null;
        }
        if (action === 'enable-open-at-login') {
          if (
            !app.isPackaged ||
            !['darwin', 'win32'].includes(process.platform)
          )
            throw new Error(
              'Login setup is available in the installed browser.'
            );
          app.setLoginItemSettings({ openAtLogin: true });
          return {
            kind: 'diagnostic',
            text: app.getLoginItemSettings().openAtLogin
              ? 'Kudium Browser will open when you sign in.'
              : 'Confirm Kudium Browser in your system Login Items settings.',
          };
        }
        if (action === 'reveal-app-for-dock') {
          if (process.platform !== 'darwin' || !app.isPackaged)
            throw new Error(
              'Dock setup is available in the installed Mac browser.'
            );
          shell.showItemInFolder(path.resolve(process.execPath, '../../..'));
          return {
            kind: 'diagnostic',
            text: 'Drag Kudium Browser from Finder to your Dock to keep it there.',
          };
        }
        if (action === 'set-default-browser') {
          const success = ['http', 'https']
            .map((protocol) => app.setAsDefaultProtocolClient(protocol))
            .every(Boolean);
          return {
            kind: 'diagnostic',
            text: success
              ? 'Default browser registration requested. Your operating system may ask you to confirm.'
              : 'Open your operating system Default Apps settings and choose Kudium Browser.',
          };
        }
        if (
          [
            'network-test',
            'network-log-start',
            'network-log-stop',
            'storage-info',
            'performance-info',
          ].includes(action)
        ) {
          return advancedDiagnostic(
            action,
            profileId ? getExtensionProfile(profileId)?.session : undefined,
            owner
          );
        }
        if (action === 'sync-status')
          return cloudSyncStatus(
            getBrowserPreferences().cloudSync,
            process.platform
          );
        if (action === 'info')
          return {
            platform: process.platform,
            systemSetupAvailable: app.isPackaged,
            openAtLogin: ['darwin', 'win32'].includes(process.platform)
              ? app.getLoginItemSettings().openAtLogin
              : false,
            defaultBrowser: ['http', 'https'].every((protocol) =>
              app.isDefaultProtocolClient(protocol)
            ),
            extensionCatalog: extensionCatalog(),
            profiles: getExtensionProfiles().map((profile) => ({
              id: profile.id,
              name: profile.name,
              extensions: profile.session.extensions.getAllExtensions().length,
            })),
            languages: session.defaultSession.availableSpellCheckerLanguages,
            versions: {
              kudiumbrowser: app.isPackaged ? app.getVersion() : projectVersion,
              engine: process.versions.electron,
              chromium: process.versions.chrome,
            },
          };
        const preferences = getBrowserPreferences();
        if (action === 'choose-download-directory') {
          const result = await dialog.showOpenDialog(owner, {
            properties: ['openDirectory', 'createDirectory'],
            defaultPath:
              preferences.downloadDirectory || app.getPath('downloads'),
          });
          ownerOf(event);
          requestBinding.assert();
          if (result.canceled) return getBrowserPreferences();
          const directory = result.filePaths[0];
          if (typeof directory !== 'string' || !path.isAbsolute(directory))
            throw new Error('Choose an available download directory.');
          return persist({
            ...getBrowserPreferences(),
            downloadDirectory: directory,
          });
        }
        if (action === 'open-download-directory') {
          await shell.openPath(
            preferences.downloadDirectory || app.getPath('downloads')
          );
          return null;
        }
        if (action === 'reveal-config') {
          persist(preferences);
          shell.showItemInFolder(filename());
          return null;
        }
        if (action === 'reset') {
          const answer = await showBrowserDialog(owner, {
            message: 'Reset browser preferences?',
            detail: 'Apps, cookies and extensions will be kept.',
            buttons: ['Cancel', 'Reset preferences'],
            defaultId: 0,
            cancelId: 0,
          });
          ownerOf(event);
          requestBinding.assert();
          return answer.response === 1
            ? persist({
                ...defaultPreferences,
                cloudSync: defaultSyncSettings(process.platform),
              })
            : getBrowserPreferences();
        }
        const profile =
          profileId === 'all' && (action === 'store' || action === 'extensions')
            ? getExtensionProfiles()[0]
            : profileId && getExtensionProfile(profileId);
        if (!profile) throw new Error('Choose an available browser profile.');
        const targetSession = profile.session;
        const targetOwner = profile.owner;
        if (action === 'extensions') {
          setActiveExtensionProfile(profile.owner, profile.id);
          Menu.buildFromTemplate(extensionMenu(profile.owner)).popup({
            window: owner,
          });
          return null;
        }
        if (action === 'store') {
          profile.owner.webContents.send('browser-tab-request', {
            action: 'store',
            profileId: profileId === 'all' ? 'all' : profile.id,
          });
          profile.owner.show();
          return null;
        }
        if (action === 'devtools') {
          const contents = [...browsers].find(
            (item) => !item.isDestroyed() && item.session === profile.session
          );
          if (!contents) throw new Error('Open a page in this profile first.');
          contents.openDevTools({ mode: 'detach' });
          return null;
        }
        if (action === 'clear-cache' || action === 'clear-data') {
          const answer = await showBrowserDialog(owner, {
            message:
              action === 'clear-data'
                ? `Clear cookies and site data for ${profile.name}?`
                : `Clear cached files for ${profile.name}?`,
            detail:
              action === 'clear-data'
                ? 'This signs you out of this profile. Extension storage is kept.'
                : 'Your logins will be kept.',
            buttons: ['Cancel', 'Clear'],
            defaultId: 0,
            cancelId: 0,
          });
          ownerOf(event);
          requestBinding.assert();
          const available = getExtensionProfile(profile.id);
          if (
            !available ||
            available.session !== targetSession ||
            available.owner !== targetOwner
          )
            throw new Error('This browser profile is no longer available.');
          if (answer.response === 1) {
            if (action === 'clear-cache') await profile.session.clearCache();
            else await clearSessionSiteData(profile.session);
          }
          return null;
        }
        throw new Error('Unknown preference action');
      } finally {
        requestBinding.dispose();
      }
    }
  );
}

configureExtensionToolbar({
  getOrder: () => getBrowserPreferences().extensionToolbarOrder,
  saveOrder: (extensionToolbarOrder) => {
    updateBrowserPreferences({ extensionToolbarOrder });
  },
});
