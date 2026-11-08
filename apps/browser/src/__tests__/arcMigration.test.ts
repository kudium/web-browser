/** @jest-environment node */
import { arcSidebarLinks, arcProfileName } from '../main/arcMigration';

test('imports reachable Arc tabs in order with folders and excludes other profiles, deleted items and unsafe URLs', () => {
  const items = [
    { id: 'pinned', childrenIds: ['folder', 'unsafe'] },
    {
      id: 'folder',
      title: 'Tools',
      data: { list: {} },
      childrenIds: ['tab', 'folder'],
    },
    {
      id: 'tab',
      data: { tab: { savedURL: 'https://example.com', savedTitle: 'Docs' } },
    },
    {
      id: 'unsafe',
      data: { tab: { savedURL: 'https://user:password@example.com' } },
    },
    { id: 'deleted', data: { tab: { savedURL: 'https://deleted.example' } } },
    { id: 'other', childrenIds: ['other-tab'] },
    { id: 'other-tab', data: { tab: { savedURL: 'https://other.example' } } },
  ];
  const sidebar = {
    sidebar: {
      containers: [
        { global: [] },
        {
          items: items.flatMap((i) => [i.id, i]),
          spaces: [
            'one',
            {
              title: 'Work',
              profile: { default: true },
              containerIDs: ['pinned', 'pinned'],
            },
            'two',
            {
              title: 'Other',
              profile: { custom: { _0: { directoryBasename: 'Profile 2' } } },
              containerIDs: ['pinned', 'other'],
            },
          ],
        },
      ],
    },
  };
  expect(arcSidebarLinks(sidebar, 'Default')).toEqual([
    {
      url: 'https://example.com/',
      name: 'Docs',
      folderPath: ['Tools'],
      spaceName: 'Work',
      favorite: false,
      pinned: true,
    },
  ]);
  expect(arcSidebarLinks(sidebar, 'Profile 2')[0].url).toBe(
    'https://other.example/'
  );
  expect(() => arcSidebarLinks({}, 'Default')).toThrow('Arc sidebar');
});
test('labels default and secondary Arc profiles without Chromium placeholder names', () => {
  expect(arcProfileName('Default', 'Your Chromium')).toBe('Default profile');
  expect(arcProfileName('Profile 2', 'Chrome')).toBe('Profile 2');
  expect(arcProfileName('Profile 2', 'Work')).toBe('Work (Profile 2)');
});
