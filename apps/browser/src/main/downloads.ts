import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import {
  app,
  BrowserWindow,
  DownloadItem,
  ipcMain,
  IpcMainInvokeEvent,
  MenuItemConstructorOptions,
  Session,
  session,
  shell,
  WebContents,
} from 'electron';
import { expiredRecord, retentionCutoff } from '../browser/systemSpaceRetention';
import { nativeMenuLabels } from '../browser/menuLabels';
import {
  DownloadAction,
  DownloadRecord,
  DownloadRecoveryInfo,
  downloadKind,
} from '../browser/downloads';
import { getBrowserPreferences } from './preferences';
import { ThumbnailCache } from './thumbnailCache';
import { parseDownloadRecords } from './downloadRecords';
import { loadDownloadImage } from './localImage';
import { watchIPCRequest } from './ipcRequestBinding';

const sessions = new Set<Session>();
const items = new Map<string, DownloadItem>();
const owners = new WeakMap<DownloadItem, Session>();
const savePickers = new WeakSet<DownloadItem>();
const sourceContents = new Map<string, number>();
const sourceKeys = new WeakMap<WebContents, string>();
export const bindDownloadSource = (
  contents: WebContents,
  sourceKey: string
) => {
  sourceKeys.set(contents, sourceKey);
};
const thumbnails = new ThumbnailCache();
let records: DownloadRecord[] | undefined;
let recoveryBlocked = false;
let recoveryFile: string | undefined;
let recoveryCleared = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let opener: (() => void) | undefined;
let trusted: ((contents: WebContents) => boolean) | undefined;
const filename = () =>
  path.join(app.getPath('userData'), 'download-history.json');
function history() {
  if (!records) {
    let raw: Buffer | undefined;
    const preserve = () => {
      if (!raw) {
        recoveryBlocked = true;
        return;
      }
      try {
        const digest = createHash('sha256').update(raw).digest('hex');
        let backup = `${filename()}.recovery-${digest}.json`;
        if (fs.existsSync(backup)) {
          const file = fs.lstatSync(backup);
          if (
            file.isFile() &&
            file.size === raw.length &&
            fs.readFileSync(backup).equals(raw)
          ) {
            recoveryFile = backup;
            return;
          }
          backup = `${filename()}.recovery-${digest}-${randomUUID()}.json`;
        }
        fs.writeFileSync(backup, raw, { mode: 0o600, flag: 'wx' });
        recoveryFile = backup;
      } catch {
        recoveryBlocked = true;
      }
    };
    try {
      if (fs.statSync(filename()).size > 16 * 1024 * 1024)
        throw new Error('History too large');
      raw = fs.readFileSync(filename());
      if (raw.length > 16 * 1024 * 1024) {
        raw = undefined;
        throw new Error('History too large');
      }
      const parsed = parseDownloadRecords(JSON.parse(raw.toString('utf8')));
      records = parsed.records;
      if (parsed.damaged) preserve();
    } catch (error) {
      records = [];
      if ((error as { code?: string }).code !== 'ENOENT') preserve();
    }
  }
  return records!;
}
export function getDownloadRecovery(): DownloadRecoveryInfo {
  history();
  let status: DownloadRecoveryInfo['status'] = 'none';
  if (recoveryFile && !recoveryCleared) status = 'recovered';
  if (recoveryBlocked) status = 'blocked';
  const target = recoveryBlocked ? filename() : recoveryFile;
  return {
    status,
    canReveal: status !== 'none' && Boolean(target && fs.existsSync(target)),
  };
}
function completedFile(record: DownloadRecord) {
  if (
    record.state !== 'completed' ||
    !path.isAbsolute(record.path) ||
    record.path.includes('\0')
  )
    return false;
  try {
    return fs.lstatSync(record.path).isFile();
  } catch {
    return false;
  }
}
export const getDownloadHistory = () =>
  history()
    .map((record) => ({
      ...record,
      active: items.has(record.id),
      awaitingSaveLocation: Boolean(
        items.get(record.id) &&
          savePickers.has(items.get(record.id)!) &&
          !items.get(record.id)!.getSavePath()
      ),
      resumable: items.get(record.id)?.canResume() || false,
    }))
    .sort((a, b) => b.startedAt - a.startedAt);
export const getDownloadsForContents = (contents: WebContents) =>
  getDownloadHistory().filter(
    (record) =>
      sourceContents.get(record.id) === contents.id ||
      (!!record.sourceKey && record.sourceKey === sourceKeys.get(contents))
  );

function publish() {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed() && trusted?.(window.webContents))
      window.webContents.send(
        'browser-downloads-changed',
        getDownloadHistory()
      );
  });
}
function saveRecords(next: DownloadRecord[]) {
  if (recoveryBlocked)
    throw new Error(
      'Download history could not be preserved. Existing history was not changed.'
    );
  fs.mkdirSync(path.dirname(filename()), { recursive: true });
  fs.writeFileSync(`${filename()}.tmp`, JSON.stringify(next), {
    mode: 0o600,
  });
  fs.renameSync(`${filename()}.tmp`, filename());
}
function commitRecords(next: DownloadRecord[]) {
  saveRecords(next);
  records = next;
  const retained = new Set(next.map((record) => record.id));
  sourceContents.forEach((_owner, id) => {
    if (!retained.has(id)) sourceContents.delete(id);
  });
  if (timer) clearTimeout(timer);
  timer = undefined;
  publish();
}
export function pruneDownloadHistory(days: number, now = Date.now()) {
  const cutoff = retentionCutoff(days, now);
  if (cutoff === undefined) return 0;
  const current = history();
  if (recoveryBlocked) return 0;
  const next = current.filter(record => items.has(record.id) || !expiredRecord(record.endedAt ?? record.startedAt, cutoff));
  if (next.length === current.length) return 0;
  commitRecords(next);
  return current.length - next.length;
}
function persist() {
  try {
    saveRecords(history());
  } catch {
    // eslint-disable-next-line no-console
    console.error('Unable to save download history');
  }
  publish();
}
function changed(immediate = false) {
  if (immediate) {
    if (timer) clearTimeout(timer);
    timer = undefined;
    persist();
  } else if (!timer)
    timer = setTimeout(() => {
      timer = undefined;
      persist();
    }, 250);
}
export const hasActiveDownloads = (browserSession: Session) =>
  [...items.values()].some(
    (item) =>
      owners.get(item) === browserSession && item.getState() === 'progressing'
  );
function occupiedPath(entryPath: string) {
  try {
    fs.lstatSync(entryPath);
    return true;
  } catch {
    return false;
  }
}
export function trackDownloads(browserSession: Session) {
  if (sessions.has(browserSession)) return;
  sessions.add(browserSession);
  browserSession.on('will-download', (_, item, contents) => {
    const id = randomUUID();
    if (contents) sourceContents.set(id, contents.id);
    const preferences = getBrowserPreferences();
    const directory = preferences.downloadDirectory || app.getPath('downloads');
    const suggested = Array.from(path.basename(item.getFilename()))
      .filter(
        (character) =>
          character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127
      )
      .join('');
    const name =
      !suggested || suggested === '.' || suggested === '..'
        ? 'download'
        : suggested;
    let destination = path.join(directory, name);
    let suffix = 1;
    const activePaths = new Set(
      [...items.values()].map((active) => active.getSavePath())
    );
    while (occupiedPath(destination) || activePaths.has(destination)) {
      const parsed = path.parse(name);
      destination = path.join(
        directory,
        `${parsed.name} (${suffix})${parsed.ext}`
      );
      suffix += 1;
    }
    if (preferences.askDownloadLocation) {
      savePickers.add(item);
      item.setSaveDialogOptions({ defaultPath: destination });
    } else item.setSavePath(destination);
    const record: DownloadRecord = {
      id,
      sourceKey: contents ? sourceKeys.get(contents) : undefined,
      name: path.basename(item.getSavePath() || destination),
      path: item.getSavePath() || destination,
      mime: item.getMimeType(),
      startedAt: Date.now(),
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      state: 'progressing',
      paused: false,
    };
    history().push(record);
    items.set(id, item);
    owners.set(item, browserSession);
    const update = () => {
      record.path = item.getSavePath() || record.path;
      record.name = path.basename(record.path);
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.state = item.getState();
      record.paused = item.isPaused();
    };
    item.on('updated', () => {
      update();
      changed();
    });
    item.once('done', (_event, state) => {
      update();
      record.state = state;
      record.paused = false;
      record.endedAt = Date.now();
      items.delete(id);
      changed(true);
    });
    changed(true);
  });
}
// Register before browser views load so downloads from native viewers and
// other browser-owned contents use the same library as regular tabs.
export function registerDownloadTracking() {
  app.on('session-created', trackDownloads);
  return app.whenReady().then(() => trackDownloads(session.defaultSession));
}

export async function performDownloadAction(
  action: DownloadAction,
  id?: string
) {
  if (
    ![
      'get',
      'open',
      'open-file',
      'reveal',
      'pause',
      'resume',
      'cancel',
      'remove',
      'clear',
      'reveal-recovery',
    ].includes(action) ||
    (id !== undefined && (typeof id !== 'string' || id.length > 128))
  )
    throw new Error('Invalid download request');
  if (action === 'reveal-recovery') {
    history();
    const target = recoveryBlocked ? filename() : recoveryFile;
    if (!target || !fs.existsSync(target))
      throw new Error('The recovery file is no longer available.');
    shell.showItemInFolder(target);
    return getDownloadHistory();
  }
  if (action === 'get') return getDownloadHistory();
  if (action === 'open') {
    opener?.();
    return getDownloadHistory();
  }
  if (action === 'clear') {
    commitRecords(history().filter((record) => items.has(record.id)));
    thumbnails.clear();
    recoveryCleared = true;
    return getDownloadHistory();
  }
  const record = history().find((entry) => entry.id === id);
  if (!record) throw new Error('Download is no longer in history');
  const item = items.get(record.id);
  if (action === 'remove') {
    if (item)
      throw new Error('Finish or cancel this download before removing it');
    commitRecords(history().filter((entry) => entry.id !== id));
    thumbnails.delete(record.id);
  } else if (action === 'open-file' || action === 'reveal') {
    if (!completedFile(record))
      throw new Error('The downloaded file was moved, removed or replaced');
    if (action === 'reveal') shell.showItemInFolder(record.path);
    else if (await shell.openPath(record.path))
      throw new Error('The file could not be opened');
  } else if (['pause', 'resume', 'cancel'].includes(action)) {
    if (!item || !['progressing', 'interrupted'].includes(item.getState()))
      throw new Error('This download is no longer active');
    if (action === 'pause') item.pause();
    if (action === 'resume') {
      if (item.getState() === 'interrupted' && !item.canResume())
        throw new Error('This download cannot be resumed');
      item.resume();
    }
    if (action === 'cancel') item.cancel();
    record.paused = item.isPaused();
    changed(true);
  } else throw new Error('Unknown download action');
  return getDownloadHistory();
}
export async function controlTabDownload(
  contents: WebContents,
  id: string,
  action: 'pause' | 'resume' | 'cancel'
) {
  if (!getDownloadsForContents(contents).some((record) => record.id === id))
    throw new Error('Download does not belong to this tab.');
  await performDownloadAction(action, id);
  return getDownloadsForContents(contents);
}

export function registerDownloadLibrary(
  open: () => void,
  isTrusted: (contents: WebContents) => boolean
) {
  opener = open;
  trusted = isTrusted;
  const check = (event: IpcMainInvokeEvent) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      !isTrusted(event.sender)
    )
      throw new Error('Untrusted download request');
  };
  ipcMain.handle(
    'browser-downloads',
    async (event, action: DownloadAction, id?: string) => {
      check(event);
      return performDownloadAction(action, id);
    }
  );
  ipcMain.handle('browser-download-recovery', (event) => {
    check(event);
    return getDownloadRecovery();
  });
  ipcMain.handle('browser-download-thumbnail', async (event, id: string) => {
    check(event);
    if (typeof id !== 'string' || !id || id.length > 128)
      throw new Error('Invalid download request');
    const record = history().find((entry) => entry.id === id);
    if (
      !record ||
      record.state !== 'completed' ||
      !path.isAbsolute(record.path) ||
      record.path.includes('\0')
    )
      return null;
    const binding = watchIPCRequest(event, isTrusted);
    const assertCurrent = () => {
      binding.assert();
      if (!history().includes(record)) throw new Error('Download was removed.');
    };
    try {
      const file = await fs.promises.lstat(record.path).catch(() => null);
      assertCurrent();
      if (!file?.isFile()) return null;
      const data = await thumbnails.get(id, async () => {
        assertCurrent();
        let preview: string | null = null;
        if (downloadKind(record) === 'Images') {
          try {
            preview = await loadDownloadImage(record.path, assertCurrent);
          } catch {
            assertCurrent();
          }
        }
        // Unsupported/oversized previews still display the OS file-type icon.
        if (preview === null) {
          const icon = await app.getFileIcon(record.path, { size: 'small' });
          assertCurrent();
          preview = icon.toDataURL();
        }
        return preview;
      });
      assertCurrent();
      return data;
    } finally {
      binding.dispose();
    }
  });
}
export function downloadMenu(): MenuItemConstructorOptions[] {
  return [
    { label: 'Download history…', click: () => opener?.() },
    ...getDownloadHistory()
      .slice(0, 15)
      .map((record) => ({
        label: `${record.name} · ${record.state}`,
        submenu: [
          {
            label: nativeMenuLabels.showInFolder,
            enabled: record.state === 'completed',
            click: () => {
              performDownloadAction('reveal', record.id).catch(() => {});
            },
          },
          {
            label: record.paused ? 'Resume' : 'Pause',
            enabled: items.has(record.id),
            click: () => {
              performDownloadAction(
                record.paused ? 'resume' : 'pause',
                record.id
              ).catch(() => {});
            },
          },
          {
            label: 'Cancel',
            enabled: items.has(record.id),
            click: () => {
              performDownloadAction('cancel', record.id).catch(() => {});
            },
          },
        ],
      })),
  ];
}
