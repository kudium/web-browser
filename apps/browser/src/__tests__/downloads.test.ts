import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { app, shell, ipcMain, session as electronSession } from 'electron';
import {
  getDownloadHistory,
  performDownloadAction,
  registerDownloadLibrary,
  trackDownloads,
} from '../main/downloads';
import { getBrowserPreferences } from '../main/preferences';
import { downloadKind, downloadDateGroup } from '../browser/downloads';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
    on: jest.fn(),
    whenReady: jest.fn(async () => {}),
  },
  session: { defaultSession: { on: jest.fn() } },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openPath: jest.fn(async () => ''), showItemInFolder: jest.fn() },
  ipcMain: { handle: jest.fn() },
  nativeImage: {},
}));
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: jest.fn(() => ({ askDownloadLocation: false })),
}));

it('persists completed history and clears records without deleting files or active downloads', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-downloads-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  const session = new EventEmitter();
  const create = (name: string) => {
    const item = Object.assign(new EventEmitter(), {
      getFilename: () => name,
      getSavePath: () => path.join(directory, name),
      setSavePath: jest.fn(),
      getMimeType: () => 'text/plain',
      getTotalBytes: () => 10,
      getReceivedBytes: () => 10,
      getState: () => 'progressing',
      isPaused: () => false,
      canResume: () => false,
    });
    session.emit('will-download', {}, item);
    return item;
  };
  try {
    trackDownloads(session as never);
    const completed = create('finished.txt');
    fs.writeFileSync(path.join(directory, 'finished.txt'), 'download');
    completed.emit('done', {}, 'completed');
    create('active.txt');
    const history = getDownloadHistory();
    expect(history).toHaveLength(2);
    const record = history.find((entry) => entry.state === 'completed')!;
    expect(
      JSON.parse(
        fs.readFileSync(path.join(directory, 'download-history.json'), 'utf8')
      )
    ).toHaveLength(2);
    await performDownloadAction('open-file', record.id);
    expect(shell.openPath).toHaveBeenCalledWith(record.path);
    await expect(
      performDownloadAction('open-file', '/etc/passwd')
    ).rejects.toThrow();
    await expect(
      performDownloadAction(
        'remove',
        history.find((entry) => entry.state === 'progressing')!.id
      )
    ).rejects.toThrow();
    const disk = fs.readFileSync(
      path.join(directory, 'download-history.json'),
      'utf8'
    );
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('Disk unavailable');
    });
    try {
      await expect(performDownloadAction('clear')).rejects.toThrow(
        'Disk unavailable'
      );
      await expect(performDownloadAction('remove', record.id)).rejects.toThrow(
        'Disk unavailable'
      );
      expect(getDownloadHistory()).toEqual(history);
      expect(
        fs.readFileSync(path.join(directory, 'download-history.json'), 'utf8')
      ).toBe(disk);
    } finally {
      rename.mockRestore();
    }
    await performDownloadAction('clear');
    expect(getDownloadHistory()).toHaveLength(1);
    expect(fs.readFileSync(record.path, 'utf8')).toBe('download');
    registerDownloadLibrary(jest.fn(), () => false);
    const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([channel]) => channel === 'browser-downloads'
    )[1];
    await expect(
      handler({ sender: { mainFrame: {} }, senderFrame: {} }, 'clear')
    ).rejects.toThrow('Untrusted');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('groups downloads by date and identifies common file types', () => {
  const record = { name: 'photo.png', mime: '' } as never;
  expect(downloadKind(record)).toBe('Images');
  expect(downloadKind({ name: 'report.pdf', mime: '' } as never)).toBe(
    'Documents'
  );
  const now = new Date(2026, 10, 4, 12);
  expect(downloadDateGroup(new Date(2026, 10, 4).getTime(), now)).toBe('Today');
  expect(downloadDateGroup(new Date(2026, 10, 3).getTime(), now)).toBe(
    'Yesterday'
  );
});

it('preserves damaged native history before sanitizing and refuses replaced file targets', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-download-recovery-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  const file = path.join(directory, 'file.txt');
  const target = path.join(directory, 'replacement.txt');
  fs.writeFileSync(file, 'download');
  fs.writeFileSync(target, 'replacement');
  const good = {
    id: 'kept',
    name: 'file.txt',
    path: file,
    mime: 'text/plain',
    startedAt: 1,
    receivedBytes: 8,
    totalBytes: 8,
    state: 'completed',
  };
  const raw = JSON.stringify([
    good,
    { ...good, path: target },
    null,
    { ...good, id: 'relative', path: '../outside' },
  ]);
  const historyFile = path.join(directory, 'download-history.json');
  fs.writeFileSync(historyFile, raw);
  let isolated!: typeof import('../main/downloads');
  jest.isolateModules(() => {
    // Reload native storage state to exercise startup from this fixture.
    // eslint-disable-next-line global-require
    isolated = require('../main/downloads');
  });
  try {
    expect(isolated.getDownloadHistory()).toHaveLength(1);
    expect(isolated.getDownloadHistory()[0]).toMatchObject(good);
    const backup = fs
      .readdirSync(directory)
      .find((name) => name.includes('.recovery-'))!;
    expect(fs.readFileSync(path.join(directory, backup), 'utf8')).toBe(raw);
    expect(fs.readFileSync(historyFile, 'utf8')).toBe(raw);
    expect(isolated.getDownloadRecovery()).toEqual({
      status: 'recovered',
      canReveal: true,
    });
    await isolated.performDownloadAction('reveal-recovery');
    expect(shell.showItemInFolder).toHaveBeenLastCalledWith(
      path.join(directory, backup)
    );
    (shell.showItemInFolder as jest.Mock).mockClear();
    let reopened!: typeof import('../main/downloads');
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      reopened = require('../main/downloads');
    });
    expect(reopened.getDownloadHistory()).toHaveLength(1);
    expect(
      fs.readdirSync(directory).filter((name) => name.includes('.recovery-'))
    ).toHaveLength(1);
    await isolated.performDownloadAction('open-file', good.id);
    expect(shell.openPath).toHaveBeenLastCalledWith(file);
    (shell.openPath as jest.Mock).mockClear();
    fs.unlinkSync(file);
    fs.symlinkSync(target, file);
    await expect(
      isolated.performDownloadAction('open-file', good.id)
    ).rejects.toThrow('replaced');
    await expect(
      isolated.performDownloadAction('reveal', good.id)
    ).rejects.toThrow('replaced');
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
    fs.unlinkSync(file);
    fs.mkdirSync(file);
    await expect(
      isolated.performDownloadAction('open-file', good.id)
    ).rejects.toThrow('replaced');
    await expect(
      isolated.performDownloadAction('open-file', {} as any)
    ).rejects.toThrow('Invalid download');
    await isolated.performDownloadAction('clear');
    expect(JSON.parse(fs.readFileSync(historyFile, 'utf8'))).toEqual([]);
    expect(isolated.getDownloadRecovery()).toEqual({
      status: 'none',
      canReveal: false,
    });
    expect(fs.readFileSync(target, 'utf8')).toBe('replacement');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('refuses to overwrite corrupt history if its recovery copy cannot be written', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-download-recovery-failure-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  const historyFile = path.join(directory, 'download-history.json');
  const raw = '{broken';
  fs.writeFileSync(historyFile, raw);
  let isolated!: typeof import('../main/downloads');
  jest.isolateModules(() => {
    // Reload native storage state to exercise startup from this fixture.
    // eslint-disable-next-line global-require
    isolated = require('../main/downloads');
  });
  const write = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
    throw new Error('Disk unavailable');
  });
  try {
    expect(isolated.getDownloadHistory()).toEqual([]);
    expect(isolated.getDownloadRecovery()).toEqual({
      status: 'blocked',
      canReveal: true,
    });
    await isolated.performDownloadAction('reveal-recovery');
    expect(shell.showItemInFolder).toHaveBeenLastCalledWith(historyFile);
    await expect(isolated.performDownloadAction('clear')).rejects.toThrow(
      'Existing history was not changed'
    );
    expect(fs.readFileSync(historyFile, 'utf8')).toBe(raw);
  } finally {
    write.mockRestore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('uses safe fallback names, avoids dangling-link collisions and follows save-path renames', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-download-name-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  const link = path.join(directory, 'download');
  fs.symlinkSync(path.join(directory, 'absent-target'), link);
  let isolated!: typeof import('../main/downloads');
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    isolated = require('../main/downloads');
  });
  const session = new EventEmitter();
  let chosen = '';
  const item = Object.assign(new EventEmitter(), {
    getFilename: () => '..',
    getSavePath: () => chosen,
    setSavePath: jest.fn((filename: string) => {
      chosen = filename;
    }),
    getMimeType: () => 'text/plain',
    getTotalBytes: () => 0,
    getReceivedBytes: () => 0,
    getState: () => 'progressing',
    isPaused: () => false,
    canResume: () => false,
  });
  try {
    isolated.trackDownloads(session as never);
    session.emit('will-download', {}, item);
    expect(chosen).toBe(path.join(directory, 'download (1)'));
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(isolated.getDownloadHistory()[0]).toMatchObject({
      name: 'download (1)',
      path: chosen,
    });
    chosen = path.join(directory, 'renamed.txt');
    item.emit('done', {}, 'cancelled');
    expect(isolated.getDownloadHistory()[0]).toMatchObject({
      name: 'renamed.txt',
      path: chosen,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('attributes live downloads to the originating WebContents and omits unowned history', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-download-owner-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  let isolated: typeof import('../main/downloads');
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    isolated = require('../main/downloads');
  });
  const session = new EventEmitter();
  const create = (name: string, owner?: { id: number }) => {
    const item = Object.assign(new EventEmitter(), {
      getFilename: () => name,
      getSavePath: () => path.join(directory, name),
      setSavePath: jest.fn(),
      getMimeType: () => 'text/plain',
      getTotalBytes: () => 10,
      getReceivedBytes: () => 10,
      getState: () => 'progressing',
      isPaused: () => false,
      canResume: () => false,
    });
    session.emit('will-download', {}, item, owner);
    return item;
  };
  try {
    isolated!.trackDownloads(session as never);
    create('first.txt', { id: 11 });
    create('second.txt', { id: 12 });
    create('unowned.txt');
    expect(
      isolated!
        .getDownloadsForContents({ id: 11 } as never)
        .map((record) => record.name)
    ).toEqual(['first.txt']);
    expect(
      isolated!
        .getDownloadsForContents({ id: 12 } as never)
        .map((record) => record.name)
    ).toEqual(['second.txt']);
    expect(isolated!.getDownloadsForContents({ id: 13 } as never)).toEqual([]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('preserves scoped ownership across replacement WebContents and history reload', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-download-stable-owner-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  let manager: typeof import('../main/downloads');
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    manager = require('../main/downloads');
  });
  const source = { id: 101 };
  const replacement = { id: 102 };
  const otherProfile = { id: 103 };
  const session = new EventEmitter();
  const item = Object.assign(new EventEmitter(), {
    getFilename: () => 'owned.txt',
    getSavePath: () => path.join(directory, 'owned.txt'),
    setSavePath: jest.fn(),
    getMimeType: () => 'text/plain',
    getTotalBytes: () => 4,
    getReceivedBytes: () => 4,
    getState: () => 'completed',
    isPaused: () => false,
    canResume: () => false,
  });
  try {
    manager!.bindDownloadSource(source as never, '["profile-a","tab-a"]');
    manager!.bindDownloadSource(replacement as never, '["profile-a","tab-a"]');
    manager!.bindDownloadSource(otherProfile as never, '["profile-b","tab-a"]');
    manager!.trackDownloads(session as never);
    session.emit('will-download', {}, item, source);
    item.emit('done', {}, 'completed');
    expect(manager!.getDownloadsForContents(replacement as never)).toHaveLength(
      1
    );
    expect(manager!.getDownloadsForContents(otherProfile as never)).toEqual([]);
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      manager = require('../main/downloads');
    });
    manager!.bindDownloadSource(replacement as never, '["profile-a","tab-a"]');
    expect(manager!.getDownloadsForContents(replacement as never)[0].name).toBe(
      'owned.txt'
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('reports an outstanding save picker only until a destination is selected or cancelled', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-save-picker-')
  );
  (app.getPath as jest.Mock).mockReturnValue(directory);
  (getBrowserPreferences as jest.Mock).mockReturnValue({
    askDownloadLocation: true,
  });
  let isolated!: typeof import('../main/downloads');
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    isolated = require('../main/downloads');
  });
  const session = new EventEmitter();
  let chosen = '';
  const item = Object.assign(new EventEmitter(), {
    getFilename: () => 'report.txt',
    getSavePath: () => chosen,
    setSaveDialogOptions: jest.fn(),
    getMimeType: () => 'text/plain',
    getTotalBytes: () => 10,
    getReceivedBytes: () => 0,
    getState: () => 'progressing',
    isPaused: () => false,
    canResume: () => false,
  });
  try {
    isolated.trackDownloads(session as never);
    session.emit('will-download', {}, item);
    expect(item.setSaveDialogOptions).toHaveBeenCalledWith({
      defaultPath: path.join(directory, 'report.txt'),
    });
    expect(isolated.getDownloadHistory()[0].awaitingSaveLocation).toBe(true);
    chosen = path.join(directory, 'chosen.txt');
    item.emit('updated');
    expect(isolated.getDownloadHistory()[0]).toMatchObject({
      awaitingSaveLocation: false,
      path: chosen,
      name: 'chosen.txt',
    });
    chosen = '';
    item.emit('done', {}, 'cancelled');
    expect(isolated.getDownloadHistory()[0]).toMatchObject({
      active: false,
      awaitingSaveLocation: false,
      state: 'cancelled',
    });
  } finally {
    (getBrowserPreferences as jest.Mock).mockReturnValue({
      askDownloadLocation: false,
    });
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('tracks default and newly created sessions before a regular browser tab attaches', async () => {
  let isolated!: typeof import('../main/downloads');
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    isolated = require('../main/downloads');
  });
  isolated.registerDownloadTracking();
  await Promise.resolve();
  expect(electronSession.defaultSession.on).toHaveBeenCalledWith(
    'will-download',
    expect.any(Function)
  );
  const listener = (app.on as jest.Mock).mock.calls.find(
    ([event]) => event === 'session-created'
  )![1];
  const groupSession = new EventEmitter();
  listener(groupSession);
  isolated.trackDownloads(groupSession as never);
  expect(groupSession.listenerCount('will-download')).toBe(1);
});
