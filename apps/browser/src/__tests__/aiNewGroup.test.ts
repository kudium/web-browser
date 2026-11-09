import { aiNewGroupFields, aiNewGroupName } from '../main/aiNewGroup';
import { aiProviderTools, aiToolParameters } from '../browser/aiToolSchemas';
import { AIToolCatalog } from '../main/aiToolCatalog';
import { AIExecutionTracker } from '../main/aiExecution';
import { groupKey, loginProfileKey } from '../utils/groups';
import type { IApp } from '../types';

it('creates a separate named group and login without copying source group state', () => {
  const source: IApp = {
    id: 'source',
    name: 'Work',
    url: 'https://example.com',
    icon: '',
    sessionId: 'work',
    sessionProfileId: 'signed-in',
    spaceId: 'personal',
    protectionGroupId: 'locked',
    sessionSlug: 'work',
    folderId: 'folder',
    sessionHomeURL: 'https://example.com',
    tabPinned: true,
  };
  const group = { ...source, ...aiNewGroupFields('Social Media', source) };
  expect(group.sessionName).toBe('Social Media');
  expect(group.sessionNameCustom).toBe(true);
  expect(group.spaceId).toBe('personal');
  expect(groupKey(group)).not.toBe(groupKey(source));
  expect(loginProfileKey(group)).not.toBe(loginProfileKey(source));
  expect(group.protectionGroupId).toBeUndefined();
  expect(group.sessionSlug).toBeUndefined();
  expect(group.folderId).toBeUndefined();
  expect(group.sessionHomeURL).toBeUndefined();
  expect(group.tabPinned).toBe(false);
  expect(aiNewGroupFields('Social Media', source).sessionId).not.toBe(
    group.sessionId
  );
});

it('rejects missing, blank and overlong names before creation', () => {
  [undefined, null, 42, '', '   ', 'a'.repeat(101)].forEach((name) =>
    expect(() => aiNewGroupName(name)).toThrow('group name')
  );
  expect(aiNewGroupName(' Social Media ')).toBe('Social Media');
});

it('exposes creation as a core tool with required name and first URL', () => {
  expect(aiToolParameters('create_group').required).toEqual(['name', 'url']);
  expect(
    aiProviderTools().some((tool) => tool.function.name === 'create_group')
  ).toBe(true);
  expect(
    new AIToolCatalog()
      .tools()
      .some((tool: any) => tool.function.name === 'create_group')
  ).toBe(true);
  const tracker = new AIExecutionTracker();
  tracker.record(
    'create_group',
    {},
    { groupId: 'social', tabId: 'tiktok', loaded: true }
  );
  expect(tracker.snapshot().applied).toBe(1);
});

it.each([
  { sessionId: 'work', sessionProfileId: 'shared-login' },
  { sessionId: 'work' },
  {},
])(
  'links to the effective source login while keeping a new group identity: %j',
  (session) => {
    const source: IApp = {
      id: 'source',
      name: 'Work',
      url: 'https://example.com',
      icon: '',
      spaceId: 'personal',
      ...session,
    };
    const linked = {
      ...source,
      ...aiNewGroupFields('Social Media', source, true),
    };
    expect(groupKey(linked)).not.toBe(groupKey(source));
    expect(loginProfileKey(linked)).toBe(loginProfileKey(source));
    expect(linked.protectionGroupId).toBe(groupKey(source));
    expect(linked.sessionName).toBe('Social Media');
    expect(linked.spaceId).toBe('personal');
  }
);

it('retains inherited protection when linking and validates sharing inputs', () => {
  const source: IApp = {
    id: 'source',
    name: 'Work',
    url: 'https://example.com',
    icon: '',
    sessionId: 'work',
    protectionGroupId: 'original-protected-group',
  };
  expect(aiNewGroupFields('Social', source, true).protectionGroupId).toBe(
    'original-protected-group'
  );
  expect(() => aiNewGroupFields('Social', undefined, true)).toThrow(
    'source tab'
  );
  expect(() => aiNewGroupFields('Social', source, 'true')).toThrow(
    'true or false'
  );
  expect(
    aiToolParameters('create_group').properties.shareSession
  ).toMatchObject({ type: 'boolean' });
});
