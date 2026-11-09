import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { app, BrowserWindow, ipcMain, WebContents } from 'electron';
import { HistoryAction, HistoryRecord } from '../browser/history';
import { expiredRecord, retentionCutoff } from '../browser/systemSpaceRetention';
import { HistoryPersistence } from './historyPersistence';

let persistence: HistoryPersistence | undefined;
let loadError: Error | undefined;
let quitting = false;
let trusted: ((contents: WebContents) => boolean) | undefined;
const filename = () =>
  path.join(app.getPath('userData'), 'browsing-history.json');
function webAddress(value: string) {
  try {
    const url = new URL(value);
    return (
      value.length <= 8192 &&
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function history(): HistoryPersistence {
  if (loadError) throw loadError;
  if (!persistence) {
    let records: HistoryRecord[] = [];
    try {
      if (fs.statSync(filename()).size > 16 * 1024 * 1024) throw new Error();
      const parsed = JSON.parse(fs.readFileSync(filename(), 'utf8'));
      if (
        !Array.isArray(parsed) ||
        !parsed.every(
          (record: HistoryRecord) =>
            record &&
            typeof record.id === 'string' &&
            typeof record.title === 'string' &&
            typeof record.url === 'string' &&
            webAddress(record.url) &&
            Number.isFinite(record.visitedAt) &&
            typeof record.profile === 'string' &&
            record.profile.length <= 256 &&
            record.id.length <= 128 &&
            record.title.length <= 1000
        )
      )
        throw new Error('Invalid history data');
      records = parsed.slice(0, 10000).map((record: HistoryRecord) => ({
        id: record.id,
        url: record.url,
        title: record.title,
        visitedAt: record.visitedAt,
        profile: record.profile,
      }));
    } catch (error) {
      if ((error as { code?: unknown })?.code !== 'ENOENT') {
        loadError = new Error(
          'Browsing history could not be read. Restore browsing-history.json before saving or deleting history; the original file has been preserved.'
        );
        throw loadError;
      }
    }
    persistence = new HistoryPersistence(filename(), records, () => {
      const windows = BrowserWindow.getAllWindows().filter(
        (window) => !window.isDestroyed() && trusted?.(window.webContents)
      );
      if (!windows.length) return;
      const snapshot = persistence!.snapshot();
      windows.forEach((window) => {
        try {
          window.webContents.send('browser-history-changed', snapshot);
        } catch {
          /* A closed receiver cannot invalidate a durable history commit. */
        }
      });
    });
  }
  return persistence;
}
export async function pruneBrowsingHistory(days: number, now = Date.now()) {
  const cutoff = retentionCutoff(days, now);
  if (cutoff === undefined) return;
  const store = history();
  if (store.snapshot().some(record => expiredRecord(record.visitedAt, cutoff)))
    await store.mutate('retention', cutoff);
}
export const getBrowsingHistory = () => history().snapshot();
export async function importBrowsingHistory(
  records: { url: string; title: string; visitedAt: number }[],
  profile: string
) {
  const store = history();
  const existing = new Set(
    store
      .snapshot()
      .map((record) =>
        JSON.stringify([record.url, record.visitedAt, record.profile])
      )
  );
  const imported: HistoryRecord[] = [];
  [...records].reverse().forEach((record) => {
    const key = JSON.stringify([record.url, record.visitedAt, profile]);
    if (!webAddress(record.url) || existing.has(key)) return;
    existing.add(key);
    imported.push({ ...record, id: randomUUID(), profile });
  });
  store.visitMany(imported);
  await store.mutate('flush');
  return imported.length;
}
export async function removeProfileHistory(profile: string) {
  await history().mutate('profile', profile);
}
export function recordVisit(url: string, title: string, profile: string) {
  if (quitting) return;
  if (typeof profile !== 'string' || profile.length > 256) return;
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    return;
  }
  if (!['http:', 'https:'].includes(address.protocol)) return;
  address.username = '';
  address.password = '';
  if (!webAddress(address.href)) return;
  let store: HistoryPersistence;
  try {
    store = history();
  } catch {
    /* Preserve unreadable originals without breaking website navigation. */
    return;
  }
  const latest = store.latest();
  if (
    latest?.url === address.href &&
    latest.profile === profile &&
    Date.now() - latest.visitedAt < 1000
  )
    return;
  try {
    store.visit({
      id: randomUUID(),
      url: address.href,
      title: title.slice(0, 1000) || address.hostname,
      visitedAt: Date.now(),
      profile,
    });
  } catch {
    /* Keep navigation working if local storage is unavailable. */
  }
}
export async function historyAction(action: HistoryAction, id?: string) {
  if (action === 'clear') await history().mutate('clear');
  else if (action === 'remove') {
    if (typeof id !== 'string' || !id || id.length > 128)
      throw new Error('Invalid history record');
    await history().mutate('remove', id);
  } else if (action !== 'get') throw new Error('Unknown history action');
  return getBrowsingHistory();
}
export const historyPersistenceDiagnostics = () => persistence?.diagnostics();
export const hasPendingHistory = () =>
  !!persistence?.diagnostics().pendingVisits;
export const setHistoryQuitting = (value: boolean) => {
  quitting = value;
};
export async function flushHistory() {
  if (loadError) throw loadError;
  await persistence?.mutate('flush');
}
export async function closeHistoryPersistence() {
  await persistence?.close();
  persistence = undefined;
  loadError = undefined;
  quitting = false;
}
export function registerHistory(isTrusted: (contents: WebContents) => boolean) {
  trusted = isTrusted;
  ipcMain.handle(
    'browser-history',
    (event, action: HistoryAction, id?: string) => {
      if (
        event.senderFrame !== event.sender.mainFrame ||
        !isTrusted(event.sender)
      )
        throw new Error('Untrusted history request');
      return historyAction(action, id);
    }
  );
}
