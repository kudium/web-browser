/** @jest-environment node */
import { app } from 'electron';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
} from '../main/preferences';
import { pruneBrowsingHistory } from '../main/history';
import { pruneDownloadHistory } from '../main/downloads';
import { registerSystemSpaceRetention } from '../main/systemSpaceRetention';

jest.mock('electron', () => ({
  app: Object.assign(new (jest.requireActual('events').EventEmitter)(), {
    whenReady: jest.fn(async () => {}),
  }),
}));
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: jest.fn(),
  onBrowserPreferencesChanged: jest.fn(),
}));
jest.mock('../main/history', () => ({
  pruneBrowsingHistory: jest.fn(async () => {}),
}));
jest.mock('../main/downloads', () => ({ pruneDownloadHistory: jest.fn() }));
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (getBrowserPreferences as jest.Mock).mockReturnValue({
    systemSpaceRetentionDays: 7,
  });
  (onBrowserPreferencesChanged as jest.Mock).mockReturnValue(jest.fn());
});
afterEach(() => {
  jest.useRealTimers();
  (app as any).removeAllListeners();
});
it('cleans at startup, hourly and on setting changes, then stops at quit', async () => {
  const stop = registerSystemSpaceRetention();
  await settle();
  expect(pruneBrowsingHistory).toHaveBeenLastCalledWith(7);
  expect(pruneDownloadHistory).toHaveBeenLastCalledWith(7);
  jest.advanceTimersByTime(3600000);
  await settle();
  expect(pruneBrowsingHistory).toHaveBeenCalledTimes(2);
  (getBrowserPreferences as jest.Mock).mockReturnValue({
    systemSpaceRetentionDays: 0,
  });
  (onBrowserPreferencesChanged as jest.Mock).mock.calls[0][0]();
  await settle();
  expect(pruneDownloadHistory).toHaveBeenLastCalledWith(0);
  (app as any).emit('will-quit');
  jest.advanceTimersByTime(3600000);
  await settle();
  expect(pruneBrowsingHistory).toHaveBeenCalledTimes(3);
  expect(
    (onBrowserPreferencesChanged as jest.Mock).mock.results[0].value
  ).toHaveBeenCalled();
  stop();
});
it('serializes overlapping cleanup and reruns with the newest setting', async () => {
  let resolve!: () => void;
  (pruneBrowsingHistory as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      })
  );
  const stop = registerSystemSpaceRetention();
  await settle();
  (getBrowserPreferences as jest.Mock).mockReturnValue({
    systemSpaceRetentionDays: 30,
  });
  (onBrowserPreferencesChanged as jest.Mock).mock.calls[0][0]();
  expect(pruneBrowsingHistory).toHaveBeenCalledTimes(1);
  resolve();
  await settle();
  expect(pruneBrowsingHistory).toHaveBeenLastCalledWith(30);
  expect(pruneDownloadHistory).toHaveBeenLastCalledWith(30);
  stop();
});
it('continues download cleanup if history storage fails', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  (pruneBrowsingHistory as jest.Mock).mockRejectedValueOnce(
    new Error('disk unavailable')
  );
  const stop = registerSystemSpaceRetention();
  try {
    await settle();
    expect(pruneDownloadHistory).toHaveBeenCalledWith(7);
    expect(error).toHaveBeenCalled();
  } finally {
    stop();
    error.mockRestore();
  }
});
