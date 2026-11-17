/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import { markPrivateSession } from '../main/privateSessions';
import {
  trackDownloads,
  getDownloadHistory,
  getDownloadsForContents,
  performDownloadAction,
  registerDownloadLibrary,
  clearPrivateDownloads,
} from '../main/downloads';

jest.mock('electron', () => ({
  app: { getPath: jest.fn() },
  BrowserWindow: { getAllWindows: jest.fn(() => []) },
  ipcMain: { handle: jest.fn() },
  shell: { openPath: jest.fn(async () => ''), showItemInFolder: jest.fn() },
  screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }) },
}));
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({ askDownloadLocation: false }),
}));
jest.mock('../main/downloadAnimation', () => ({
  animateDownload: async () => {},
}));

it('isolates private lists, broadcasts and controls without writing history or deleting saved files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-downloads-'));
  (app.getPath as jest.Mock).mockReturnValue(root);
  const regular = new EventEmitter() as any;
  const first = new EventEmitter() as any;
  const second = new EventEmitter() as any;
  markPrivateSession(first);
  markPrivateSession(second);
  const host = (session: any) => ({
    isDestroyed: () => false,
    webContents: { session, send: jest.fn() },
  });
  const hosts = [host(regular), host(first), host(second)];
  (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue(hosts);
  registerDownloadLibrary(jest.fn(), () => true);
  [regular, first, second].forEach(trackDownloads);
  const contents = { id: 1, session: first };
  const download = (session: any, name: string, source?: any) => {
    let state = 'progressing';
    let savePath = '';
    const item = Object.assign(new EventEmitter(), {
      getFilename: () => name,
      getURLChain: () => ['https://example.test/private-file'],
      getSavePath: () => savePath,
      setSavePath: jest.fn((value: string) => {
        savePath = value;
      }),
      setSaveDialogOptions: jest.fn(),
      getMimeType: () => 'text/plain',
      getTotalBytes: () => 8,
      getReceivedBytes: () => (state === 'completed' ? 8 : 0),
      getState: () => state,
      isPaused: () => false,
      canResume: () => false,
      cancel: jest.fn(() => {
        state = 'cancelled';
        item.emit('done', {}, state);
      }),
    });
    session.emit('will-download', {}, item, source);
    return {
      item,
      complete: () => {
        if (!savePath) item.setSavePath(path.join(root, name));
        fs.writeFileSync(savePath, 'download');
        state = 'completed';
        item.emit('done', {}, state);
      },
    };
  };
  try {
    const saved = download(regular, 'regular.txt');
    saved.complete();
    const historyFile = path.join(root, 'download-history.json');
    const diskBefore = fs.readFileSync(historyFile);
    hosts.forEach((win) => win.webContents.send.mockClear());
    const privateFile = download(first, 'private.txt', contents);
    expect(privateFile.item.setSavePath).not.toHaveBeenCalled();
    expect(privateFile.item.setSaveDialogOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save private download' }),
    );
    privateFile.complete();
    const active = download(first, 'active.txt', contents);
    const other = download(second, 'other.txt');
    other.complete();
    expect(fs.readFileSync(historyFile)).toEqual(diskBefore);
    expect(getDownloadHistory().map((record) => record.name)).toEqual([
      'regular.txt',
    ]);
    expect(getDownloadHistory(first)).toHaveLength(2);
    expect(getDownloadHistory(second).map((record) => record.name)).toEqual([
      'other.txt',
    ]);
    expect(hosts[0].webContents.send).not.toHaveBeenCalled();
    expect(
      hosts[1].webContents.send.mock.calls.every(([, list]) =>
        list.every((record: any) => record.name !== 'other.txt'),
      ),
    ).toBe(true);
    const record = getDownloadsForContents(contents as any).find(
      (entry) => entry.state === 'completed',
    )!;
    const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([channel]) => channel === 'browser-downloads',
    )[1];
    const frame = {};
    const event = {
      sender: { session: second, mainFrame: frame },
      senderFrame: frame,
    };
    await expect(handler(event, 'cancel', record.id)).rejects.toThrow(
      'no longer in history',
    );
    await expect(performDownloadAction('open-file', record.id)).rejects.toThrow(
      'no longer in history',
    );
    const retry = download(first, 'retry-private.txt');
    retry.item.cancel();
    const retryRecord = getDownloadHistory(first).find(
      (entry) => entry.name === 'retry-private.txt',
    )!;
    expect(retryRecord.retryable).toBe(true);
    expect(retryRecord).not.toHaveProperty('retrySource');
    first.downloadURL = jest.fn();
    await performDownloadAction('retry', retryRecord.id, first);
    expect(first.downloadURL).toHaveBeenCalledWith(
      'https://example.test/private-file',
    );
    await expect(
      performDownloadAction('retry', retryRecord.id, second),
    ).rejects.toThrow('no longer in history');
    expect(fs.readFileSync(historyFile)).toEqual(diskBefore);
    await performDownloadAction('clear');
    expect(getDownloadsForContents(contents as any)).toHaveLength(2);
    await performDownloadAction('clear', undefined, first);
    expect(getDownloadHistory(first)).toHaveLength(1);
    expect(fs.readFileSync(record.path, 'utf8')).toBe('download');
    clearPrivateDownloads(first);
    expect(active.item.cancel).toHaveBeenCalledTimes(1);
    expect(getDownloadHistory(first)).toEqual([]);
    expect(getDownloadHistory(second)).toHaveLength(1);
    expect(fs.readFileSync(record.path, 'utf8')).toBe('download');
  } finally {
    clearPrivateDownloads(first);
    clearPrivateDownloads(second);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
