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
} from 'electron';
import fs from 'fs';
import path from 'path';
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
import { validateShortcuts } from '../browser/shortcuts';
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
let openPage: ((section?: 'ai') => void) | undefined;
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
    const directory =
      typeof saved.downloadDirectory === 'string'
        ? saved.downloadDirectory
        : '';
    delete saved.downloadDirectory;
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
export function applyBrowserPreferences(contents: WebContents, profile = '') {
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
  if (!next.searchEngines.some((engine) => engine.id === next.searchEngine))
    throw new Error('Choose a default search engine from the list.');
  return persist(next);
}
export function showBrowserPreferences(_owner: BrowserWindow) {
  openPage?.();
}
export function registerPreferences(
  opener?: (section?: 'ai') => void,
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
  ipcMain.handle(
    'browser-preferences',
    (event, action: string, patch?: Partial<BrowserPreferences>) => {
      const owner = ownerOf(event);
      if (action === 'open') showBrowserPreferences(owner);
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
        if (
          action === 'shortcut-capture-start' ||
          action === 'shortcut-capture-end'
        ) {
          owner.webContents.setIgnoreMenuShortcuts(
            action === 'shortcut-capture-start'
          );
          return null;
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
              touchbox: app.isPackaged ? app.getVersion() : projectVersion,
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
