import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  authenticatePersonalData,
  withPersonalData,
  personalDataRevision,
  passwordVault,
} from '../passwordManager';
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
  let client: AccountSyncClient | undefined;
  const passwordScheduler = new PasswordSyncScheduler();
  const filename = () => path.join(app.getPath('userData'), 'account-sync.bin');
  const get = () => {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(
        'Enable secure local storage before connecting sync. Restart the browser to enable it.'
      );
    if (!client)
      client = new AccountSyncClient({
        load: () => {
          if (!fs.existsSync(filename())) return {};
          return JSON.parse(
            safeStorage.decryptString(fs.readFileSync(filename()))
          );
        },
        save: (value) => {
          const file = filename();
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
              provider: 'kudiumbrowser',
            },
          });
        },
        open: (url) => shell.openExternal(url),
      });
    return client;
  };
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
      const instance = get();
      let operationMessage: string | undefined;
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
          client === instance &&
          status.connected &&
          status.phase === 'ready' &&
          settings.enabled &&
          settings.provider === 'kudiumbrowser' &&
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
    client?.pause();
  });
  app.once('will-quit', () => {
    passwordScheduler.reset();
    clearInterval(timer);
    client?.pause();
  });
}
