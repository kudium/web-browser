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
