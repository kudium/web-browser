import { app, ipcMain, WebContents } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { safeStorage } from './localStorage';
import { ActivityStore } from './activityStore';
import { getGroupLocks } from './groupLocks';
import type { BrowserActivity } from '../browser/activity';

let store: ActivityStore | undefined;
const watchers = new Set<WebContents>();
export function browserActivity() {
  if (!store) {
    const file = path.join(app.getPath('userData'), 'activity.bin');
    store = new ActivityStore({
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
