import { validAutofillPopupPlacement } from '../../browser/autofillPopupPlacement';
import { setActiveNote } from '../activeNote';
import { showAppToast } from '../appToast';
import { listSuggestions, runSuggestion } from '../hookSuggestions';
import { listTodos, addTodo, changeTodo, deleteCompletedTodos } from '../todos';
import { runAutoLogin, buildAutoLoginMenu } from './autoLogin';
import { getGroupLocks } from '../groupLocks';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
  updateBrowserPreferences,
  showBrowserPreferences,
} from '../preferences';
import {
  app,
  ipcMain,
  powerMonitor,
  BrowserWindow,
  WebContents,
  dialog,
  MenuItemConstructorOptions,
} from 'electron';
import path from 'path';
import { EventEmitter } from 'events';
import fs from 'fs';
import { onWindowClosed } from '../windowLifecycle';
import { storageRecoveryMessage } from '../../browser/storageRecovery';
import { isProtectedField } from '../../browser/passwordManager';
import { ordinaryNotesStorage } from './ordinaryNotes';
import { importDocument } from './documents';
import { parseBrowserPasswords } from './browserPasswords';
import { showBrowserDialog } from '../dialogs';
import type {
  VaultField,
  VaultItem,
  VaultRequest,
} from '../../browser/passwordManager';
import { PasswordVault } from './vault';
import { hasSavedWebsiteLogin } from './websiteLogin';
import { saveWebsiteFields } from './websiteFields';
import { browseSavedData } from './browse';
import { fillDocumentScript } from './fill';
import * as nativeAuthentication from './authentication';
import { safeStorage } from '../localStorage';
import { assertRemovalScopeWritable } from '../groupRemovalJournal';

const pages = new Map<number, WebContents>();
const pageScopes = new Map<number, () => string | undefined>();
let store: PasswordVault;
const authorized = new Set<WebContents>();
const watched = new Set<WebContents>();
const pending = new Map<WebContents, Promise<void>>();
const revisions = new WeakMap<WebContents, number>();
let authEpoch = 0;
const revocations = new EventEmitter();
export function onPersonalDataRevoked(callback: () => void) {
  revocations.on('revoke', callback);
  return () => {
    revocations.removeListener('revoke', callback);
  };
}
let authenticationAdapter = nativeAuthentication;
export const personalDataRevision = () => authEpoch;
function revokeAuthorizations() {
  authEpoch += 1;
  authenticationAdapter.revokeOSAuthentication();
  revocations.emit('revoke');
  authorized.clear();
  store?.lock();
  new Set([...watched, ...pages.values()]).forEach((contents) => {
    if (!contents.isDestroyed()) contents.send('password-manager-locked');
  });
}

export const passwordVault = () => {
  if (!store)
    store = new PasswordVault(
      path.join(app.getPath('userData'), 'password-manager', 'vault.json'),
      Date.now,
      nativeAuthentication.summaryProtection,
      assertRemovalScopeWritable,
      () => {
        const file = path.join(
          app.getPath('userData'),
          'password-manager',
          'vault.json',
        );
        if (!safeStorage.isFileAvailable(file))
          throw new Error(storageRecoveryMessage('your saved Personal Data'));
      },
      ordinaryNotesStorage(
        path.join(app.getPath('userData'), 'password-manager', 'notes.bin'),
      ),
    );
  return store;
};
/**
 * Opens encrypted data for a single synchronous operation without granting
 * secret access.
 */
export function withPersonalData<T>(work: (vault: PasswordVault) => T): T {
  const vault = passwordVault();
  const wasLocked = vault.status().locked;
  if (wasLocked && !vault.status().initialized) return work(vault);
  if (wasLocked) {
    if (!authenticationAdapter.usesOSAuthentication())
      throw new Error('Unlock Personal Data with your master password first.');
    vault.unlock(authenticationAdapter.readOSCredential());
  }
  try {
    return work(vault);
  } finally {
    if (wasLocked) vault.lock();
  }
}
/** Save a new local document without granting access to stored secrets. */
export async function savePersonalDocument(
  item: VaultItem,
  scope?: string,
  assertCurrent: () => void = () => {},
) {
  assertCurrent();
  const vault = passwordVault();
  const auth = authenticationAdapter;
  if (
    auth.usesOSAuthentication() ||
    (!vault.status().initialized && (await auth.canUseOSAuthentication()))
  ) {
    // Capability discovery can outlive the document's approval. No credential
    // or encrypted record is created until the caller revalidates ownership.
    assertCurrent();
    const wasLocked = vault.status().locked;
    const credential = auth.usesOSAuthentication()
      ? auth.readOSCredential()
      : auth.newOSCredential();
    if (!auth.usesOSAuthentication()) auth.writeOSCredential(credential);
    try {
      if (wasLocked) vault.unlock(credential, !vault.status().initialized);
      return vault.save(item, scope);
    } finally {
      if (wasLocked) vault.lock();
    }
  }
  assertCurrent();
  if (vault.status().locked)
    throw new Error(
      'Unlock Personal Data in Preferences first, then save this attachment again.',
    );
  return vault.save(item, scope);
}
export async function authenticatePersonalData(page?: WebContents) {
  if (!passwordVault().status().locked) return;
  if (!authenticationAdapter.usesOSAuthentication())
    throw new Error('Unlock Personal Data with your master password first.');
  if (page && !page.isDestroyed())
    page.send('personal-data-autofill-authenticating', true);
  try {
    await authenticationAdapter.authenticateOS();
  } finally {
    if (page && !page.isDestroyed())
      page.send('personal-data-autofill-authenticating', false);
  }
  // This only prepares a local operation; it never grants an AI secret-reading API.
}
export function registerPasswordPage(
  contents: WebContents,
  scope: () => string | undefined = () => undefined,
) {
  pageScopes.set(contents.id, scope);
  if (pages.has(contents.id)) return;
  pages.set(contents.id, contents);
  contents.once('destroyed', () => {
    pages.delete(contents.id);
    pageScopes.delete(contents.id);
  });
}
export function personalDataFormAvailable(contents: WebContents) {
  if (contents.isDestroyed() || pages.get(contents.id) !== contents) return false;
  const preferences = getBrowserPreferences();
  try {
    const url = new URL(contents.getURL());
    const scope = pageScopes.get(contents.id)?.();
    return url.protocol === 'https:' && preferences.personalDataAutofill !== false &&
      !preferences.personalDataAutofillExcludedSites.includes(url.origin) &&
      !getGroupLocks().locked((scope || '').replace(/^group:/, ''));
  } catch { return false; }
}

/** Explicit native-menu fallback; reuses the isolated autofill picker and IPC protections. */
export function personalDataFormActions(contents: WebContents, editable: boolean, x: number, y: number, fieldState = { hasValue: false, formHasValues: false }): MenuItemConstructorOptions[] {
  const scope = pageScopes.get(contents.id)?.();
  const available = () => personalDataFormAvailable(contents) && pageScopes.get(contents.id)?.() === scope;
  const expected = contents.getURL();
  const run = (action: 'pick' | 'save' | 'fill' | 'save-form' | 'save-page') => () => {
    if (available() && contents.getURL() === expected)
      contents.send('personal-data-autofill-command', { action, x, y });
  };
  const allowed = available();
  const saved = allowed && !!passwordVault().autofillAvailability(expected, scope)?.some(record => record.canFillLogin || record.fields.length);
  return [
    { label: 'Choose saved value…', enabled: allowed && editable, click: run('pick') },
    ...(allowed && editable && fieldState.hasValue ? [{ label: 'Save this value…', click: run('save') }] : []),
    ...(allowed && fieldState.formHasValues ? [{ label: 'Save form values…', click: run(editable ? 'save-form' : 'save-page') }] : []),
    ...(saved ? [{ label: 'Autofill form', click: run('fill') }] : []),
  ];
}

/** Native chrome entry point; website scripts cannot invoke this login flow. */
export function autoLoginMenu(
  owner: BrowserWindow,
  contents: WebContents,
): MenuItemConstructorOptions[] {
  const available = () => {
    if (contents.isDestroyed() || pages.get(contents.id) !== contents)
      return false;
    const scope = pageScopes.get(contents.id)?.();
    const preferences = getBrowserPreferences();
    try {
      const url = new URL(contents.getURL());
      const status = passwordVault().autoLoginMenuState(url.origin, scope);
      return (
        url.protocol === 'https:' &&
        status.initialized &&
        status.enabled &&
        status.autofill &&
        preferences.personalDataAutofill !== false &&
        !preferences.personalDataAutofillExcludedSites.includes(url.origin) &&
        !getGroupLocks().locked((scope || '').replace(/^group:/, ''))
      );
    } catch {
      return false;
    }
  };
  if (!available()) return [];
  const scope = pageScopes.get(contents.id)?.();
  const run = (accountId?: string) => {
    runAutoLogin({
      owner,
      contents,
      scope,
      accountId,
      check: () => {
        if (
          !available() ||
          owner.isDestroyed() ||
          pageScopes.get(contents.id)?.() !== scope
        )
          throw new Error('Auto login is no longer available in this tab.');
      },
      authenticate: () => authenticatePersonalData(contents),
      read: withPersonalData,
      epoch: personalDataRevision,
    }).catch((error) => {
      if (!owner.isDestroyed())
        void dialog.showMessageBox(owner, {
          type: 'info',
          message: 'Auto login',
          detail:
            error instanceof Error
              ? error.message
              : 'Auto login could not complete.',
        });
    });
  };
  try {
    const state = passwordVault().autoLoginMenuState(
      new URL(contents.getURL()).origin,
      scope,
    );
    if (!state.complete && !state.accounts.length)
      return [{ label: 'Auto login', click: () => run() }];
    return buildAutoLoginMenu(state.accounts, run);
  } catch {
    // Locked fallback vaults still provide the existing unlock guidance on click.
    return [{ label: 'Auto login', click: () => run() }];
  }
}

export async function fillSavedItem(
  contents: WebContents,
  id: string,
  ai = false,
  scope: string | undefined = undefined,
) {
  const origin = contents.getURL();
  const item = passwordVault().forFill(id, origin, ai, scope);
  try {
    // Main-frame-only filling rejects cross-origin redirects in the document itself.
    return await contents.mainFrame.executeJavaScript(
      fillDocumentScript(item, ai),
      true,
    );
  } catch {
    throw new Error(
      'Autofill could not complete. Inspect the page before retrying.',
    );
  }
}
export function registerPasswordManager(
  isTrusted: (contents: WebContents) => boolean,
  authentication: Partial<typeof nativeAuthentication> = {},
) {
  authenticationAdapter = { ...nativeAuthentication, ...authentication };
  ipcMain.on('active-note', (event,value) => {
    if (isTrusted(event.sender) && event.senderFrame === event.sender.mainFrame) setActiveNote(event.sender,value);
  });
  const autofillEnabled = (page?: WebContents) => {
    const preferences = getBrowserPreferences();
    if (preferences.personalDataAutofill === false) return false;
    if (!page) return true;
    try {
      const url = new URL(page.getURL());
      return (
        url.protocol === 'https:' &&
        !preferences.personalDataAutofillExcludedSites.includes(url.origin)
      );
    } catch {
      return false;
    }
  };
  const refreshAutofill = () => {
    pages.forEach((page) => {
      if (!page.isDestroyed())
        page.send(
          'personal-data-autofill-enabled',
          autofillEnabled(page) &&
            !getGroupLocks().locked(
              (pageScopes.get(page.id)?.() || '').replace(/^group:/, ''),
            ),
          getBrowserPreferences().personalDataAutofillOnFocus !== false,
        );
    });
  };
  onBrowserPreferencesChanged(refreshAutofill);
  getGroupLocks().subscribe(refreshAutofill);
  void passwordVault().prepareAutoLoginMetadata();
  passwordVault().onChange(() => {
    refreshAutofill();
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed() && isTrusted(window.webContents))
        window.webContents.send('password-manager-changed');
    });
  });
  const autofillPage = (event: Electron.IpcMainInvokeEvent) => {
    const page = pages.get(event.sender.id);
    if (
      !page ||
      page.isDestroyed() ||
      event.senderFrame !== page.mainFrame ||
      !page.getURL().startsWith('https:') ||
      getGroupLocks().locked(
        (pageScopes.get(page.id)?.() || '').replace(/^group:/, ''),
      )
    )
      throw new Error('Autofill is unavailable here.');
    return page;
  };
  const loginIdentities = new Map<
    number,
    {
      origin: string;
      scope?: string;
      username: string;
      recordId?: string;
      expires: number;
    }
  >();
  const loginIdentity = (page: WebContents) => {
    const item = loginIdentities.get(page.id);
    if (
      !item ||
      item.expires < Date.now() ||
      item.origin !== new URL(page.getURL()).origin ||
      item.scope !== pageScopes.get(page.id)?.() ||
      !autofillEnabled(page)
    ) {
      loginIdentities.delete(page.id);
      return undefined;
    }
    return item;
  };
  revocations.on('revoke', () => loginIdentities.clear());
  ipcMain.handle('personal-data-login-identity', (event, input) => {
    const page = autofillPage(event);
    if (!autofillEnabled(page)) return false;
    const scope = pageScopes.get(page.id)?.();
    let username = input?.username;
    let recordId: string | undefined;
    if (typeof input?.id === 'string') {
      username = withPersonalData((vault) => {
        const record = vault.forFill(input.id, page.getURL(), false, scope);
        recordId = record.id;
        return record.kind === 'login'
          ? record.username
          : record.fields.find(
              (field) =>
                !isProtectedField(field) &&
                [field.name, ...(field.aliases || [])].some((name) =>
                  /^(username|email)$/i.test(name),
                ),
            )?.value;
      });
    }
    if (typeof username !== 'string' || !username || username.length > 1024)
      return false;
    recordId ||=
      loginIdentity(page)?.username === username
        ? loginIdentity(page)?.recordId
        : undefined;
    const item = {
      origin: new URL(page.getURL()).origin,
      scope,
      username,
      recordId,
      expires: Date.now() + 120000,
    };
    loginIdentities.set(page.id, item);
    const timer = setTimeout(() => {
      if (loginIdentities.get(page.id) === item)
        loginIdentities.delete(page.id);
    }, 120000);
    timer.unref();
    page.once('destroyed', () => {
      clearTimeout(timer);
      loginIdentities.delete(page.id);
    });
    return true;
  });
  const pendingLogins = new Map<
    number,
    {
      origin: string;
      scope?: string;
      username: string;
      password: string;
      submittedURL: string;
      expires: number;
    }
  >();
  revocations.on('revoke', () => pendingLogins.clear());
  const pendingLogin = (page: WebContents) => {
    const item = pendingLogins.get(page.id);
    if (
      !item ||
      item.expires < Date.now() ||
      item.origin !== new URL(page.getURL()).origin ||
      item.scope !== pageScopes.get(page.id)?.() ||
      !autofillEnabled(page)
    ) {
      pendingLogins.delete(page.id);
      return undefined;
    }
    return item;
  };
  ipcMain.handle('personal-data-login-candidate', (event, input) => {
    const page = autofillPage(event);
    const username = input?.username || loginIdentity(page)?.username;
    if (
      !autofillEnabled(page) ||
      typeof username !== 'string' ||
      !username ||
      username.length > 1024 ||
      typeof input.password !== 'string' ||
      !input.password ||
      input.password.length > 1024
    )
      return false;
    const item = {
      origin: new URL(page.getURL()).origin,
      scope: pageScopes.get(page.id)?.(),
      username,
      password: input.password,
      submittedURL: page.getURL(),
      expires: Date.now() + 120000,
    };
    pendingLogins.set(page.id, item);
    const timer = setTimeout(() => {
      if (pendingLogins.get(page.id) === item) pendingLogins.delete(page.id);
    }, 120000);
    timer.unref();
    page.once('destroyed', () => {
      clearTimeout(timer);
      pendingLogins.delete(page.id);
    });
    return true;
  });
  ipcMain.handle('personal-data-login-pending', (event) => {
    try {
      const page = autofillPage(event);
      const item = pendingLogin(page);
      if (!item) return false;
      // Compare inside the vault; only the decision crosses into the page preload.
      const alreadySaved = withPersonalData((vault) =>
        hasSavedWebsiteLogin(
          vault,
          page.getURL(),
          item.scope,
          item.username,
          item.password,
        ),
      );
      if (alreadySaved) {
        pendingLogins.delete(page.id);
        return false;
      }
      return { pending: true, navigated: page.getURL() !== item.submittedURL };
    } catch {
      return false;
    }
  });
  ipcMain.handle('personal-data-login-dismiss', (event) => {
    const id = autofillPage(event).id;
    pendingLogins.delete(id);
    loginIdentities.delete(id);
  });
  ipcMain.handle('personal-data-login-save', async (event, input) => {
    const page = autofillPage(event);
    const item = pendingLogin(page);
    if (!item) throw new Error('This login is no longer available.');
    const expected = page.getURL();
    const epoch = personalDataRevision();
    if (input?.confirmUpdate === true) await authenticatePersonalData(page);
    autofillPage(event);
    if (
      page.getURL() !== expected ||
      personalDataRevision() !== epoch ||
      pendingLogin(page) !== item
    )
      throw new Error('The target page changed.');
    const result = withPersonalData((vault) => {
      if (!vault.status().enabled || !vault.status().autofill)
        throw new Error('Personal Data is disabled.');
      return saveWebsiteFields(
        vault,
        expected,
        item.scope,
        [
          {
            name: 'Username',
            value: item.username,
            secret: false,
            aliases: ['username', 'email'],
          },
          {
            name: 'Password',
            value: item.password,
            secret: true,
            aliases: ['password', 'current-password', 'new-password'],
          },
        ],
        input?.confirmUpdate === true,
        item.submittedURL,
      );
    });
    if (result.saved) {
      pendingLogins.delete(page.id);
      loginIdentities.delete(page.id);
    }
    return result;
  });
  ipcMain.handle('personal-data-autofill-focus', (event) => {
    autofillPage(event);
    return getBrowserPreferences().personalDataAutofillOnFocus !== false;
  });
  ipcMain.handle('personal-data-autofill-enabled', (event) => {
    try {
      return autofillEnabled(autofillPage(event));
    } catch {
      return false;
    }
  });
  ipcMain.handle('personal-data-autofill-position', (event, placement) => {
    const page = autofillPage(event);
    if (!autofillEnabled(page)) throw new Error('Autofill is disabled.');
    const origin = new URL(page.getURL()).origin;
    const positions =
      getBrowserPreferences().personalDataAutofillPositions || {};
    if (placement === undefined) return positions[origin] || null;
    if (
      !placement ||
      !['left', 'right'].includes(placement.side) ||
      !Number.isFinite(placement.x) ||
      Math.abs(placement.x) > 128 ||
      !Number.isFinite(placement.y) ||
      Math.abs(placement.y) > 128
    )
      throw new Error('Invalid autofill position');
    const entries = Object.entries(positions)
      .filter(([site]) => site !== origin)
      .slice(-199);
    updateBrowserPreferences({
      personalDataAutofillPositions: {
        ...Object.fromEntries(entries),
        [origin]: { side: placement.side, x: placement.x, y: placement.y },
      },
    });
    return { saved: true };
  });
  ipcMain.handle('personal-data-autofill-popup-position', (event, placement) => {
    const page = autofillPage(event);
    if (!autofillEnabled(page)) throw new Error('Autofill is disabled.');
    const origin = new URL(page.getURL()).origin;
    const positions = getBrowserPreferences().personalDataAutofillPopupPositions || {};
    if (placement === undefined) return positions[origin] || null;
    if (!validAutofillPopupPlacement(placement)) throw new Error('Invalid autofill popup position');
    const entries = Object.entries(positions).filter(([site]) => site !== origin).slice(-199);
    updateBrowserPreferences({ personalDataAutofillPopupPositions: {
      ...Object.fromEntries(entries),
      [origin]: { side: placement.side, x: placement.x, y: placement.y },
    } });
    return { saved: true };
  });
  ipcMain.handle('personal-data-autofill-availability', (event) => {
    try {
      const page = autofillPage(event);
      if (!autofillEnabled(page)) return [];
      const expected = page.getURL();
      const scope = pageScopes.get(page.id)?.();
      const cached = passwordVault().autofillAvailability(expected, scope);
      if (cached) return cached;
      // Legacy files acquire the nonsecret field index on their first normal unlock.
      // No authentication or values cross IPC for this passive UI check.
      return withPersonalData((vault) =>
        vault
          .matchingItems(expected, false, scope)
          .filter((record) =>
            ['profile', 'knowledge', 'login'].includes(record.kind),
          )
          .sort((a, b) => Number(!!b.origin) - Number(!!a.origin))
          .slice(0, 50)
          .map((record) => {
            const item = record;
            return {
              kind: item.kind,
              canFillLogin: item.kind === 'login' && !!item.password,
              fields: item.fields
                .filter((field) => field.value)
                .map((field) => ({
                  name: field.name,
                  aliases: field.aliases,
                  secret: isProtectedField(field),
                })),
            };
          }),
      );
    } catch {
      return [];
    }
  });
  ipcMain.handle('personal-data-autofill-records', async (event) => {
    const page = autofillPage(event);
    if (!autofillEnabled(page)) throw new Error('Autofill is disabled.');
    const expected = page.getURL();
    const scope = pageScopes.get(page.id)?.();
    const epoch = personalDataRevision();
    // Browsing exposes only nonsecret values and redacted secret placeholders.
    // Authentication is enforced by the secret/login fill actions instead.
    autofillPage(event);
    if (
      page.isDestroyed() ||
      page.getURL() !== expected ||
      pageScopes.get(page.id)?.() !== scope ||
      personalDataRevision() !== epoch ||
      !autofillEnabled(page)
    )
      throw new Error('The target page changed.');
    return withPersonalData((vault) =>
      vault
        .matchingItems(expected, false, scope)
        .filter(
          (record) =>
            record.kind === 'profile' ||
            record.kind === 'knowledge' ||
            record.kind === 'login',
        )
        .sort(
          (a, b) =>
            Number(!!b.origin) - Number(!!a.origin) ||
            Number(b.id === loginIdentity(page)?.recordId) -
              Number(a.id === loginIdentity(page)?.recordId),
        )
        .slice(0, 50)
        .map((record) => {
          const saved = record;
          return {
            id: saved.id,
            kind: saved.kind,
            canFillLogin: saved.kind === 'login' && !!saved.password,
            website: !!record.origin,
            selected: record.id === loginIdentity(page)?.recordId,
            username: saved.kind === 'login' ? saved.username : undefined,
            title:
              record.origin &&
              saved.title ===
                `${new URL(record.origin).hostname} · Saved inputs`
                ? new URL(record.origin).hostname
                : saved.title,
            fields: saved.fields
              .map((field, fieldIndex) =>
                isProtectedField(field)
                  ? {
                      name: field.name,
                      aliases: field.aliases,
                      secret: true,
                      value: '',
                      fieldIndex,
                    }
                  : { ...field, fieldIndex },
              )
              .filter((field) => field.secret || field.value)
              .slice(0, 100),
          };
        }),
    );
  });
  ipcMain.handle('personal-data-autofill-browse', async (event) => {
    const page = autofillPage(event);
    if (!autofillEnabled(page)) throw new Error('Autofill is disabled.');
    const expected = page.getURL();
    const scope = pageScopes.get(page.id)?.();
    const epoch = personalDataRevision();
    // Browsing exposes only nonsecret values and redacted secret placeholders.
    // Authentication is enforced by the secret/login fill actions instead.
    autofillPage(event);
    if (
      page.getURL() !== expected ||
      pageScopes.get(page.id)?.() !== scope ||
      personalDataRevision() !== epoch ||
      !autofillEnabled(page)
    )
      throw new Error('The target page changed.');
    return withPersonalData((vault) => browseSavedData(vault, scope));
  });
  ipcMain.handle('personal-data-autofill-disable-site', (event) => {
    const page = autofillPage(event);
    updateBrowserPreferences({
      personalDataAutofillExcludedSites: [
        ...getBrowserPreferences().personalDataAutofillExcludedSites,
        new URL(page.getURL()).origin,
      ],
    });
  });
  ipcMain.handle('personal-data-autofill-login', async (event, id) => {
    const page = autofillPage(event);
    if (!autofillEnabled(page) || typeof id !== 'string')
      throw new Error('Autofill is disabled.');
    const expected = page.getURL();
    const scope = pageScopes.get(page.id)?.();
    const epoch = personalDataRevision();
    await authenticatePersonalData(page);
    autofillPage(event);
    if (
      page.getURL() !== expected ||
      pageScopes.get(page.id)?.() !== scope ||
      personalDataRevision() !== epoch ||
      !autofillEnabled(page)
    )
      throw new Error('The target page changed.');
    return withPersonalData((vault) => {
      if (vault.forFill(id, expected, false, scope).kind !== 'login')
        throw new Error('Choose a saved login.');
      return fillSavedItem(page, id, false, scope);
    });
  });
  ipcMain.handle('personal-data-autofill-manage', (event) => {
    const page = autofillPage(event);
    const owner =
      BrowserWindow.fromWebContents(page) || BrowserWindow.getFocusedWindow();
    if (!owner) throw new Error('The browser window is unavailable.');
    showBrowserPreferences(
      owner,
      'passwords',
      pageScopes.get(page.id)?.() || 'browser',
    );
  });
  ipcMain.handle('personal-data-autofill-save-field', async (event, input) => {
    const page = autofillPage(event);
    if (
      input?.username !== undefined &&
      (typeof input.username !== 'string' || input.username.length > 1000)
    )
      throw new Error('Invalid input field.');
    const incoming = input?.fields === undefined ? [input] : input.fields;
    if (!autofillEnabled(page) || !Array.isArray(incoming) || !incoming.length || incoming.length > 100 ||
      incoming.some(field => !field || typeof field.name !== 'string' || !field.name.trim() || field.name.length > 200 ||
        typeof field.value !== 'string' || !field.value || field.value.length > 10000 || typeof field.secret !== 'boolean' ||
        !Array.isArray(field.aliases) || field.aliases.length > 10 ||
        field.aliases.some((alias: unknown) => typeof alias !== 'string' || alias.length > 200)))
      throw new Error('Invalid input field.');
    const expected = page.getURL();
    const scope = pageScopes.get(page.id)?.();
    const epoch = personalDataRevision();
    if (input?.confirmUpdate === true) await authenticatePersonalData(page);
    autofillPage(event);
    if (
      page.getURL() !== expected ||
      pageScopes.get(page.id)?.() !== scope ||
      personalDataRevision() !== epoch ||
      !autofillEnabled(page)
    )
      throw new Error('The target page changed.');
    return withPersonalData((vault) => {
      const fields: VaultField[] = incoming.map(field => ({
        name: field.name.trim(), value: field.value, secret: field.secret, aliases: field.aliases,
      }));
      const username =
        input.name === 'Password' && input.secret
          ? input.username || loginIdentity(page)?.username
          : undefined;
      if (username)
        fields.push({
          name: 'Username',
          value: username,
          secret: false,
          aliases: ['username', 'email'],
        });
      return saveWebsiteFields(
        vault,
        expected,
        scope,
        fields,
        input.confirmUpdate === true,
      );
    });
  });
  ipcMain.handle('personal-data-autofill-secret', async (event, input) => {
    const page = autofillPage(event);
    if (
      !autofillEnabled(page) ||
      typeof input?.id !== 'string' ||
      !Number.isInteger(input.fieldIndex) ||
      input.fieldIndex < 0
    )
      throw new Error('Choose a saved secret field.');
    const expected = page.getURL();
    const scope = pageScopes.get(page.id)?.();
    const epoch = personalDataRevision();
    await authenticatePersonalData(page);
    autofillPage(event);
    if (
      page.getURL() !== expected ||
      pageScopes.get(page.id)?.() !== scope ||
      personalDataRevision() !== epoch ||
      !autofillEnabled(page)
    )
      throw new Error('The target page changed.');
    return withPersonalData((vault) => {
      const field = vault.forFill(input.id, expected, false, scope).fields[
        input.fieldIndex
      ];
      if (!field || !isProtectedField(field))
        throw new Error('Choose a saved secret field.');
      return field.value;
    });
  });
  ipcMain.handle(
    'personal-data-autofill-save-password',
    async (event, input) => {
      const page = autofillPage(event);
      if (
        !autofillEnabled(page) ||
        !input ||
        typeof input.password !== 'string' ||
        input.password.length < 12 ||
        input.password.length > 1024 ||
        typeof input.username !== 'string' ||
        input.username.length > 1024
      )
        throw new Error('Invalid generated password.');
      const expected = page.getURL();
      const scope = pageScopes.get(page.id)?.();
      const epoch = personalDataRevision();
      if (input?.confirmUpdate === true) await authenticatePersonalData(page);
      autofillPage(event);
      if (
        page.getURL() !== expected ||
        pageScopes.get(page.id)?.() !== scope ||
        personalDataRevision() !== epoch ||
        !autofillEnabled(page)
      )
        throw new Error('The target page changed.');
      return withPersonalData((vault) => {
        if (!vault.status().enabled || !vault.status().autofill)
          throw new Error('Personal Data is disabled.');
        const fields: VaultField[] = [
          {
            name: 'Password',
            value: input.password,
            secret: true,
            aliases: ['password', 'new-password', 'current-password'],
          },
        ];
        if (input.username)
          fields.push({
            name: 'Username',
            value: input.username,
            secret: false,
            aliases: ['username', 'email'],
          });
        return saveWebsiteFields(
          vault,
          expected,
          scope,
          fields,
          input.confirmUpdate === true,
        );
      });
    },
  );
  const {
    canUseOSAuthentication,
    authenticateOS,
    usesOSAuthentication,
    readOSCredential,
    writeOSCredential,
    newOSCredential,
  } = { ...nativeAuthentication, ...authentication };
  const watch = (contents: WebContents) => {
    if (watched.has(contents)) return;
    watched.add(contents);
    const revoke = () => {
      revisions.set(contents, (revisions.get(contents) || 0) + 1);
      authorized.delete(contents);
      if (!authorized.size) store?.lock();
    };
    const owner = BrowserWindow.fromWebContents(contents);
    const stopClosed = owner ? onWindowClosed(owner, revoke) : undefined;
    contents.once('destroyed', () => {
      stopClosed?.();
      revoke();
      watched.delete(contents);
    });
    contents.on('did-start-navigation', (_event, _url, inPage, mainFrame) => {
      if (mainFrame && !inPage) revoke();
    });
  };
  let ordinaryNotesMigrated = false;
  ipcMain.handle('password-manager', async (event, request: VaultRequest) => {
    if (
      !isTrusted(event.sender) ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error('Untrusted Personal Data request.');
    if (!request || typeof request !== 'object')
      throw new Error('Invalid Personal Data request.');
    if (
      request.scope !== undefined &&
      (typeof request.scope !== 'string' ||
        !request.scope ||
        request.scope.length > 200)
    )
      throw new Error('Invalid group scope.');
    const vault = passwordVault();
    watch(event.sender);
    const frame = event.senderFrame;
    const revision = revisions.get(event.sender) || 0;
    const epoch = authEpoch;
    const grant = () => {
      if (
        event.sender.isDestroyed() ||
        !isTrusted(event.sender) ||
        event.sender.mainFrame !== frame ||
        (revisions.get(event.sender) || 0) !== revision ||
        authEpoch !== epoch
      ) {
        vault.lock();
        throw new Error('Preferences closed or changed during authentication.');
      }
      vault.retainUntilLock();
      authorized.add(event.sender);
    };
    const authenticate = async () => {
      if (authorized.has(event.sender) && !vault.status().locked) return;
      if (
        !usesOSAuthentication() &&
        (vault.status().initialized || !(await canUseOSAuthentication()))
      )
        throw new Error('Unlock with your master password first.');
      let work = pending.get(event.sender);
      if (!work) {
        work = (async () => {
          await authenticateOS();
          const credential = usesOSAuthentication()
            ? readOSCredential()
            : newOSCredential();
          if (!usesOSAuthentication()) writeOSCredential(credential);
          vault.unlock(credential, !vault.status().initialized);
          grant();
        })();
        pending.set(event.sender, work);
      }
      try {
        await work;
      } finally {
        pending.delete(event.sender);
      }
    };
    const status = async () => {
      const canUseOS = await canUseOSAuthentication();
      let state = vault.status(request.scope);
      const wasLocked = state.locked;
      const canRead =
        !wasLocked || (state.initialized && usesOSAuthentication());
      if (canRead) {
        try {
          if (wasLocked) vault.unlock(readOSCredential());
          state = vault.status(request.scope);
          const records = vault.records(request.scope);
          state.items = state.items.map((summary) => {
            const item = records.find((record) => record.id === summary.id)!;
            const visible = item.fields.filter(
              (field) => !isProtectedField(field) && item.kind !== 'payment',
            );
            return {
              ...summary,
              preview: [
                item.username,
                ...visible.slice(0, 2).map((field) => field.value),
              ]
                .filter(Boolean)
                .join(' · ')
                .slice(0, 150),
              privateCount:
                item.fields.length - visible.length + (item.password ? 1 : 0),
            };
          });
        } finally {
          if (wasLocked) vault.lock();
        }
        state.locked = wasLocked;
      }
      return {
        ...state,
        locked: !authorized.has(event.sender) || state.locked,
        authentication:
          usesOSAuthentication() || (!state.initialized && canUseOS)
            ? ('os' as const)
            : ('master' as const),
        canUseOS,
      };
    };
    if (
      ['settings', 'delete', 'reveal', 'fill', 'hide', 'reset'].includes(
        request.action,
      )
    )
      await authenticate();
    switch (request.action) {
      case 'status':
        break;
      case 'lock':
        revokeAuthorizations();
        break;
      case 'create':
        if (await canUseOSAuthentication())
          throw new Error('Use OS authentication on this device.');
        vault.unlock(request.password, true);
        grant();
        break;
      case 'createOS': {
        await authenticateOS();
        if (vault.status().initialized)
          throw new Error('A vault already exists.');
        // Recover interrupted first-time setup using the already protected OS key.
        const credential = usesOSAuthentication()
          ? readOSCredential()
          : newOSCredential();
        if (!usesOSAuthentication()) writeOSCredential(credential);
        vault.unlock(credential, true);
        grant();
        break;
      }
      case 'authenticate':
        await authenticate();
        break;
      case 'migrateOS':
        await authenticateOS();
        vault.unlock(request.password);
        try {
          writeOSCredential(request.password);
        } catch (error) {
          vault.lock();
          throw error;
        }
        vault.refreshSummary();
        grant();
        break;
      case 'unlock':
        if (usesOSAuthentication())
          throw new Error('Use OS authentication for this vault.');
        vault.unlock(request.password);
        vault.refreshSummary();
        grant();
        break;
      case 'settings':
        vault.settings(request.enabled, request.autofill, request.ai);
        if (!request.enabled || !request.ai) revokeAuthorizations();
        break;
      case 'hookSuggestions': {
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (!owner) throw new Error('Browser window unavailable.');
        return listSuggestions(owner,request.groupId);
      }
      case 'hookSuggestionRun': {
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (!owner) throw new Error('Browser window unavailable.');
        await runSuggestion(owner,request.id,request.groupId);
        return listSuggestions(owner,request.groupId);
      }
      case 'todos':
        return listTodos(request.scope, request.all === true);
      case 'todoAdd':
        if (request.id && !request.initialNote && !vault.isOrdinaryNote(request.id)) await authenticate();
        return addTodo(request.title, request.today === true, request.scope, request.id, undefined, undefined, undefined, request.initialNote);
      case 'todoDeleteCompleted':
        if (!Array.isArray(request.tasks) || !request.tasks.length || request.tasks.length > 500) throw new Error('Invalid completed tasks.');
        if (request.tasks.some(task => !vault.isOrdinaryNote(task?.noteId))) await authenticate();
        deleteCompletedTodos(request.tasks);
        return;
      case 'todoChange':
        if (!vault.isOrdinaryNote(request.id)) await authenticate();
        changeTodo(request.id, request.taskId, request.change, request.scope, request.title, request.beforeTaskId, request.todayOrder, request.date, request.markdown);
        return listTodos(request.scope);
      case 'notes':
        if (
          !ordinaryNotesMigrated &&
          vault.status().initialized &&
          (usesOSAuthentication() || !vault.status().locked)
        ) {
          withPersonalData((current) => current.migrateOrdinaryNotes());
          ordinaryNotesMigrated = true;
        }
        return vault.noteSummaries();
      case 'moveNote':
        if (
          request.destination !== undefined &&
          (typeof request.destination !== 'string' ||
            !request.destination ||
            request.destination.length > 200)
        )
          throw new Error('Invalid group scope.');
        if (!vault.isOrdinaryNote(request.id)) await authenticate();
        vault.moveNote(request.id, request.destination);
        return vault.noteSummaries();
      case 'save': {
        const placement = Object.prototype.hasOwnProperty.call(
          request,
          'destination',
        );
        if (
          placement &&
          (request.item.kind === 'note' ||
            (request.destination !== null &&
              (typeof request.destination !== 'string' ||
                !request.destination ||
                request.destination.length > 200)))
        )
          throw new Error('Invalid destination group.');
        const saveItem = () =>
          vault.save(
            request.item,
            placement ? request.destination || undefined : request.scope,
            placement ? { sourceScope: request.scope } : undefined,
          );
        if (request.item.kind === 'note') {
          const ordinary =
            !request.item.sensitive &&
            (!request.item.id ||
              vault.isOrdinaryNote(request.item.id) ||
              !vault
                .noteSummaries()
                .some((item) => item.id === request.item.id));
          if (ordinary) {
            saveItem();
            return vault.noteSummaries();
          }
          await authenticate();
          saveItem();
          return vault.noteSummaries();
        }
        if (request.item.id) {
          if (!usesOSAuthentication() && vault.status().locked)
            await authenticate();
          const needsAuthentication = withPersonalData((current) => {
            const existing = current
              .records(request.scope)
              .find((item) => item.id === request.item.id);
            return (
              !!existing &&
              (!!existing.password || existing.fields.some(isProtectedField))
            );
          });
          if (needsAuthentication) await authenticate();
        }
        // Adding a new secret does not grant access to existing secrets.
        if (
          usesOSAuthentication() ||
          (!vault.status().initialized && (await canUseOSAuthentication()))
        ) {
          const wasLocked = vault.status().locked;
          const credential = usesOSAuthentication()
            ? readOSCredential()
            : newOSCredential();
          if (!usesOSAuthentication()) writeOSCredential(credential);
          try {
            if (wasLocked)
              vault.unlock(credential, !vault.status().initialized);
            saveItem();
          } finally {
            if (wasLocked) vault.lock();
          }
        } else {
          await authenticate();
          saveItem();
        }
        break;
      }
      case 'hide':
        if (!request.scope) throw new Error('Select a group first.');
        vault.hide(request.id, request.scope);
        break;
      case 'reset':
        if (!request.scope) throw new Error('Select a group first.');
        vault.reset(request.id, request.scope);
        break;
      case 'removeScope': {
        if (
          !request.scope ||
          !['delete', 'move', 'ask'].includes(request.disposition)
        )
          throw new Error('Choose how to keep group data.');
        let { disposition } = request;
        if (disposition === 'ask') {
          const { dialog } = await import('electron');
          const owner = BrowserWindow.fromWebContents(event.sender);
          if (!owner) return { removed: false };
          const answer = await dialog.showMessageBox(owner, {
            type: 'question',
            message: 'Remove group?',
            detail:
              'Its tabs will close. Choose what happens to Personal Data saved locally or customized for this group. Browser-wide originals are preserved.',
            buttons: [
              'Cancel',
              'Move local data to browser',
              'Delete local data',
            ],
            defaultId: 0,
            cancelId: 0,
          });
          if (answer.response === 0) return { removed: false };
          disposition = answer.response === 1 ? 'move' : 'delete';
        }
        if (vault.status().initialized) {
          await authenticate();
          vault.removeScope(request.scope, disposition);
        } else vault.removeOrdinaryNoteScope(request.scope, disposition);
        return { removed: true };
      }
      case 'importPasswords': {
        const { dialog } = await import('electron');
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (!owner) throw new Error('Open Preferences to import passwords.');
        const selection = await dialog.showOpenDialog(owner, {
          title: 'Import browser passwords',
          properties: ['openFile'],
          filters: [{ name: 'Browser password export', extensions: ['csv'] }],
        });
        if (selection.canceled || !selection.filePaths[0])
          return { imported: 0, skipped: 0, canceled: true };
        const file = selection.filePaths[0];
        if (fs.statSync(file).size > 8 * 1024 * 1024)
          throw new Error('Choose a password export smaller than 8 MB.');
        const parsed = parseBrowserPasswords(
          await fs.promises.readFile(file, 'utf8'),
        );
        if (owner.isDestroyed())
          throw new Error('Preferences closed during import.');
        const review = await showBrowserDialog(owner, {
          type: 'question',
          message: `Import ${parsed.items.length} passwords?`,
          detail: `Saved in your encrypted password manager. Duplicates are skipped.${
            parsed.skipped
              ? ` ${parsed.skipped} unsupported rows were skipped.`
              : ''
          }`,
          buttons: ['Cancel', 'Import passwords'],
          defaultId: 1,
          cancelId: 0,
        });
        if (review.response !== 1)
          return { imported: 0, skipped: 0, canceled: true };
        await authenticate();
        grant();
        const imported = vault.importSyncedLogins(parsed.items);
        return {
          imported,
          skipped: parsed.skipped + parsed.items.length - imported,
        };
      }
      case 'import': {
        const { dialog } = await import('electron');
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (!owner) throw new Error('Open Preferences first.');
        const choice = await dialog.showOpenDialog(owner, {
          properties: ['openFile'],
          filters: [
            { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] },
          ],
        });
        if (choice.canceled || !choice.filePaths[0]) return status();
        const item = await importDocument(
          choice.filePaths[0],
          request.allowAI === true,
        );
        if (
          !isTrusted(event.sender) ||
          event.sender.isDestroyed() ||
          (revisions.get(event.sender) || 0) !== revision ||
          authEpoch !== epoch
        )
          throw new Error('Window changed during import.');
        if (
          usesOSAuthentication() ||
          (!vault.status().initialized && (await canUseOSAuthentication()))
        ) {
          const wasLocked = vault.status().locked;
          const credential = usesOSAuthentication()
            ? readOSCredential()
            : newOSCredential();
          if (!usesOSAuthentication()) writeOSCredential(credential);
          try {
            if (wasLocked)
              vault.unlock(credential, !vault.status().initialized);
            vault.save(item, request.scope);
          } finally {
            if (wasLocked) vault.lock();
          }
        } else {
          await authenticate();
          vault.save(item, request.scope);
        }
        break;
      }
      case 'noteDelete': {
        if (!vault.noteSummaries().some(item => item.id === request.id)) throw new Error('Note unavailable.');
        if (!vault.isOrdinaryNote(request.id)) await authenticate();
        const snapshot = vault.edit(request.id, request.scope);
        const epoch = authEpoch;
        vault.delete(request.id, request.scope);
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (owner) await showAppToast(owner, {
          id: `note-delete-${request.id}`, title: snapshot.todo ? 'To-do list deleted' : 'Note deleted', message: '',
          action: {label:'Undo',run:async()=>{
            try {
              if (snapshot.sensitive && epoch !== authEpoch) throw new Error('Unlock Personal Data before restoring this note.');
              if (vault.noteSummaries().some(item => item.id === snapshot.id)) throw new Error('Note already exists.');
              vault.save(snapshot, request.scope);
            } catch (failure) {
              await showAppToast(owner,{id:`note-restore-error-${request.id}`,title:'Unable to restore note',message:failure instanceof Error ? failure.message : 'Try again.',type:'error'});
            }
          }},
        });
        return vault.noteSummaries();
      }
      case 'delete': {
        const note = vault
          .noteSummaries()
          .some((item) => item.id === request.id);
        if (!vault.isOrdinaryNote(request.id)) await authenticate();
        vault.delete(request.id, request.scope);
        if (note) return vault.noteSummaries();
        break;
      }
      case 'edit': {
        if (vault.isOrdinaryNote(request.id))
          return vault.edit(request.id, request.scope);
        if (vault.noteSummaries().some((item) => item.id === request.id)) {
          await authenticate();
          return vault.edit(request.id, request.scope);
        }
        const publicItem = withPersonalData((current) => {
          const item = current.edit(request.id, request.scope);
          return item.password || item.fields.some(isProtectedField)
            ? undefined
            : item;
        });
        if (publicItem) return publicItem;
        await authenticate();
        return vault.edit(request.id, request.scope);
      }
      case 'reveal':
        return vault.edit(request.id, request.scope);
      case 'changePassword':
        if (usesOSAuthentication() || !authorized.has(event.sender))
          throw new Error('Master password changes are unavailable.');
        vault.changePassword(request.password);
        break;
      case 'pages':
        return Array.from(pages.values())
          .filter(
            (page) =>
              !page.isDestroyed() &&
              page.getURL().startsWith('https:') &&
              (!request.scope || pageScopes.get(page.id)?.() === request.scope),
          )
          .map((page) => ({
            id: page.id,
            title: page.getTitle(),
            url: page.getURL(),
          }));
      case 'fill': {
        const page = pages.get(request.pageId);
        if (!page || page.isDestroyed())
          throw new Error('This tab is no longer available.');
        const targetScope = pageScopes.get(page.id)?.();
        if (request.scope && targetScope !== request.scope)
          throw new Error('Choose a tab in this group.');
        const owner = BrowserWindow.fromWebContents(event.sender);
        const { dialog } = await import('electron');
        const expected = page.getURL();
        const answer = owner
          ? await dialog.showMessageBox(owner, {
              type: 'question',
              message: 'Fill saved information?',
              detail: new URL(expected).origin,
              buttons: ['Cancel', 'Fill'],
              defaultId: 0,
              cancelId: 0,
            })
          : { response: 0 };
        if (answer.response !== 1) return { filled: 0 };
        if (
          !isTrusted(event.sender) ||
          page.isDestroyed() ||
          page.getURL() !== expected
        )
          throw new Error('The target page changed.');
        return fillSavedItem(page, request.id, false, targetScope);
      }
      default:
        throw new Error('Unknown Personal Data action.');
    }
    return status();
  });
  app
    .whenReady()
    .then(() => {
      // Remove files left by a crashed, previously approved document upload.
      try {
        fs.readdirSync(app.getPath('temp'))
          .filter((name) => name.startsWith('kudiumbrowser-personal-upload-'))
          .forEach((name) =>
            fs.rmSync(path.join(app.getPath('temp'), name), {
              recursive: true,
              force: true,
            }),
          );
      } catch {
        /* Temporary storage may be unavailable. */
      }
      powerMonitor.on('suspend', revokeAuthorizations);
      powerMonitor.on('lock-screen', revokeAuthorizations);
      return undefined;
    })
    .catch(() => undefined);
  app.on('before-quit', revokeAuthorizations);
  const timer = setInterval(() => {
    if (store?.expireLock()) revokeAuthorizations();
  }, 10000);
  timer.unref();
}

export { initializeLocalStorage } from '../localStorage';
