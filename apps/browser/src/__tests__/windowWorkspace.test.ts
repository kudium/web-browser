import { windowWorkspace } from '../utils/windowWorkspace';
import { AppManager } from '../utils/AppManager';
import type { BrowserWindowState } from '../browser/windows';
import type { IApp } from '../types';
import { STORAGE_KEY } from '../utils/constant';
const tab = (id: string, group: string): IApp => ({
  id,
  sessionId: group,
  name: id,
  url: 'https://example.com',
  icon: '',
});
const saved = [
  tab('one', 'parent'),
  tab('two', 'parent'),
  tab('other', 'other'),
];
function state(patch: Partial<BrowserWindowState> = {}): BrowserWindowState {
  return {
    id: 1,
    kind: 'workspace',
    groupIds: [],
    tabs: [],
    pendingTabs: [],
    reservedIds: [],
    parentGroups: {},
    ...patch,
  };
}
beforeEach(() => {
  localStorage.clear();
  windowWorkspace.update(state());
  window.electron = {
    browser: { windowRequest: jest.fn(async () => state()) },
    ipcRenderer: { sendMessage: jest.fn() },
  } as any;
});
it('hides reserved tabs while preserving them in saved data until explicit dismissal', () => {
  windowWorkspace.update(state({ reservedIds: ['one'] }));
  expect(windowWorkspace.visible(saved).map((item) => item.id)).toEqual([
    'two',
    'other',
  ]);
  const next = windowWorkspace.save(saved, [
    tab('two', 'parent'),
    tab('other', 'other'),
  ]);
  expect(next.some((item) => item.id === 'one')).toBe(true);
});
it('edits a scoped group without deleting the rest of the workspace', () => {
  windowWorkspace.update(state({ kind: 'groups', groupIds: ['parent'] }));
  const next = windowWorkspace.save(saved, [
    { ...tab('one', 'parent'), name: 'Renamed' },
  ]);
  expect(next.map((item) => item.id)).toEqual(['other', 'one']);
  expect(next[1].name).toBe('Renamed');
});
it('never persists temporary tabs and sends edits to their window owner', () => {
  const detached = {
    ...tab('one', 'detached'),
    sessionProfileId: 'parent',
    pinned: false,
  };
  windowWorkspace.update(
    state({
      kind: 'temporary',
      tabs: [detached],
      groupIds: ['detached'],
      reservedIds: ['one'],
    })
  );
  expect(windowWorkspace.visible(saved)).toEqual([detached]);
  expect(
    windowWorkspace.save(saved, [{ ...detached, name: 'New title' }])
  ).toBe(saved);
  expect(window.electron.browser.windowRequest).toHaveBeenCalledWith({
    action: 'temporary-tabs',
    tabs: [expect.objectContaining({ name: 'New title' })],
  });
});
it('commits drag-back into the full saved workspace, without truncating other groups', () => {
  localStorage.setItem(STORAGE_KEY.USER_APPS, JSON.stringify(saved));
  windowWorkspace.update(
    state({ kind: 'groups', groupIds: ['parent'], reservedIds: ['one'] })
  );
  AppManager.commitWindowTabs(
    [{ ...tab('one', 'parent'), name: 'Returned' }],
    []
  );
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY.USER_APPS)!);
  expect(stored).toHaveLength(3);
  expect(stored.find((item: IApp) => item.id === 'one').name).toBe('Returned');
  expect(stored.some((item: IApp) => item.id === 'other')).toBe(true);
});
