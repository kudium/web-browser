import { storageRecoveryMessage } from '../../browser/storageRecovery';
import {
  app,
  ipcMain,
  powerMonitor,
  BrowserWindow,
  WebContents,
} from 'electron';
import path from 'path';
import { EventEmitter } from 'events';
import fs from 'fs';
import { isProtectedField } from '../../browser/passwordManager';
import { importDocument } from './documents';
import { parseBrowserPasswords } from './browserPasswords';
import { showBrowserDialog } from '../dialogs';
import type { VaultItem, VaultRequest } from '../../browser/passwordManager';
import { PasswordVault } from './vault';
import { fillDocument } from './fill';
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
  revocations.emit('revoke');
  authorized.clear();
  store?.lock();
  watched.forEach((contents) => {
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
          'vault.json'
        );
        if (!safeStorage.isFileAvailable(file))
          throw new Error(storageRecoveryMessage('your saved Personal Data'));
      }
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
  assertCurrent: () => void = () => {}
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
      'Unlock Personal Data in Preferences first, then save this attachment again.'
    );
  return vault.save(item, scope);
}
export async function authenticatePersonalData() {
  if (!passwordVault().status().locked) return;
  if (!authenticationAdapter.usesOSAuthentication())
    throw new Error('Unlock Personal Data with your master password first.');
  await authenticationAdapter.authenticateOS();
  // This only prepares a local operation; it never grants an AI secret-reading API.
}
export function registerPasswordPage(
  contents: WebContents,
  scope: () => string | undefined = () => undefined
) {
  pageScopes.set(contents.id, scope);
  if (pages.has(contents.id)) return;
  pages.set(contents.id, contents);
  contents.once('destroyed', () => {
    pages.delete(contents.id);
    pageScopes.delete(contents.id);
  });
}
export async function fillSavedItem(
  contents: WebContents,
  id: string,
  ai = false,
  scope: string | undefined = undefined
) {
  const origin = contents.getURL();
  const item = passwordVault().forFill(id, origin, ai, scope);
  try {
    // Main-frame-only filling rejects cross-origin redirects in the document itself.
    return await contents.mainFrame.executeJavaScript(
      `(${fillDocument.toString()})(${JSON.stringify({
        ...item,
        fields: item.fields,
      })},${ai})`,
      true
    );
  } catch {
    throw new Error(
      'Autofill could not complete. Inspect the page before retrying.'
    );
  }
}
export function registerPasswordManager(
  isTrusted: (contents: WebContents) => boolean,
  authentication: Partial<typeof nativeAuthentication> = {}
) {
  authenticationAdapter = { ...nativeAuthentication, ...authentication };
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
    contents.once('destroyed', () => {
      revoke();
      watched.delete(contents);
    });
    contents.on('did-start-navigation', (_event, _url, inPage, mainFrame) => {
      if (mainFrame && !inPage) revoke();
    });
    BrowserWindow.fromWebContents(contents)?.once('closed', revoke);
  };
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
              (field) => !isProtectedField(field) && item.kind !== 'payment'
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
        request.action
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
      case 'save': {
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
            vault.save(request.item, request.scope);
          } finally {
            if (wasLocked) vault.lock();
          }
        } else {
          await authenticate();
          vault.save(request.item, request.scope);
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
        }
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
          await fs.promises.readFile(file, 'utf8')
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
          request.allowAI === true
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
      case 'delete':
        vault.delete(request.id, request.scope);
        break;
      case 'edit': {
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
              (!request.scope || pageScopes.get(page.id)?.() === request.scope)
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
            })
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
  const timer = setInterval(() => store?.status(), 10000);
  timer.unref();
}

export { initializeLocalStorage } from '../localStorage';
