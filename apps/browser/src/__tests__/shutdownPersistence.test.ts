/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, dialog } from 'electron';
import { defaultAdvanced } from '../browser/advancedPreferences';
import {
  configureDNS,
  registerAdvancedLifecycle,
} from '../main/advancedPreferences';
import { flushHistory, setHistoryQuitting } from '../main/history';
import { clearSessionSiteData } from '../main/siteData';

jest.mock('../main/history', () => ({
  flushHistory: jest.fn(),
  hasPendingHistory: () => true,
  setHistoryQuitting: jest.fn(),
}));
jest.mock('../main/siteData', () => ({ clearSessionSiteData: jest.fn() }));
jest.mock('electron', () => ({
  app: Object.assign(new (jest.requireActual('events').EventEmitter)(), {
    getPath: jest.fn(),
    quit: jest.fn(),
  }),
  session: { fromPartition: () => ({ synthetic: true }) },
  dialog: { showErrorBox: jest.fn() },
}));
let directory: string;
const tick = async () => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};
beforeEach(() => {
  jest.clearAllMocks();
  (app as any).removeAllListeners();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-quit-'));
  fs.mkdirSync(path.join(directory, 'Partitions', 'touchbox-fixture'), {
    recursive: true,
  });
  (app.getPath as jest.Mock).mockReturnValue(directory);
  configureDNS({ ...defaultAdvanced, clearOnExit: true });
  registerAdvancedLifecycle();
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

it('waits for both history durability and clear-on-exit, including repeated quit requests', async () => {
  let saved: () => void = () => {};
  let cleared: () => void = () => {};
  (flushHistory as jest.Mock).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      })
  );
  (clearSessionSiteData as jest.Mock).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        cleared = resolve;
      })
  );
  const event = { preventDefault: jest.fn() };
  (app as any).emit('before-quit', event);
  (app as any).emit('before-quit', event);
  expect(event.preventDefault).toHaveBeenCalledTimes(2);
  expect(flushHistory).toHaveBeenCalledTimes(1);
  expect(clearSessionSiteData).toHaveBeenCalledTimes(1);
  saved();
  await tick();
  expect(app.quit).not.toHaveBeenCalled();
  cleared();
  await tick();
  expect(app.quit).toHaveBeenCalledTimes(1);
  expect(setHistoryQuitting).toHaveBeenCalledWith(true);
  expect(dialog.showErrorBox).not.toHaveBeenCalled();
});

it('waits for the other task on failure, resumes recording and permits a safe retry', async () => {
  let saved: () => void = () => {};
  (flushHistory as jest.Mock).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      })
  );
  (clearSessionSiteData as jest.Mock).mockRejectedValue(
    new Error('Synthetic disk failure')
  );
  (app as any).emit('before-quit', { preventDefault: jest.fn() });
  await tick();
  expect(app.quit).not.toHaveBeenCalled();
  expect(dialog.showErrorBox).not.toHaveBeenCalled();
  saved();
  await tick();
  expect(setHistoryQuitting).toHaveBeenLastCalledWith(false);
  expect(dialog.showErrorBox).toHaveBeenCalledWith(
    'Could not finish quitting',
    expect.stringContaining('Synthetic disk failure')
  );
  (flushHistory as jest.Mock).mockResolvedValue(undefined);
  (clearSessionSiteData as jest.Mock).mockResolvedValue(undefined);
  (app as any).emit('before-quit', { preventDefault: jest.fn() });
  await tick();
  expect(app.quit).toHaveBeenCalledTimes(1);
});
