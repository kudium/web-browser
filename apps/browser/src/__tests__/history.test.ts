/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, dialog, ipcMain } from 'electron';
import {
  recordVisit,
  historyAction,
  getBrowsingHistory,
  flushHistory,
  closeHistoryPersistence,
  historyPersistenceDiagnostics,
  removeProfileHistory,
  registerHistory,
} from '../main/history';
import { HistoryPersistence } from '../main/historyPersistence';
import { registerAdvancedLifecycle } from '../main/advancedPreferences';

jest.mock('../main/siteData', () => ({ clearSessionSiteData: jest.fn() }));

jest.mock('electron', () => ({
  app: Object.assign(new (jest.requireActual('events').EventEmitter)(), {
    getPath: jest.fn(),
    quit: jest.fn(),
  }),
  dialog: { showErrorBox: jest.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: jest.fn() },
}));
let directory: string;
const file = () => path.join(directory, 'browsing-history.json');
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-history-'));
  (app.getPath as jest.Mock).mockReturnValue(directory);
  (app as any).removeAllListeners();
  jest.clearAllMocks();
});
afterEach(async () => {
  await closeHistoryPersistence();
  fs.rmSync(directory, { recursive: true, force: true });
});

it('persists visits, strips credentials, deduplicates and clears only history', async () => {
  fs.writeFileSync(path.join(directory, 'cookies-fixture'), 'keep');
  recordVisit('https://user:password@example.com/page', 'Page', 'personal');
  recordVisit('https://example.com/page', 'Duplicate', 'personal');
  recordVisit('file:///private/file', 'Private', 'personal');
  recordVisit('https://example.org/', 'Work', 'work');
  expect(getBrowsingHistory()).toHaveLength(2);
  expect(getBrowsingHistory()[1].url).toBe('https://example.com/page');
  await flushHistory();
  expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual(
    getBrowsingHistory()
  );
  if (process.platform !== 'win32') { expect(fs.statSync(file()).mode % 0o1000).toBe(0o600); }
  const copy = getBrowsingHistory();
  copy[0].title = 'Tampered';
  expect(getBrowsingHistory()[0].title).toBe('Work');
  await historyAction('remove', getBrowsingHistory()[0].id);
  expect(getBrowsingHistory()).toHaveLength(1);
  await historyAction('clear');
  expect(getBrowsingHistory()).toHaveLength(0);
  expect(fs.readFileSync(path.join(directory, 'cookies-fixture'), 'utf8')).toBe(
    'keep'
  );
});

it('batches a burst without doing synchronous writes on the caller thread', async () => {
  const write = jest.spyOn(fs, 'writeFileSync');
  const rename = jest.spyOn(fs, 'renameSync');
  try {
    for (let index = 0; index < 30; index += 1)
      recordVisit(`https://example.com/${index}`, 'Visit', 'personal');
    await flushHistory();
    expect(write).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(historyPersistenceDiagnostics()).toEqual(
      expect.objectContaining({ writes: 1, pendingVisits: 0 })
    );
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toHaveLength(30);
  } finally {
    write.mockRestore();
    rename.mockRestore();
  }
});

it('preserves the visible state and original data on failed deletion, then retries', async () => {
  recordVisit('https://example.com/', 'Page', 'personal');
  await flushHistory();
  const before = getBrowsingHistory();
  const saved = fs.readFileSync(file(), 'utf8');
  fs.renameSync(file(), `${file()}.original`);
  fs.mkdirSync(file());
  try {
    await expect(historyAction('clear')).rejects.toThrow(
      'Could not save browsing history'
    );
    await expect(historyAction('remove', before[0].id)).rejects.toThrow(
      'Could not save browsing history'
    );
    expect(getBrowsingHistory()).toEqual(before);
    expect(fs.readFileSync(`${file()}.original`, 'utf8')).toBe(saved);
    expect(
      fs.readdirSync(directory).filter((name) => name.endsWith('.tmp'))
    ).toEqual([]);
  } finally {
    fs.rmdirSync(file());
    fs.renameSync(`${file()}.original`, file());
  }
  await historyAction('clear');
  expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual([]);
});

it('orders clear and profile deletion with visits arriving while a commit is pending', async () => {
  recordVisit('https://example.com/old', 'Old', 'personal');
  const clearing = historyAction('clear');
  recordVisit('https://example.com/new', 'New', 'personal');
  await clearing;
  await flushHistory();
  expect(getBrowsingHistory().map((record) => record.title)).toEqual(['New']);
  recordVisit('https://example.org/work', 'Work', 'work');
  const removing = removeProfileHistory('personal');
  recordVisit('https://example.com/later', 'Later', 'personal');
  await removing;
  await flushHistory();
  expect(getBrowsingHistory().map((record) => record.title)).toEqual([
    'Later',
    'Work',
  ]);
  expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual(
    getBrowsingHistory()
  );
  await closeHistoryPersistence();
  expect(getBrowsingHistory().map((record) => record.title)).toEqual([
    'Later',
    'Work',
  ]);
});

it.each(['{damaged', '{}', '[{"id":"incomplete"}]'])(
  'preserves unreadable originals (%s) instead of overwriting on a new visit',
  async (raw) => {
    fs.writeFileSync(file(), raw);
    recordVisit('https://example.com/new', 'New', 'personal');
    await expect(historyAction('clear')).rejects.toThrow(
      'original file has been preserved'
    );
    await expect(flushHistory()).rejects.toThrow(
      'original file has been preserved'
    );
    expect(fs.readFileSync(file(), 'utf8')).toBe(raw);
  }
);

it('rejects pending durable operations if the worker is terminated', async () => {
  const store = new HistoryPersistence(file(), []);
  const result = store.mutate('clear').catch((error: Error) => error);
  await store.close();
  expect(await result).toEqual(new Error('History persistence closed.'));
  await expect(store.mutate('flush')).rejects.toThrow('closed');
});

it('does not strand a durable operation when a change observer fails', async () => {
  const store = new HistoryPersistence(file(), [], () => {
    throw new Error('Observer failure');
  });
  try {
    await store.mutate('clear');
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual([]);
    expect(store.diagnostics().notificationError).toBe('Observer failure');
  } finally {
    await store.close();
  }
});

it('flushes visits before allowing quit and rejects foreign IPC frames', async () => {
  registerHistory(() => true);
  registerAdvancedLifecycle();
  const handler = (ipcMain.handle as jest.Mock).mock.calls[0][1];
  expect(() =>
    handler({ sender: { mainFrame: {} }, senderFrame: {} }, 'clear')
  ).toThrow('Untrusted');
  recordVisit('https://example.com/quit', 'Quit', 'personal');
  const event = { preventDefault: jest.fn() };
  (app as any).emit('before-quit', event);
  expect(event.preventDefault).toHaveBeenCalled();
  await flushHistory();
  expect(app.quit).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fs.readFileSync(file(), 'utf8'))[0].title).toBe('Quit');
});

it('keeps the app open when shutdown cannot save history', async () => {
  registerHistory(() => true);
  registerAdvancedLifecycle();
  recordVisit('https://example.com/quit', 'Quit', 'personal');
  fs.mkdirSync(file());
  (app as any).emit('before-quit', { preventDefault: jest.fn() });
  await expect(flushHistory()).rejects.toThrow(
    'Could not save browsing history'
  );
  expect(app.quit).not.toHaveBeenCalled();
  expect(dialog.showErrorBox).toHaveBeenCalledWith(
    'Could not finish quitting',
    expect.any(String)
  );
});
