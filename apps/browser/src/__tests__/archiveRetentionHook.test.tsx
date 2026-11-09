import { act, renderHook } from '@testing-library/react';
import { browser } from '../browser/client';
import { AppManager } from '../utils/AppManager';
import { useArchiveRetention } from '../utils/hooks/useArchiveRetention';
import { windowWorkspace } from '../utils/windowWorkspace';

jest.mock('../browser/client', () => ({
  browser: { preferences: jest.fn(), onPreferences: jest.fn() },
}));
jest.mock('../utils/AppManager', () => ({
  AppManager: { pruneArchive: jest.fn() },
}));
jest.mock('../utils/groupAccess', () => {
  const access = { ready: true };
  return { useGroupAccess: () => access };
});
jest.mock('../utils/windowWorkspace', () => ({
  windowWorkspace: { subscribe: jest.fn() },
}));
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (browser.onPreferences as jest.Mock).mockReturnValue(jest.fn());
  (windowWorkspace.subscribe as jest.Mock).mockReturnValue(jest.fn());
});
afterEach(() => jest.useRealTimers());
it('cleans on startup and continuously without letting an old response override a changed setting', async () => {
  let resolve!: (preferences: any) => void;
  (browser.preferences as jest.Mock).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const { unmount } = renderHook(useArchiveRetention);
  const update = (browser.onPreferences as jest.Mock).mock.calls[0][0];
  act(() => update({ systemSpaceRetentionDays: 0 }));
  await act(async () => resolve({ systemSpaceRetentionDays: 7 }));
  expect(AppManager.pruneArchive).toHaveBeenCalledTimes(1);
  expect(AppManager.pruneArchive).toHaveBeenLastCalledWith(0);
  act(() => update({ systemSpaceRetentionDays: 30 }));
  act(() => jest.advanceTimersByTime(3600000));
  expect(AppManager.pruneArchive).toHaveBeenLastCalledWith(30);
  act(() => (windowWorkspace.subscribe as jest.Mock).mock.calls[0][0]());
  expect(AppManager.pruneArchive).toHaveBeenCalledTimes(4);
  unmount();
  expect(
    (browser.onPreferences as jest.Mock).mock.results[0].value
  ).toHaveBeenCalled();
  expect(
    (windowWorkspace.subscribe as jest.Mock).mock.results[0].value
  ).toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(3600000));
  expect(AppManager.pruneArchive).toHaveBeenCalledTimes(4);
});
it('loads the initial retention setting and ignores late results after unmount', async () => {
  (browser.preferences as jest.Mock).mockResolvedValue({
    systemSpaceRetentionDays: 7,
  });
  const { unmount } = renderHook(useArchiveRetention);
  await act(async () => {});
  expect(AppManager.pruneArchive).toHaveBeenCalledWith(7);
  unmount();
  act(() =>
    (browser.onPreferences as jest.Mock).mock.calls[0][0]({
      systemSpaceRetentionDays: 90,
    })
  );
  expect(AppManager.pruneArchive).toHaveBeenCalledTimes(1);
});
