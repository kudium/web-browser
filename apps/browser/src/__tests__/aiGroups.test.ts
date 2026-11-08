import {
  aiGroups,
  aiGroupId,
  assignGroupSlugs,
  resolveAIReference,
  promptAIReferences,
  scopedAITabs,
} from '../browser/aiGroups';
import { updateGroupSettings } from '../utils/groupSettings';
import { IApp } from '../types';

const tabs = [
  {
    id: 'a',
    name: 'GitHub',
    sessionId: 'work',
    sessionName: 'Work',
    url: 'https://github.com',
    icon: '',
  },
  {
    id: 'b',
    name: 'Mail',
    sessionId: 'work',
    sessionName: 'Work',
    url: 'https://mail.test',
    icon: '',
  },
  {
    id: 'c',
    name: 'GitHub',
    sessionId: 'home',
    sessionName: 'Work',
    url: 'https://github.com',
    icon: '',
  },
] as IApp[];

it('assigns unique persistent group slugs and preserves explicit names across additions', () => {
  const migrated = assignGroupSlugs(tabs);
  expect(migrated.map((tab) => tab.sessionSlug)).toEqual([
    'work',
    'work',
    'work-2',
  ]);
  expect(assignGroupSlugs(migrated)).toBe(migrated);
  const next = assignGroupSlugs([
    ...migrated,
    { ...tabs[0], id: 'd', sessionId: 'other', sessionSlug: 'work' },
  ]);
  expect(next[3].sessionSlug).toBe('work-3');
  const long = assignGroupSlugs([
    { ...tabs[0], sessionName: 'x'.repeat(100) },
    { ...tabs[2], sessionName: 'x'.repeat(100) },
  ]);
  long.forEach((tab) => {
    expect(tab.sessionSlug!.length).toBeLessThanOrEqual(60);
    expect(tab.sessionSlug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

it('uses stable IDs after slug edits and resolves page references only inside scope', () => {
  const original = assignGroupSlugs(tabs);
  const id = aiGroupId(original[0]);
  expect(resolveAIReference(original, '@work/github', id)).toMatchObject({
    groupId: id,
    tabId: 'a',
  });
  expect(() => resolveAIReference(original, '@work-2/github', id)).toThrow(
    'outside AI scope'
  );
  const renamed = updateGroupSettings(original, original[0], {
    name: 'Engineering',
    slug: 'engineering',
    emoji: '',
    image: '',
    homeURL: 'https://github.com',
    spaceId: 'default',
    folderId: '',
    placement: 'regular',
  });
  expect(aiGroupId(renamed[0])).toBe(id);
  expect(resolveAIReference(renamed, '@engineering/github', id).tabId).toBe(
    'a'
  );
  expect(() => resolveAIReference(renamed, '@work/github', id)).toThrow(
    'not found'
  );
});

it('filters all tab operations and fails closed if the group disappears', () => {
  const id = aiGroupId(tabs[0]);
  expect(scopedAITabs(tabs, id).map((tab) => tab.id)).toEqual(['a', 'b']);
  expect(scopedAITabs(tabs, null)).toHaveLength(3);
  expect(() => scopedAITabs([tabs[2]], id)).toThrow('unavailable');
  expect(() =>
    scopedAITabs(
      tabs.map((tab) => ({ ...tab, archived: true })),
      id
    )
  ).toThrow('unavailable');
  expect(aiGroups(tabs)[0].tabs[0].slug).toBe('github');
});

it('resolves Markdown prose mentions without treating code samples as context', () => {
  expect(
    promptAIReferences(
      '**@work** how many tabs? _@home/mail_ `@literal` \n```\n@sample\n``` email@work'
    )
  ).toEqual(['work', 'home/mail']);
});
