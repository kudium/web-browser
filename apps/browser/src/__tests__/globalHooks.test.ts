/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  effectiveHookConfig,
  getGlobalHooks,
  globalHookHash,
  saveGlobalHooks,
  onGlobalHooksChanged,
} from '../main/globalHooks';
import { ALL_GROUPS_HOOK_SCOPE } from '../browser/hookMarketplace';
import { emptyDeveloperConfig } from '../browser/siteDeveloper';

let mockFolder: string;
let mockSite = { ...emptyDeveloperConfig };
jest.mock('electron', () => ({ app: { getPath: () => mockFolder } }));
jest.mock('../main/siteSettings', () => ({
  getSiteSettings: () => ({ developer: mockSite }),
}));
beforeEach(() => {
  mockFolder = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-global-hook-test-')
  );
  mockSite = { ...emptyDeveloperConfig };
});
afterEach(() => fs.rmSync(mockFolder, { recursive: true, force: true }));
const hook = {
  id: 'global-one',
  name: 'Reading',
  enabled: true,
  path: '/articles/*',
  before: "log('global before')",
  after: "log('global after')",
  css: 'p{}',
  exclusions: ['*.private.example.com'],
};
it('isolates profiles, validates settings and rejects stale saves', () => {
  const initial = getGlobalHooks('one');
  const changed = jest.fn();
  const off = onGlobalHooksChanged(changed);
  saveGlobalHooks(
    'one',
    { enabled: true, hooks: [hook] },
    globalHookHash(initial)
  );
  expect(changed).toHaveBeenCalledWith('one');
  expect(getGlobalHooks('two').hooks).toEqual([]);
  expect(() =>
    saveGlobalHooks('one', initial, globalHookHash(initial))
  ).toThrow('changed');
  expect(() =>
    saveGlobalHooks(
      'one',
      { enabled: true, hooks: [{ ...hook, path: 'bad' }] },
      globalHookHash(getGlobalHooks('one'))
    )
  ).toThrow('Invalid');
  off();
});
it('runs globals independently of the site switch and resolves matching globals before site hooks', () => {
  saveGlobalHooks(
    'one',
    { enabled: true, hooks: [hook] },
    globalHookHash(getGlobalHooks('one'))
  );
  expect(
    effectiveHookConfig('one', 'https://example.com/articles/1').hooks?.[0].id
  ).toBe('global:global-one');
  expect(
    effectiveHookConfig('one', 'https://example.com/articles/1').enabled
  ).toBe(true);
  expect(
    effectiveHookConfig('one', 'https://sub.private.example.com/articles/1')
      .enabled
  ).toBe(false);
  expect(effectiveHookConfig('one', 'https://example.com/other').enabled).toBe(
    false
  );
  expect(effectiveHookConfig('one', 'file:///articles/1').enabled).toBe(false);
  mockSite = {
    ...emptyDeveloperConfig,
    enabled: true,
    before: 'local before',
    hooks: [{ ...hook, id: 'site-one', name: 'Local' }],
  } as any;
  const config = effectiveHookConfig('one', 'https://example.com/articles/1');
  expect(config.hooks?.map((item) => item.id)).toEqual([
    'global:global-one',
    'site-one',
  ]);
  expect(config.before).toBe('local before');
  const global = getGlobalHooks('one');
  saveGlobalHooks('one', { ...global, enabled: false }, globalHookHash(global));
  expect(
    effectiveHookConfig('one', 'https://example.com/articles/1').hooks?.map(
      (item) => item.id
    )
  ).toEqual(['site-one']);
});

it('runs All groups hooks across current and future profiles before narrower hooks', () => {
  saveGlobalHooks(
    ALL_GROUPS_HOOK_SCOPE,
    { enabled: true, hooks: [hook] },
    globalHookHash(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE))
  );
  saveGlobalHooks(
    'one',
    { enabled: true, hooks: [{ ...hook, id: 'group-one' }] },
    globalHookHash(getGlobalHooks('one'))
  );
  expect(
    effectiveHookConfig('one', 'https://example.com/articles/1').hooks?.map(
      (h) => h.id
    )
  ).toEqual(['global:all:global-one', 'global:group-one']);
  expect(
    effectiveHookConfig(
      'new-profile',
      'https://example.com/articles/1'
    ).hooks?.map((h) => h.id)
  ).toEqual(['global:all:global-one']);
  expect(
    effectiveHookConfig(
      'new-profile',
      'https://sub.private.example.com/articles/1'
    ).enabled
  ).toBe(false);
  expect(effectiveHookConfig('new-profile', 'kudium://settings').enabled).toBe(
    false
  );
  const all = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  saveGlobalHooks(
    ALL_GROUPS_HOOK_SCOPE,
    { ...all, enabled: false },
    globalHookHash(all)
  );
  expect(
    effectiveHookConfig('new-profile', 'https://example.com/articles/1').enabled
  ).toBe(false);
  expect(
    effectiveHookConfig('one', 'https://example.com/articles/1').hooks?.map(
      (h) => h.id
    )
  ).toEqual(['global:group-one']);
});
