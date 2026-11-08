import { IApp } from '../types';
import { migrateGroupNames, newGroupName } from '../utils/groups';

const tab = (
  id: string,
  name: string,
  sessionName: string,
  extra: Partial<IApp> = {}
): IApp => ({
  id,
  sessionId: id,
  name,
  sessionName,
  url: 'https://example.com',
  icon: '',
  ...extra,
});

test('allocates names across existing groups without stacking generated suffixes', () => {
  const tabs = [tab('a', 'Work', 'Work'), tab('b', 'Work', 'Work · Group 2')];
  expect(newGroupName(tabs, 'Work · New group · New group')).toBe(
    'Work · Group 3'
  );
  expect(newGroupName(tabs, 'Work · Group 2')).toBe('Work · Group 3');
  expect(newGroupName(tabs, 'Personal')).toBe('Personal');
  expect(newGroupName(tabs, 'Work · Group 2', true)).toBe(
    'Work · Group 2 · Group 2'
  );
});

test('migration gives shared tabs the same clean name and is idempotent', () => {
  const tabs = [
    tab('a', 'Work', 'Work'),
    tab('b', 'Work', 'Work · Separate account'),
    tab('c', 'Work', 'Work · Separate account', { sessionId: 'b' }),
  ];
  const migrated = migrateGroupNames(tabs);
  expect(migrated.map((entry) => entry.sessionName)).toEqual([
    'Work',
    'Work · Group 2',
    'Work · Group 2',
  ]);
  expect(migrateGroupNames(migrated)).toBe(migrated);
  expect(tabs[1].sessionName).toBe('Work · Separate account');
});

test('migration preserves explicitly edited and unrecognized names', () => {
  const tabs = [
    tab('a', 'Work', 'Work · Separate account', { sessionNameCustom: true }),
    tab('b', 'Work', 'Personal · Separate account'),
    tab('c', 'Work', 'Work · New group', { customName: 'My tab' }),
  ];
  expect(migrateGroupNames(tabs)).toBe(tabs);
});
