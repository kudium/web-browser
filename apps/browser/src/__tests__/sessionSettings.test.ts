import { updateGroupSettings } from '../utils/groupSettings';
import { IApp } from '../types';
import { groupTabs } from '../utils/groups';

it('updates group identity and grouping without changing pages or cookie partitions', () => {
  const tabs: IApp[] = [
    {
      id: 'a',
      name: 'Page A',
      url: 'https://example.com/a',
      icon: 'a.png',
      sessionId: 'personal',
      spaceId: 'default',
    },
    {
      id: 'b',
      name: 'Page B',
      url: 'https://other.com/b',
      icon: 'b.png',
      customName: 'Keep me',
      sessionId: 'personal',
      spaceId: 'default',
    },
    {
      id: 'c',
      name: 'Other group',
      url: 'https://example.com',
      icon: '',
      sessionId: 'work',
      spaceId: 'default',
    },
  ];
  const updated = updateGroupSettings(tabs, tabs[0], {
    name: 'Research',
    emoji: '🧪',
    image: '',
    homeURL: '',
    spaceId: 'work-space',
    folderId: 'research',
    placement: 'pinned',
  });
  expect(
    updated
      .slice(0, 2)
      .every(
        (tab) =>
          tab.sessionName === 'Research' &&
          tab.sessionIconEmoji === '🧪' &&
          tab.folderId === 'research' &&
          tab.spaceId === 'work-space'
      )
  ).toBe(true);
  expect(
    updated.map((tab) => [
      tab.id,
      tab.name,
      tab.icon,
      tab.url,
      tab.customName,
      tab.sessionId,
    ])
  ).toEqual(
    tabs.map((tab) => [
      tab.id,
      tab.name,
      tab.icon,
      tab.url,
      tab.customName,
      tab.sessionId,
    ])
  );
  expect(updated[2]).toEqual(tabs[2]);
});
it('shares a profile without merging the group group and can return to independent storage', () => {
  const source: IApp = {
    id: 'a',
    name: 'Personal',
    url: 'https://example.com',
    icon: '',
    sessionId: 'personal',
    spaceId: 'default',
  };
  const settings = {
    name: 'Personal',
    emoji: '',
    image: '',
    homeURL: source.url,
    spaceId: 'default',
    folderId: '',
    placement: 'regular' as const,
    loginProfileId: 'work',
  };
  const shared = updateGroupSettings([source], source, settings)[0];
  expect(shared.sessionId).toBe('personal');
  expect(shared.sessionProfileId).toBe('work');
  const independent = updateGroupSettings([shared], shared, {
    ...settings,
    loginProfileId: 'personal',
  })[0];
  expect(independent.sessionProfileId).toBe('personal');
});

const homeSettings = {
  name: 'Work',
  slug: 'work',
  emoji: '💼',
  image: '',
  homeURL: 'https://home.example/',
  spaceId: 'default',
  folderId: '',
  placement: 'pinned' as const,
};
const page = (id: string, url: string, patch: Partial<IApp> = {}): IApp => ({
  id,
  name: id,
  url,
  icon: '',
  sessionId: 'work',
  spaceId: 'default',
  ...patch,
});
it('registers a missing home as the first tab with the same group identity and login', () => {
  const tabs = [
    page('other', 'https://home.example/', { sessionId: 'other' }),
    page('work', 'https://work.example/', {
      sessionProfileId: 'shared',
      tabPinned: true,
    }),
    page('last', 'https://last.example/'),
  ];
  const next = updateGroupSettings(tabs, tabs[1], homeSettings);
  const home = next[1];
  expect(home).toMatchObject({
    url: homeSettings.homeURL,
    sessionId: 'work',
    sessionProfileId: 'shared',
    sessionSlug: 'work',
    sessionName: 'Work',
    sessionIconEmoji: '💼',
  });
  expect(next.filter((t) => t.sessionId === 'work').map((t) => t.url)).toEqual([
    homeSettings.homeURL,
    tabs[1].url,
    tabs[2].url,
  ]);
  expect(next[0].id).toBe('other');
  expect(groupTabs(next, next[2])[0].id).toBe(home.id);
  expect(updateGroupSettings(next, next[2], homeSettings)).toHaveLength(4);
});
it('reuses and moves an existing home tab without changing its ID or custom title', () => {
  const tabs = [
    page('first', 'https://work.example/'),
    page('home', 'https://home.example', {
      customName: 'My dashboard',
      tabPinned: true,
    }),
  ];
  const next = updateGroupSettings(tabs, tabs[0], homeSettings);
  expect(next).toHaveLength(2);
  expect(next[0]).toMatchObject({
    id: 'home',
    customName: 'My dashboard',
    tabPinned: true,
  });
});
it('restores an archived matching home instead of making a duplicate', () => {
  const tabs = [
    page('first', 'https://work.example/'),
    page('home', homeSettings.homeURL, { archived: true }),
  ];
  const next = updateGroupSettings(tabs, tabs[0], homeSettings);
  expect(next).toHaveLength(2);
  expect(next[0]).toMatchObject({ id: 'home', archived: false });
  expect(next[0].restorationId).toBeTruthy();
});
it('changing or clearing a home preserves previously open pages', () => {
  const tabs = [page('first', 'https://work.example/')];
  const first = updateGroupSettings(tabs, tabs[0], homeSettings);
  const changed = updateGroupSettings(first, first[0], {
    ...homeSettings,
    homeURL: 'https://new.example/',
  });
  expect(changed[0].url).toBe('https://new.example/');
  expect(changed.map((t) => t.url)).toEqual([
    'https://new.example/',
    homeSettings.homeURL,
    tabs[0].url,
  ]);
  const cleared = updateGroupSettings(changed, changed[0], {
    ...homeSettings,
    homeURL: '',
  });
  expect(cleared.map((t) => t.id)).toEqual(changed.map((t) => t.id));
  expect(cleared.every((t) => !t.sessionHomeURL)).toBe(true);
});

it('does not restore an archived group when editing its saved home', () => {
  const tabs = [page('archived', 'https://work.example/', { archived: true })];
  const next = updateGroupSettings(tabs, tabs[0], homeSettings);
  expect(next).toHaveLength(1);
  expect(next[0].archived).toBe(true);
  expect(next[0].sessionHomeURL).toBe(homeSettings.homeURL);
});
