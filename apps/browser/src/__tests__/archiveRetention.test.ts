import { AppManager } from '../utils/AppManager';
import { windowWorkspace } from '../utils/windowWorkspace';
import { lockedGroup, protectedGroup } from '../utils/groupAccess';
import { STORAGE_KEY } from '../utils/constant';
import type { IApp } from '../types';

jest.mock('../utils/groupAccess', () => ({
  lockedGroup: jest.fn(() => false),
  protectedGroup: jest.fn((item) => item.sessionId === 'protected'),
  assertGroupChanges: jest.fn(),
}));
const now = 1800000000000;
const day = 86400000;
const tab = (id: string, patch: Partial<IApp> = {}): IApp => ({
  id,
  name: id,
  url: 'https://example.com',
  icon: '',
  sessionId: id,
  archived: true,
  archivedAt: now - 8 * day,
  ...patch,
});
beforeEach(() => {
  localStorage.clear();
  windowWorkspace.update({
    id: 1,
    kind: 'workspace',
    groupIds: [],
    tabs: [],
    pendingTabs: [],
    reservedIds: [],
    parentGroups: {},
  });
  (lockedGroup as jest.Mock).mockReturnValue(false);
  window.electron = { ipcRenderer: { sendMessage: jest.fn() } } as any;
});
it('removes expired archive entries while keeping the boundary, active tabs and unlocked protected groups', () => {
  AppManager.set([
    tab('old'),
    tab('boundary'),
    tab('active', { archived: false }),
    tab('protected'),
  ]);
  const entries = AppManager.getAll().map((item) => ({
    ...item,
    archivedAt: item.id === 'boundary' ? now - 7 * day : now - 8 * day,
  }));
  AppManager.set(entries);
  AppManager.pruneArchive(0, now);
  expect(AppManager.getAll()).toHaveLength(4);
  AppManager.pruneArchive(7, now);
  expect(AppManager.getAll().map((item) => item.id)).toEqual([
    'boundary',
    'active',
    'protected',
  ]);
  expect(protectedGroup).toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY.USER_APPS)!)).toHaveLength(
    3
  );
});
it('gives undated records a grace period and resets the date on restore and rearchive', () => {
  localStorage.setItem(
    STORAGE_KEY.USER_APPS,
    JSON.stringify([tab('legacy', { archivedAt: undefined })])
  );
  AppManager.pruneArchive(7, now);
  expect(AppManager.getAll()[0].archivedAt).toBe(now);
  AppManager.pruneArchive(7, now + 7 * day);
  expect(AppManager.getAll()).toHaveLength(1);
  const restored = AppManager.restore(AppManager.getAll()[0]);
  expect(restored.archivedAt).toBeUndefined();
  expect(AppManager.getAll()[0].archivedAt).toBeUndefined();
  const time = jest.spyOn(Date, 'now').mockReturnValue(now + 2 * day);
  try {
    AppManager.set([{ ...AppManager.getAll()[0], archived: true }]);
    expect(AppManager.getAll()[0].archivedAt).toBe(now + 2 * day);
  } finally {
    time.mockRestore();
  }
  AppManager.pruneArchive(7, now + 10 * day);
  expect(AppManager.getAll()).toEqual([]);
});
it('waits for lock readiness and preserves temporary window records', () => {
  localStorage.setItem(STORAGE_KEY.USER_APPS, JSON.stringify([tab('old')]));
  (lockedGroup as jest.Mock).mockReturnValue(true);
  AppManager.pruneArchive(7, now);
  expect(AppManager.getAll()).toHaveLength(1);
  (lockedGroup as jest.Mock).mockReturnValue(false);
  windowWorkspace.update({
    ...windowWorkspace.state()!,
    kind: 'temporary',
    tabs: [tab('temporary')],
  });
  AppManager.pruneArchive(7, now);
  expect(AppManager.getAll()).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY.USER_APPS)!)[0].id).toBe(
    'old'
  );
});

it('leaves stored entries available to retry when local storage is full', () => {
  localStorage.setItem(STORAGE_KEY.USER_APPS, JSON.stringify([tab('old')]));
  const before = AppManager.getAll();
  const write = jest
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
  try {
    AppManager.pruneArchive(7, now);
    expect(AppManager.getAll()).toEqual(before);
  } finally {
    write.mockRestore();
  }
  AppManager.pruneArchive(7, now);
  expect(AppManager.getAll()).toEqual([]);
});
