import { extensionCreatedTab } from '../browser/extensionTabs';
import { tabResumeURL } from '../browser/tabDefaults';
import { loginProfileKey, groupKey } from '../utils/groups';
import type { IApp } from '../types';

test('extension-created tabs retain the group/profile without inheriting a forced home URL or stale tab state', () => {
  const source = {
    id: 'source',
    name: 'Workspace',
    url: 'https://example.com/',
    sessionId: 'current-group',
    sessionProfileId: 'current-profile',
    spaceId: 'current-space',
    folderId: 'current-folder',
    tabDefaultURL: 'https://example.com/home',
    restorationId: 'old-restore',
    pinned: true,
    favorite: true,
    archived: true,
    customName: 'Old tab',
  } as IApp;
  const created = extensionCreatedTab(source, 'new-tab', 'https://muse.ai/');
  expect(groupKey(created)).toBe(groupKey(source));
  expect(loginProfileKey(created)).toBe(loginProfileKey(source));
  expect(created).toMatchObject({
    spaceId: source.spaceId,
    folderId: source.folderId,
    openerTabId: source.id,
    pinned: false,
    favorite: false,
    archived: false,
  });
  expect(created.restorationId).toBeUndefined();
  expect(created.customName).toBeUndefined();
  expect(tabResumeURL(created)).toBe('https://muse.ai/');
  expect(source.tabDefaultURL).toBe('https://example.com/home');
});
