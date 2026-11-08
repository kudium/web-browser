import { AppManager } from '../utils/AppManager';
import { SpaceManager, SPACE_KEY } from '../utils/SpaceManager';
import { readSavedList, writeSavedList } from '../utils/storageRecovery';
import { LocalStorage } from '../utils/LocalStorage';

jest.mock('../utils/EventBus', () => ({ eventBus: { dispatch: jest.fn() } }));

beforeEach(() => localStorage.clear());
it('preserves corrupt data, retains valid siblings and never changes a malformed profile identity', () => {
  const raw = JSON.stringify([
    { id: 'a', name: 'A', url: 'https://example.com', sessionId: 'account' },
    null,
    { id: 'b', name: 'B', url: 'https://example.com', sessionId: 42 },
  ]);
  localStorage.setItem('user_apps', raw);
  expect(AppManager.getAll().map((app) => app.id)).toEqual(['a']);
  expect(AppManager.getAll()[0].sessionId).toBe('account');
  expect(localStorage.getItem('user_apps.recovery')).toBe(raw);
  expect(localStorage.getItem('user_apps')).toBe(raw);
  AppManager.set(AppManager.getAll());
  expect(localStorage.getItem('user_apps.recovery')).toBe(raw);
});
it('keeps orphaned groups reachable when space JSON is corrupt', () => {
  localStorage.setItem(
    'user_apps',
    JSON.stringify([
      {
        id: 'a',
        name: 'A',
        url: 'https://example.com',
        icon: '',
        spaceId: 'work',
        folderId: 'reading',
        sessionId: 'identity',
      },
    ])
  );
  localStorage.setItem(SPACE_KEY, '{damaged');
  const recovered = SpaceManager.getAll().find((space) => space.id === 'work');
  expect(recovered?.folders).toEqual([
    { id: 'reading', name: 'Recovered folder' },
  ]);
  expect(localStorage.getItem(`${SPACE_KEY}.recovery`)).toBe('{damaged');
  expect(AppManager.getAll()[0].sessionId).toBe('identity');
});
it('rejects overwriting damaged data when its backup cannot be saved', () => {
  localStorage.setItem('damaged', '{broken');
  const save = jest.spyOn(LocalStorage, 'set').mockImplementation(() => {});
  try {
    expect(readSavedList('damaged', () => true)).toEqual([]);
    expect(() => writeSavedList('damaged', [])).toThrow('Unable to preserve');
    expect(localStorage.getItem('damaged')).toBe('{broken');
  } finally {
    save.mockRestore();
  }
});
it('keeps startup usable when name migration cannot preserve a damaged original', () => {
  const raw = JSON.stringify([
    {
      id: 'migration',
      name: 'Example',
      sessionName: 'Example · New group',
      url: 'https://example.com',
      sessionId: 'account',
    },
    null,
  ]);
  localStorage.setItem('user_apps', raw);
  const save = jest.spyOn(LocalStorage, 'set').mockImplementation(() => {});
  try {
    expect(AppManager.getAll()[0].sessionId).toBe('account');
    expect(localStorage.getItem('user_apps')).toBe(raw);
  } finally {
    save.mockRestore();
  }
});
it('opens with a default space for an empty list and safely handles malformed appearance fields', () => {
  localStorage.setItem(
    SPACE_KEY,
    JSON.stringify([
      {
        id: 'work',
        name: 'Work',
        folders: null,
        iconEmoji: { bad: true },
        color: 'bad',
      },
    ])
  );
  const space = SpaceManager.getAll()[0];
  expect(space.folders).toEqual([]);
  expect(space.iconEmoji).toBeUndefined();
  expect(space.color).toBe('iris');
  localStorage.setItem(SPACE_KEY, '[]');
  expect(SpaceManager.getAll()[0].id).toBe('default');
});
