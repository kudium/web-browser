import { duplicateGroup } from '../utils/tabMoves';
import { moveTab, reorderTabs, moveGroupToSection } from '../utils/tabMoves';
import { IApp } from '../types';

const tabs: IApp[] = [
  {
    id: 'a',
    name: 'Home',
    url: 'https://example.com',
    icon: '',
    sessionId: 'account-a',
    sessionName: 'Personal',
    spaceId: 'default',
  },
  {
    id: 'b',
    name: 'Inbox',
    url: 'https://example.com/inbox',
    icon: '',
    sessionId: 'account-a',
    spaceId: 'default',
  },
  {
    id: 'c',
    name: 'Work',
    url: 'https://example.com/work',
    icon: '',
    sessionId: 'account-c',
    sessionName: 'Work',
    spaceId: 'default',
  },
];
it('reorders a page or whole group without changing cookie partitions', () => {
  expect(reorderTabs(tabs, 'b', 'a').map((item) => item.id)).toEqual([
    'b',
    'a',
    'c',
  ]);
  expect(reorderTabs(tabs, 'c', 'a', true).map((item) => item.id)).toEqual([
    'c',
    'a',
    'b',
  ]);
  expect(reorderTabs(tabs, 'a', 'b', true)).toBe(tabs);
});
it('detaches a page into a fresh partition while preserving the other pages', () => {
  const next = moveTab(tabs, 'b', 'https://example.com/messages');
  expect(next[1].sessionId).not.toBe(tabs[1].sessionId);
  expect(next[1].url).toBe('https://example.com/messages');
  expect(next[1].pinned).toBe(true);
  expect(next[0]).toBe(tabs[0]);
});
it('moves a page into another group across websites', () => {
  expect(moveTab(tabs, 'b', tabs[1].url, tabs[2])[1]).toEqual(
    expect.objectContaining({
      sessionId: 'account-c',
      sessionName: 'Work',
      pinned: undefined,
    })
  );
  expect(moveTab(tabs, 'b', 'https://other.com', tabs[2])[1]).toEqual(
    expect.objectContaining({
      sessionId: 'account-c',
      url: 'https://other.com',
    })
  );
  expect(tabs[1].sessionId).toBe('account-a');
});

test('moves a group between favorites, pinned and regular without changing its login partition', () => {
  let moved = moveGroupToSection(tabs, 'a', 'favorites', 'default');
  expect(
    moved
      .filter((item) => item.sessionId === 'account-a')
      .every((item) => item.favorite && item.pinned)
  ).toBe(true);
  moved = moveGroupToSection(moved, 'a', 'regular', 'default');
  expect(
    moved
      .filter((item) => item.sessionId === 'account-a')
      .every((item) => !item.favorite && !item.pinned && !item.folderId)
  ).toBe(true);
  moved = moveGroupToSection(moved, 'a', 'pinned', 'default');
  expect(
    moved
      .filter((item) => item.sessionId === 'account-a')
      .every((item) => !item.favorite && item.pinned)
  ).toBe(true);
  expect(moved.map((item) => [item.id, item.sessionId, item.url])).toEqual(
    tabs.map((item) => [item.id, item.sessionId, item.url])
  );
  expect(moved.find((item) => item.id === 'c')).toEqual(
    tabs.find((item) => item.id === 'c')
  );
});

it('copies open group tabs with fresh sessions and remapped opener identities', () => {
  const source = [
    {
      ...tabs[0],
      sessionProfileId: 'shared',
      sessionSlug: 'personal',
      protectionGroupId: 'protected',
    },
    { ...tabs[1], openerTabId: 'a', customName: 'Messages', tabPinned: true },
    tabs[2],
    { ...tabs[0], id: 'archived', archived: true },
    { ...tabs[0], id: 'other-space', spaceId: 'other' },
  ];
  const result = duplicateGroup(source, 'b');
  const copies = result.filter(
    (tab) => !source.some((original) => original.id === tab.id),
  );
  expect(copies).toHaveLength(2);
  expect(result.map((tab) => tab.id)).toEqual([
    'a',
    'b',
    copies[0].id,
    copies[1].id,
    'c',
    'archived',
    'other-space',
  ]);
  expect(copies[0].sessionId).not.toBe('account-a');
  expect(copies[1].sessionId).toBe(copies[0].sessionId);
  expect(copies[0].sessionName).toBe('Personal · Group 2');
  expect(copies[0].sessionProfileId).toBeUndefined();
  expect(copies[0].protectionGroupId).toBeUndefined();
  expect(copies[0].sessionSlug).toBeUndefined();
  expect(copies[1].openerTabId).toBe(copies[0].id);
  expect(copies[1].customName).toBe('Messages');
  expect(copies[1].tabPinned).toBe(true);
  expect(source[0].sessionProfileId).toBe('shared');
  expect(duplicateGroup(source, 'archived')).toBe(source);
  expect(duplicateGroup(source, 'missing')).toBe(source);
});
