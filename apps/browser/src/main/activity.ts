import { ALL_GROUPS_HOOK_SCOPE } from '../browser/hookMarketplace';
import { getGlobalHooks, saveGlobalHooks, globalHookHash } from './globalHooks';
import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  WebContents,
} from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { playActivitySound } from './activitySound';
import { getBrowserPreferences, onBrowserPreferencesChanged } from './preferences';
import { showAppToast, dismissAppToast } from './appToast';
import { safeStorage } from './localStorage';
import { ActivityStore } from './activityStore';
import { getGroupLocks } from './groupLocks';
import { getSiteSettings, updateSiteSettings } from './siteSettings';
import type { BrowserActivity } from '../browser/activity';

let store: ActivityStore | undefined;
const watchers = new Set<WebContents>();
let lastSound = 0;
const toastIds = new Set<string>();
function clearStaleToasts(entries: BrowserActivity[]) {
  const unread = new Set(entries.filter(entry => !entry.asRead &&
    (!entry.groupId || !getGroupLocks().locked(entry.groupId))).map(entry => entry.id));
  for (const id of toastIds) if (!getBrowserPreferences().activityToasts || !unread.has(id)) {
    toastIds.delete(id);
    dismissAppToast('activity-' + id);
  }
}
function activityToast(entry: BrowserActivity) {
  const windows = BrowserWindow.getAllWindows().filter(window =>
    !window.isDestroyed() && watchers.has(window.webContents) && window.isVisible() && !window.isMinimized());
  const owner = windows.find(window => window.isFocused()) || windows[0];
  if (!owner) return;
  const current = () => browserActivity().list().find(item => item.id === entry.id && !item.asRead &&
    (!item.groupId || !getGroupLocks().locked(item.groupId)));
  const read = () => { if (current()) browserActivity().read(entry.id); };
  toastIds.add(entry.id);
  void showAppToast(owner, {
    id: 'activity-' + entry.id, title: entry.title,
    message: (entry.message || 'New activity in Kudium').slice(0, 500),
    type: 'info', onDismiss: read,
    action: entry.noteId || entry.url ? {
      label: entry.noteId ? 'Open note' : 'Open page',
      run: () => {
        const latest = current();
        if (!latest || owner.isDestroyed() || !getBrowserPreferences().activityToasts) return;
        browserActivity().read(entry.id);
        owner.webContents.send('browser-activity-action', latest);
      },
    } : undefined,
  }).catch(() => { toastIds.delete(entry.id); });
}
export function browserActivity() {
  if (!store) {
    const file = path.join(app.getPath('userData'), 'activity.bin');
    store = new ActivityStore({
      created: (entry) => {
        if (
          entry.asRead ||
          (entry.groupId && getGroupLocks().locked(entry.groupId))
        )
          return;
        const preferences = getBrowserPreferences();
        if (preferences.activityToasts) activityToast(entry);
        const now = Date.now();
        if (preferences.activitySound && now - lastSound >= 1500) {
          lastSound = now;
          playActivitySound(preferences.activitySoundName);
        }
        if (preferences.activityNotifications && Notification.isSupported()) {
          const notification = new Notification({
            title: entry.title,
            body: entry.message || 'New activity in Kudium',
            silent: true,
          });
          notification.on('click', () => {
            if (entry.groupId && getGroupLocks().locked(entry.groupId)) return;
            const windows = BrowserWindow.getAllWindows().filter(
              (window) =>
                !window.isDestroyed() && watchers.has(window.webContents)
            );
            const window =
              windows.find((candidate) => candidate.isFocused()) || windows[0];
            if (!window) return;
            if (window.isMinimized()) window.restore();
            window.show();
            window.focus();
            window.webContents.send('browser-open-activity', entry.id);
          });
          notification.on('failed', () => {
            /* OS notification settings may block banners. */
          });
          notification.show();
        }
      },
      load: () => {
        if (!fs.existsSync(file)) return [];
        if (fs.statSync(file).size > 16 * 1024 * 1024)
          throw new Error('Activity store is too large.');
        const entries = JSON.parse(
          safeStorage.decryptString(fs.readFileSync(file))
        );
        if (!Array.isArray(entries) || entries.length > 1000)
          throw new Error('Invalid activity store.');
        return entries as BrowserActivity[];
      },
      save: (entries) => {
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
          fs.writeFileSync(
            temporary,
            safeStorage.encryptString(JSON.stringify(entries)),
            { mode: 0o600, flag: 'wx' }
          );
          fs.renameSync(temporary, file);
        } finally {
          if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
        clearStaleToasts(entries);
        watchers.forEach((contents) => {
          if (!contents.isDestroyed())
            contents.send('browser-activity-changed');
        });
      },
    });
  }
  return store;
}
export function registerActivity(
  isTrusted: (contents: WebContents) => boolean
) {
  onBrowserPreferencesChanged(() => { if (store) clearStaleToasts(store.list()); });
  getGroupLocks().subscribe(() => {
    if (store) clearStaleToasts(store.list());
    watchers.forEach((contents) => {
      if (!contents.isDestroyed()) contents.send('browser-activity-changed');
    });
  });
  ipcMain.handle(
    'browser-activity',
    (event, request: { action?: unknown; id?: unknown }) => {
      if (
        !isTrusted(event.sender) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error('Unauthorized activity request.');
      if (!watchers.has(event.sender)) {
        watchers.add(event.sender);
        event.sender.once('destroyed', () => watchers.delete(event.sender));
      }
      const visible = browserActivity()
        .list()
        .filter(
          (entry) => !entry.groupId || !getGroupLocks().locked(entry.groupId)
        );
      if (request?.action === 'list') return visible;
      if (request?.action === 'testSound') {
        playActivitySound(getBrowserPreferences().activitySoundName);
        return undefined;
      }
      if (request?.action === 'disableHook') {
        const entry = visible.find((item) => item.id === request.id);
        if (!entry || entry.source !== 'hook' || !entry.trigger)
          throw new Error('Hook source is unavailable.');
        const { profile, origin, hookId } = entry.trigger;
        if (hookId?.startsWith('global:')) {
          const all = hookId.startsWith('global:all:');
          const hookScope = all ? ALL_GROUPS_HOOK_SCOPE : profile;
          const id = hookId.slice(all ? 'global:all:'.length : 'global:'.length);
          const global = getGlobalHooks(hookScope);
          if (!global.hooks.some(hook => hook.id === id)) throw new Error('This hook was removed.');
          saveGlobalHooks(hookScope, { ...global, hooks: global.hooks.map(hook => hook.id === id ? { ...hook, enabled: false } : hook) }, globalHookHash(global));
          return undefined;
        }
        const config = getSiteSettings(profile, origin).developer;
        if (!config) throw new Error('This hook was removed.');
        if (hookId && !config.hooks?.some((hook) => hook.id === hookId))
          throw new Error('This hook was removed.');
        updateSiteSettings(profile, origin, {
          developer: hookId
            ? {
                ...config,
                hooks: config.hooks?.map((hook) =>
                  hook.id === hookId ? { ...hook, enabled: false } : hook
                ),
              }
            : { ...config, enabled: false },
        });
        return undefined;
      }

      if (request?.action === 'read' || request?.action === 'delete') {
        if (
          typeof request.id !== 'string' ||
          !visible.some((entry) => entry.id === request.id)
        )
          throw new Error('Activity unavailable.');
        if (request.action === 'delete') browserActivity().delete(request.id);
        else browserActivity().read(request.id);
        return undefined;
      }
      if (request?.action === 'clearAll') {
        browserActivity().delete(visible.map((entry) => entry.id));
        return undefined;
      }
      if (request?.action === 'readAll') {
        browserActivity().read(
          visible.filter((entry) => !entry.asRead).map((entry) => entry.id)
        );
        return undefined;
      }
      throw new Error('Invalid activity request.');
    }
  );
}
