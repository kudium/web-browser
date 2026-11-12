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
import { getBrowserPreferences } from './preferences';
import { safeStorage } from './localStorage';
import { ActivityStore } from './activityStore';
import { getGroupLocks } from './groupLocks';
import { getSiteSettings, updateSiteSettings } from './siteSettings';
import type { BrowserActivity } from '../browser/activity';

let store: ActivityStore | undefined;
const watchers = new Set<WebContents>();
let lastSound = 0;
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
  getGroupLocks().subscribe(() =>
    watchers.forEach((contents) => {
      if (!contents.isDestroyed()) contents.send('browser-activity-changed');
    })
  );
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
