import { commandDestination } from '../utils/commandNavigation';
import { IApp } from '../types';

const source: IApp = {
  id: 'a',
  name: 'Account',
  sessionId: 'account',
  sessionName: 'Work account',
  spaceId: 'work',
  url: 'https://example.com/',
  icon: '',
};
it('reuses a group tab and keeps other sites in the focused group', () => {
  expect(
    commandDestination([source], source, source.url, false, 'work').existing
  ).toBe(source);
  expect(
    commandDestination(
      [source],
      source,
      'https://example.com/messages',
      false,
      'work'
    ).app
  ).toMatchObject({
    sessionId: 'account',
    pinned: false,
    sessionName: 'Work account',
  });
  const other = commandDestination(
    [source],
    source,
    'https://other.com/',
    false,
    'personal'
  ).app!;
  expect(other.sessionId).toBe('account');
  expect(other.spaceId).toBe('work');
  expect(other.pinned).toBe(false);
  const fresh = commandDestination([source], source, source.url, true, 'work')
    .app!;
  expect(fresh.sessionId).not.toBe('account');
  const legacy = { ...source, sessionId: undefined };
  expect(
    commandDestination(
      [legacy],
      legacy,
      'https://example.com/new',
      false,
      'work'
    ).app!.sessionId
  ).toBeUndefined();
});

it('creates a tab in the target group even if another group has the same URL', () => {
  const elsewhere = {
    ...source,
    id: 'elsewhere',
    sessionId: 'other',
    url: 'https://other.com/',
  };
  const destination = commandDestination(
    [source, elsewhere],
    { ...source, sessionProfileId: 'profile', folderId: 'folder' },
    elsewhere.url,
    false,
    'work'
  );
  expect(destination.existing).toBeUndefined();
  expect(destination.app).toMatchObject({
    sessionId: 'account',
    sessionProfileId: 'profile',
    folderId: 'folder',
    url: elsewhere.url,
  });
});
