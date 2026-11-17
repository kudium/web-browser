import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SpaceGroupSearch } from '../components/UI/SpaceGroupSearch';
import { SpaceSearchResults } from '../components/UI/SpaceSearchResults';
import {
  filterSpaceGroups,
  searchSpaceGroupTabs,
} from '../utils/spaceGroupSearch';
import type { IApp } from '../types';

const groups = [
  {
    id: 'one',
    name: 'Home tab',
    sessionName: 'Café Research',
    folderId: 'work',
  },
  { id: 'two', name: 'Shopping', sessionSlug: 'shopping-list' },
  { id: 'three', name: 'Old tab', sessionName: 'Planning', folderId: 'work' },
] as IApp[];
const folders = [{ id: 'work', name: 'Atlas Studio' }];

test('results render only the matching tabs and allow opening or managing each tab', () => {
  const select = jest.fn();
  const context = jest.fn();
  const tab = {
    id: 'faq',
    name: 'Trading FAQ',
    sessionName: 'Research',
    url: 'https://example.test/faq',
    icon: '',
  } as IApp;
  const view = render(
    <SpaceSearchResults
      tabs={[tab]}
      onSelect={select}
      onContextMenu={context}
    />
  );
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Trading FAQ' }));
  expect(select).toHaveBeenCalledWith(tab);
  fireEvent.keyDown(screen.getByRole('button'), { key: 'F10', shiftKey: true });
  expect(context).toHaveBeenCalledWith(tab);
  view.rerender(
    <SpaceSearchResults tabs={[]} onSelect={select} onContextMenu={context} />
  );
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('No matching tabs');
});

test('finds tab titles and URLs within their owning group and exposes matching tabs', () => {
  const group = { ...groups[0], sessionId: 'research' };
  const tabs = [
    {
      ...group,
      id: 'faq',
      name: 'Trading availability FAQ',
      url: 'https://docs.example.test/trading',
    },
    {
      ...group,
      id: 'article',
      customName: 'Candlestick guide',
      name: 'Unnamed',
      url: 'https://example.test/article',
    },
    { ...group, id: 'archive', name: 'Hidden archive', archived: true },
    { ...group, id: 'foreign', spaceId: 'other', name: 'Foreign page' },
  ] as IApp[];
  expect(filterSpaceGroups([group], folders, 'availability', tabs)).toEqual([
    group,
  ]);
  expect(
    filterSpaceGroups([group], folders, 'docs.example.test', tabs)
  ).toEqual([group]);
  expect(filterSpaceGroups([group], folders, 'candlestick', tabs)).toEqual([
    group,
  ]);
  expect(filterSpaceGroups([group], folders, 'Hidden archive', tabs)).toEqual(
    []
  );
  expect(filterSpaceGroups([group], folders, 'Foreign page', tabs)).toEqual([]);
  expect(
    searchSpaceGroupTabs(group, tabs.slice(0, 2), folders, 'research FAQ').map(
      (t) => t.id
    )
  ).toEqual(['faq']);
  expect(
    searchSpaceGroupTabs(group, tabs.slice(0, 2), folders, 'atlas').map(
      (t) => t.id
    )
  ).toEqual(['faq', 'article']);
});

test('matches group names, slugs and collections regardless of case or accents', () => {
  expect(
    filterSpaceGroups(groups, folders, ' CAFE research ').map((g) => g.id)
  ).toEqual(['one']);
  expect(
    filterSpaceGroups(groups, folders, 'studio atlas').map((g) => g.id)
  ).toEqual(['one', 'three']);
  expect(
    filterSpaceGroups(groups, folders, 'SHOPPING-LIST').map((g) => g.id)
  ).toEqual(['two']);
  expect(filterSpaceGroups(groups, folders, 'Home tab')).toEqual([]);
  expect(filterSpaceGroups(groups, folders, 'missing')).toEqual([]);
  expect(filterSpaceGroups(groups, folders, '  ')).toBe(groups);
});

function Fixture() {
  const [value, setValue] = useState<string | null>(null);
  return <SpaceGroupSearch name="Personal" value={value} onChange={setValue} />;
}

test('title opens a focused search; clear keeps it open and Escape restores title focus', async () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole('button', { name: 'Search Personal' }));
  const input = screen.getByRole('searchbox', {
    name: 'Search Personal',
  });
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: 'research' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear group search' }));
  expect((input as HTMLInputElement).value).toBe('');
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: 'shopping' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('searchbox')).toBeNull();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Search Personal' })
    )
  );
});

test('a nonempty filter stays active on blur, while an unused search closes', () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'research' },
  });
  fireEvent.blur(screen.getByRole('searchbox'));
  expect(screen.getByRole('searchbox')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear group search' }));
  fireEvent.blur(screen.getByRole('searchbox'));
  expect(screen.queryByRole('searchbox')).toBeNull();
});
