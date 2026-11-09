import { removeGroupFolder } from '../utils/sessionFolders';
import { folderLinks, moveFolder } from '../utils/folderActions';
import { IApp } from '../types';
import type { Space } from '../utils/SpaceManager';

const apps: IApp[] = [
  {
    id: 'one',
    name: 'A [guide]\npage',
    url: 'https://example.com/a(b)',
    icon: '',
    folderId: 'reading',
    sessionId: 'login',
    sessionProfileId: 'shared',
  },
  {
    id: 'two',
    name: 'Second',
    url: 'https://example.com/second',
    icon: '',
    folderId: 'reading',
    sessionId: 'login',
    archived: true,
  },
  {
    id: 'other',
    name: 'Other',
    url: 'https://other.com',
    icon: '',
    spaceId: 'work',
    folderId: 'reading',
    sessionId: 'work-login',
  },
];
const spaces: Space[] = [
  {
    id: 'default',
    name: 'Personal',
    color: 'iris',
    folders: [{ id: 'reading', name: 'Reading' }],
  },
  {
    id: 'work',
    name: 'Work',
    color: 'blue',
    folders: [{ id: 'reading', name: 'Existing' }],
  },
];

it('copies active folder pages only and escapes Markdown labels', () => {
  expect(folderLinks(apps, 'default', 'reading')).toBe(apps[0].url);
  expect(folderLinks(apps, 'default', 'reading', true)).toBe(
    '- [A \\[guide\\] page](<https://example.com/a(b)>)'
  );
  expect(folderLinks(apps, 'default', 'empty')).toBe('');
});

it('moves all folder tabs, including archived pages, without changing login identities or another folder', () => {
  const moved = moveFolder(apps, spaces, 'default', 'reading', 'work');
  const added = moved.spaces[1].folders[1];
  expect(added.name).toBe('Reading');
  expect(added.id).not.toBe('reading');
  expect(moved.spaces[0].folders).toEqual([]);
  expect(moved.spaces[1].folders[0]).toEqual(spaces[1].folders[0]);
  expect(moved.apps.slice(0, 2)).toEqual(
    apps
      .slice(0, 2)
      .map((tab) => ({ ...tab, spaceId: 'work', folderId: added.id }))
  );
  expect(moved.apps[2]).toBe(apps[2]);
  expect(moveFolder(apps, spaces, 'default', 'reading', 'default')).toEqual({
    apps,
    spaces,
  });
  expect(moveFolder(apps, spaces, 'default', 'missing', 'work')).toEqual({
    apps,
    spaces,
  });
});

it('deletes only collection tabs in its space, including archived tabs', () => {
  expect(
    removeGroupFolder(apps, 'default', 'reading', true).map((tab) => tab.id)
  ).toEqual(['other']);
});
it('keeps groups and their storage identity when removing only a collection', () => {
  const source = { ...apps[0], sessionMode: 'collection' as const };
  const result = removeGroupFolder([source, apps[2]], 'default', 'reading');
  expect(result[0]).toMatchObject({
    id: 'one',
    sessionId: 'login',
    sessionProfileId: 'shared',
    sessionMode: 'separate',
  });
  expect(result[0].folderId).toBeUndefined();
  expect(result[1]).toBe(apps[2]);
});
