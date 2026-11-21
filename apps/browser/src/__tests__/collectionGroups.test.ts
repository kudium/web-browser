import {
  activeCollectionId,
  prepareCollectionGroups,
  collectionProfile,
} from '../utils/collectionGroups';
import { loginProfileKey } from '../utils/groups';
import { aiNewGroupFields } from '../main/aiNewGroup';
import { IApp } from '../types';
import { moveGroupToFolder } from '../utils/sessionFolders';
import { updateGroupSettings } from '../utils/groupSettings';

const tab = (id: string, patch: Partial<IApp> = {}): IApp => ({
  id,
  sessionId: id,
  name: id,
  url: 'https://example.com',
  icon: '',
  ...patch,
});

it('uses folder defaults consistently and is idempotent', () => {
  const existing = [
    tab('work', { folderId: 'projects', sessionProfileId: 'work' }),
  ];
  const migrated = prepareCollectionGroups(existing, existing);
  expect(migrated[0]).toMatchObject({
    groupDisplay: 'folder',
    sessionMode: 'separate',
  });
  expect(loginProfileKey(migrated[0])).toBe('work');
  expect(prepareCollectionGroups(migrated, migrated)).toEqual(migrated);
});
it('defaults new collection groups to folders sharing only their collection profile', () => {
  const next = prepareCollectionGroups(
    [
      tab('a', { folderId: 'projects' }),
      tab('b', { folderId: 'projects' }),
      tab('c', { folderId: 'projects', sessionMode: 'separate' }),
    ],
    [],
  );
  expect(next[0].groupDisplay).toBe('folder');
  expect(loginProfileKey(next[0])).toBe(loginProfileKey(next[1]));
  expect(loginProfileKey(next[2])).toBe('c');
  expect(collectionProfile('other', 'projects')).not.toBe(
    loginProfileKey(next[0]),
  );
});
it('new tabs preserve existing group presentation and inheritance', () => {
  const source = tab('a', {
    groupDisplay: 'stack',
    sessionMode: 'collection',
    folderId: 'projects',
  });
  const next = prepareCollectionGroups(
    [tab('b', { sessionId: 'a', folderId: 'projects' })],
    [source],
  );
  expect(next[0]).toMatchObject({
    groupDisplay: 'stack',
    sessionMode: 'collection',
  });
});
it('AI collection creation keeps a distinct group and rejects inaccessible collection membership', () => {
  const source = tab('a', { folderId: 'projects' });
  const fields = aiNewGroupFields('Work', source, false, 'projects', 'stack');
  expect(fields).toMatchObject({
    folderId: 'projects',
    groupDisplay: 'stack',
    sessionMode: 'collection',
    sessionProfileId: collectionProfile('default', 'projects'),
  });
  expect(fields.sessionId).not.toBe(source.sessionId);
  expect(() => aiNewGroupFields('Work', source, false, 'private')).toThrow(
    'source tab',
  );
});

it('AI can create an isolated group inside a collection', () => {
  const source = tab('a', { folderId: 'projects' });
  const fields = aiNewGroupFields(
    'Private',
    source,
    false,
    'projects',
    'folder',
    'separate',
  );
  expect(fields.folderId).toBe('projects');
  expect(fields.sessionMode).toBe('separate');
  expect(fields.sessionProfileId).toBeUndefined();
});

it('does not borrow group policy from another space', () => {
  const other = tab('other', {
    sessionId: 'shared',
    spaceId: 'other',
    groupDisplay: 'stack',
  });
  const next = prepareCollectionGroups(
    [tab('new', { sessionId: 'shared' })],
    [other],
  );
  expect(next[0].groupDisplay).toBe('folder');
});
it('keeps every tab in a group on the same policy and browser profile', () => {
  const next = prepareCollectionGroups(
    [
      tab('a', { folderId: 'projects', groupDisplay: 'stack' }),
      tab('b', {
        sessionId: 'a',
        folderId: 'projects',
        sessionMode: 'separate',
      }),
    ],
    [],
  );
  expect(next[1].groupDisplay).toBe('stack');
  expect(next[1].sessionMode).toBe('collection');
  expect(loginProfileKey(next[1])).toBe(loginProfileKey(next[0]));
});
it('clears collection policy without discarding retained storage when membership is absent', () => {
  const next = prepareCollectionGroups(
    [
      tab('a', {
        sessionMode: 'collection',
        sessionProfileId: 'retained',
      }),
    ],
    [],
  );
  expect(next[0].sessionMode).toBe('separate');
  expect(loginProfileKey(next[0])).toBe('retained');
});

it('moving a group to its current collection leaves inheritance intact', () => {
  const source = tab('a', { folderId: 'projects', sessionMode: 'collection' });
  const tabs = [source];
  expect(moveGroupToFolder(tabs, source, 'default', 'projects')).toBe(tabs);
});

it('group settings remove inheritance when collection membership is removed', () => {
  const source = tab('a', {
    folderId: 'projects',
    sessionMode: 'collection',
    sessionProfileId: 'retained',
  });
  const next = updateGroupSettings([source], source, {
    name: 'Work',
    emoji: '',
    image: '',
    homeURL: '',
    spaceId: 'default',
    folderId: '',
    placement: 'regular',
    sessionMode: 'collection',
  });
  expect(next[0].sessionMode).toBe('separate');
  expect(loginProfileKey(next[0])).toBe('retained');
});

it('resolves focused child collection membership through its group within the same space', () => {
  const groups = [
    tab('group', {
      sessionId: 'shared',
      folderId: 'collection',
      spaceId: 'work',
    }),
  ];
  expect(
    activeCollectionId(
      groups,
      tab('child', { sessionId: 'shared', spaceId: 'work' }),
    ),
  ).toBe('collection');
  expect(
    activeCollectionId(
      groups,
      tab('other-space', { sessionId: 'shared', spaceId: 'other' }),
    ),
  ).toBeUndefined();
  expect(
    activeCollectionId(
      groups,
      tab('other-group', { sessionId: 'different', spaceId: 'work' }),
    ),
  ).toBeUndefined();
  expect(
    activeCollectionId(
      groups,
      tab('archived', { sessionId: 'shared', spaceId: 'work', archived: true }),
    ),
  ).toBeUndefined();
  expect(activeCollectionId(groups)).toBeUndefined();
});
