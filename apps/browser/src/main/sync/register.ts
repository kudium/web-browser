import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { setHookPublisher, setHookAccountStatus } from '../hookMarketplace';
import {
  authenticatePersonalData,
  withPersonalData,
  personalDataRevision,
  passwordVault,
} from '../passwordManager';
import { cloudKitAvailable, loadCloudKitBridge } from './nativeICloudRuntime';
import { nativeICloudClient } from './nativeICloudClient';
import { AccountSyncClient } from './accountClient';
import { PasswordSyncScheduler } from './passwordScheduler';
import { safeStorage } from '../localStorage';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
  updateBrowserPreferences,
} from '../preferences';
import type {
  AccountSyncAction,
  AccountSyncInput,
} from '../../browser/accountSync';

export function registerAccountSync(
  trusted: (window: BrowserWindow) => boolean,
  main: (window: BrowserWindow) => boolean
) {
  const passwordScheduler = new PasswordSyncScheduler();
  const clients = new Map<'icloud' | 'kudiumbrowser', AccountSyncClient>();
  const filename = (provider: 'icloud' | 'kudiumbrowser') =>
    path.join(
      app.getPath('userData'),
      provider === 'icloud' ? 'icloud-sync.bin' : 'account-sync.bin'
    );
  const get = (provider = getBrowserPreferences().cloudSync.provider) => {
    let client = clients.get(provider);
    if (provider === 'icloud' && !cloudKitAvailable())
      throw new Error(
        'iCloud is unavailable outside a provisioned integration build.'
      );
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(
        'Enable secure local storage before connecting sync. Restart the browser to enable it.'
      );
    if (!client) {
      const options: ConstructorParameters<typeof AccountSyncClient>[0] = {
        load: () => {
          if (!fs.existsSync(filename(provider))) return {};
          return JSON.parse(
            safeStorage.decryptString(fs.readFileSync(filename(provider)))
          );
        },
        save: (value) => {
          const file = filename(provider);
          fs.writeFileSync(
            `${file}.tmp`,
            safeStorage.encryptString(JSON.stringify(value)),
            { mode: 0o600 }
          );
          fs.renameSync(`${file}.tmp`, file);
        },
        preferences: getBrowserPreferences,
        enable: () => {
          const { cloudSync } = getBrowserPreferences();
          updateBrowserPreferences({
            cloudSync: {
              ...cloudSync,
              enabled: true,
              provider,
            },
          });
        },
        open: (url) => shell.openExternal(url),
      };
      client =
        provider === 'icloud'
          ? nativeICloudClient(options, loadCloudKitBridge())
          : new AccountSyncClient(options);
      clients.set(provider, client);
    }
    return client;
  };
  setHookPublisher((data) => get('kudiumbrowser').publishHook(data));
  setHookAccountStatus(() => {
    const status = get('kudiumbrowser').status();
    return { signedIn: status.connected, email: status.email };
  });
  ipcMain.handle(
    'account-sync',
    async (event, action: AccountSyncAction, input: AccountSyncInput = {}) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (
        !owner ||
        event.senderFrame !== event.sender.mainFrame ||
        !trusted(owner)
      )
        throw new Error('Untrusted sync request.');
      if (action === 'snapshot' && !main(owner))
        throw new Error('Only the browser can publish its workspace.');
      if (action !== 'snapshot' && action !== 'status' && main(owner))
        throw new Error('Open Sync Preferences to manage your account.');
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid sync request');
      if (
        getBrowserPreferences().cloudSync.provider === 'icloud' &&
        !cloudKitAvailable()
      ) {
        if (action === 'status' || action === 'snapshot')
          return {
            phase: 'off',
            connected: false,
            message: 'iCloud requires a provisioned integration build.',
            remote: [],
          };
        throw new Error(
          'Choose Kudium Account or use a provisioned iCloud integration build.'
        );
      }
      const instance = get();
      let operationMessage: string | undefined;
      if (action === 'status' && !main(owner)) await instance.autoUnlock();
      if (action === 'sync-notes' || action === 'restore-notes') {
        if (
          action === 'sync-notes' &&
          passwordVault()
            .noteSummaries()
            .some((note) => note.sensitive)
        )
          await authenticatePersonalData();
        const revision = personalDataRevision();
        const current = () =>
          !owner.isDestroyed() &&
          trusted(owner) &&
          personalDataRevision() === revision;
        if (!current())
          throw new Error('Window changed during authentication.');
        if (action === 'sync-notes') {
          const notes = passwordVault()
            .noteSummaries()
            .map((summary) => {
              const item = passwordVault().edit(summary.id, summary.scope);
              return {
                id: item.id,
                title: item.title,
                notes: item.notes || '',
                scope: item.scope,
                sensitive: item.sensitive === true,
              };
            });
          await instance.syncNotes(notes, current);
        } else {
          if (typeof input.recordId !== 'string')
            throw new Error('Choose a notes backup.');
          const notes = await instance.restoreNotes(input.recordId);
          if (!current()) throw new Error('Window changed during restore.');
          if (notes.some((note) => note.sensitive))
            await authenticatePersonalData();
          if (!current()) throw new Error('Window changed during restore.');
          const imported = passwordVault().importNotes(notes);
          operationMessage = `${imported} notes restored. Existing notes were kept. AI access is off for restored notes.`;
        }
      } else if (
        action === 'sync-passwords' ||
        action === 'restore-passwords'
      ) {
        if (main(owner)) throw new Error('Manage passwords in Preferences.');
        instance.assertPasswordAccess();
        await authenticatePersonalData();
        const revision = personalDataRevision();
        if (owner.isDestroyed() || !trusted(owner))
          throw new Error('Window changed during authentication.');
        if (action === 'sync-passwords') {
          const items = withPersonalData((vault) =>
            vault
              .records()
              .filter(
                (item) =>
                  !item.scope &&
                  item.kind === 'login' &&
                  item.origin &&
                  item.password
              )
              .map(({ title, origin, username, password }) => ({
                title,
                origin,
                username,
                password,
              }))
          );
          await instance.syncPasswords(items);
        } else {
          if (typeof input.recordId !== 'string')
            throw new Error('Choose a password snapshot.');
          const items = await instance.restorePasswords(input.recordId);
          if (
            owner.isDestroyed() ||
            !trusted(owner) ||
            personalDataRevision() !== revision
          )
            throw new Error('Window changed during import.');
          const imported = withPersonalData((vault) =>
            vault.importSyncedLogins(items)
          );
          operationMessage = `${imported} saved logins imported. Existing passwords were kept.`;
        }
      } else if (action === 'connect') {
        passwordScheduler.reset();
        await instance.connect(input.authMode);
      } else if (action === 'cancel') instance.cancel();
      else if (action === 'enable') await instance.enable(input);
      else if (action === 'unlock') await instance.recoverAccountKey();
      else if (action === 'reset-sync') {
        const revision = instance.connectionRevision();
        const answer = await dialog.showMessageBox(owner, {
          type: 'warning', buttons: ['Cancel', 'Reset cloud sync'], defaultId: 0, cancelId: 0, noLink: true,
          message: 'Reset cloud backups only?',
          detail: 'This permanently deletes the cloud backups for this account and prepares cloud sync for a fresh backup. Local tabs, groups, notes, passwords and browsing data will not be changed or deleted. Your current local data can be uploaded when you enable sync again. Other devices must reconnect. Backups encrypted with a lost key cannot be recovered.',
        });
        if (answer.response !== 1) return instance.status();
        if (owner.isDestroyed() || !trusted(owner) || clients.get(getBrowserPreferences().cloudSync.provider) !== instance || revision !== instance.connectionRevision()) throw new Error('Your account changed. Try resetting again.');
        passwordScheduler.reset();
        updateBrowserPreferences({ cloudSync: { ...getBrowserPreferences().cloudSync, enabled: false } });
        await instance.resetSync(true);
      }
      else if (action === 'disconnect') {
        passwordScheduler.reset();
        updateBrowserPreferences({
          cloudSync: { ...getBrowserPreferences().cloudSync, enabled: false },
        });
        await instance.disconnect();
      } else if (action === 'apply-preferences') {
        if (typeof input.recordId !== 'string')
          throw new Error('Choose a workspace.');
        updateBrowserPreferences(instance.remotePreferences(input.recordId));
      } else if (action === 'sync') await instance.sync(true);
      else if (action === 'snapshot') instance.snapshot(input);
      else if (action === 'restore') {
        if (typeof input.recordId !== 'string')
          throw new Error('Choose a workspace.');
        return instance.restore(input.recordId);
      } else if (action === 'delete-data') {
        passwordScheduler.reset();
        updateBrowserPreferences({
          cloudSync: { ...getBrowserPreferences().cloudSync, enabled: false },
        });
        await instance.deleteData();
        await instance.disconnect();
      } else if (action !== 'status') throw new Error('Invalid sync action');
      const status = instance.status();
      if (operationMessage) status.message = operationMessage;
      // Only the settings window needs the recovery key for explicit setup.
      if (main(owner)) return { ...status, recoveryKey: undefined };
      return status;
    }
  );

  let lastPasswords = 0;
  let lastPoll = 0;
  let lastSync = 0;
  const timer = setInterval(() => {
    const client = clients.get(getBrowserPreferences().cloudSync.provider);
    if (!client) return;
    const now = Date.now();
    if (now - lastPoll >= client.pollingInterval()) {
      lastPoll = now;
      client.poll().catch(() => {});
    }
    if (now - lastPasswords >= 5000) {
      lastPasswords = now;
      const instance = client;
      const revision = personalDataRevision();
      const current = () => {
        const settings = getBrowserPreferences().cloudSync;
        const status = instance.status();
        return (
          clients.get(getBrowserPreferences().cloudSync.provider) === instance &&
          status.connected &&
          status.phase === 'ready' &&
          settings.enabled &&
          (settings.provider === 'kudiumbrowser' || cloudKitAvailable()) &&
          Boolean(settings.categories.passwords) &&
          personalDataRevision() === revision &&
          !passwordVault().status().locked
        );
      };
      passwordScheduler
        .tick({
          current,
          read: () => {
            if (!current()) return undefined;
            return passwordVault()
              .records()
              .filter(
                (item) =>
                  !item.scope &&
                  item.kind === 'login' &&
                  item.origin &&
                  item.password
              )
              .map(({ title, origin, username, password }) => ({
                title,
                origin,
                username,
                password,
              }));
          },
          upload: (items, guard) => instance.syncPasswords(items, guard),
        })
        .catch(() => {});
    }
    if (now - lastSync >= 30000) {
      lastSync = now;
      client.sync().catch(() => {});
    }
  }, 1000);
  timer.unref();
  onBrowserPreferencesChanged(() => {
    passwordScheduler.reset();
    clients.forEach((client) => client.pause());
  });
  app.once('will-quit', () => {
    passwordScheduler.reset();
    clearInterval(timer);
    clients.forEach((client) => client.pause());
  });
}
