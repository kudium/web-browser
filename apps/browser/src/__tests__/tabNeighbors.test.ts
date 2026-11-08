import { insertTabAfter, nextGroupTab } from '../utils/tabNeighbors';
import { IApp } from '../types';

const tab = (id: string, sessionId = 'group', archived = false): IApp => ({
  id,
  sessionId,
  archived,
  name: id,
  url: 'https://example.com',
  icon: '',
});
it('selects the next tab in the closed tab’s group before another group', () => {
  const apps = [
    tab('other', 'other'),
    tab('first', 'group', true),
    tab('next'),
    tab('last'),
  ];
  expect(nextGroupTab(apps, 'first')?.id).toBe('next');
  expect(
    nextGroupTab([tab('first'), tab('last', 'group', true)], 'last')?.id
  ).toBe('first');
  expect(
    nextGroupTab(
      [tab('other', 'other'), tab('closed', 'group', true)],
      'closed'
    )
  ).toBeUndefined();
});
it('inserts a duplicate after its source and maintains saved positions', () => {
  const apps = [tab('a'), tab('b'), tab('c')];
  const result = insertTabAfter(apps, 'b', tab('copy'));
  expect(result.map((item) => item.id)).toEqual(['a', 'b', 'copy', 'c']);
  expect(result.map((item) => item.position)).toEqual([1, 2, 3, 4]);
  expect(apps).toHaveLength(3);
});

it('uses the home-first display order when closing tabs, before pinned tabs', () => {
  const home = {
    ...tab('home'),
    url: 'https://home.example/',
    sessionHomeURL: 'https://home.example/',
    archived: true,
  };
  const pinned = { ...tab('pinned'), tabPinned: true };
  expect(nextGroupTab([pinned, home, tab('regular')], 'home')?.id).toBe(
    'pinned'
  );
});
