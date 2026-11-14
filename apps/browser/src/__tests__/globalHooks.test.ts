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
  const all = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  saveGlobalHooks(ALL_GROUPS_HOOK_SCOPE, {...all, enabled:false}, globalHookHash(all));
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

it('defaults the master switch on without running disabled hooks and preserves saved off settings', () => {
  const initial = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  expect(initial.enabled).toBe(true);
  expect(initial.hooks[0]).toMatchObject({id:'browser-form-tools',enabled:true,before:'',after:'',css:''});
  saveGlobalHooks(
    ALL_GROUPS_HOOK_SCOPE,
    { enabled: true, hooks: [{ ...hook, enabled: false }] },
    globalHookHash(initial)
  );
  expect(
    effectiveHookConfig('one', 'https://example.com/articles/1').enabled
  ).toBe(false);
  const current = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  saveGlobalHooks(
    ALL_GROUPS_HOOK_SCOPE,
    { ...current, enabled: false },
    globalHookHash(current)
  );
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).enabled).toBe(false);
  // Force a storage reload by reading a different data directory first.
  const savedFolder = mockFolder;
  mockFolder = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudium-global-hook-reload-')
  );
  getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  fs.rmSync(mockFolder, { recursive: true, force: true });
  mockFolder = savedFolder;
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).enabled).toBe(false);
});

it('disables default code independently of named site hooks', () => {
  const defaults = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  saveGlobalHooks(ALL_GROUPS_HOOK_SCOPE, {...defaults, enabled:false}, globalHookHash(defaults));
  mockSite = { ...emptyDeveloperConfig, enabled: true, name: 'My default', defaultEnabled: false, after: 'log("default")', hooks: [{ ...hook, id: 'site-hook', path: '/*' }] };
  const result = effectiveHookConfig('default-toggle-profile', 'https://example.com/articles/one');
  expect(result.after).toBe('');
  expect(result.hooks).toEqual([expect.objectContaining({ id: 'site-hook' })]);
});

it('seeds browser actions once and respects edits, deletion and future profiles', () => {
  const defaults = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  expect(defaults.hooks).toHaveLength(1);
  expect(defaults.hooks[0].actions?.map(a => a.name)).toEqual(['Generate password','Save form to Personal Data','Fill from Personal Data']);
  expect(effectiveHookConfig('new-profile','https://example.com').hooks?.[0].id).toBe('global:all:browser-form-tools');
  saveGlobalHooks(ALL_GROUPS_HOOK_SCOPE,{...defaults,hooks:[]},globalHookHash(defaults));
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).hooks).toEqual([]);
  // Reload storage by visiting a different disposable profile directory.
  const original = mockFolder;
  mockFolder = fs.mkdtempSync(path.join(os.tmpdir(),'kudium-global-reload-'));
  getGlobalHooks('temporary');
  fs.rmSync(mockFolder,{recursive:true,force:true});
  mockFolder = original;
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).hooks).toEqual([]);
});

it('adds Save form once to existing Form tools while preserving custom actions and disabled settings', () => {
  const existing = { ...hook, id: 'browser-form-tools', enabled: false, actions: [{ id: 'custom', name: 'My action', contexts: ['input'], source: 'return "custom";' }] };
  fs.writeFileSync(path.join(mockFolder, 'global-hooks.json'), JSON.stringify({
    '@browser-default-hooks': 1,
    [ALL_GROUPS_HOOK_SCOPE]: { enabled: false, hooks: [existing] },
  }));
  const migrated = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  expect(migrated.enabled).toBe(false);
  expect(migrated.hooks[0]).toMatchObject({ enabled: false, exclusions: existing.exclusions });
  expect(migrated.hooks[0].actions?.map(a => a.id)).toEqual(['custom', 'save-form']);
  const withoutSave = { ...migrated, hooks: [{ ...migrated.hooks[0], actions: migrated.hooks[0].actions!.filter(a => a.id !== 'save-form') }] };
  saveGlobalHooks(ALL_GROUPS_HOOK_SCOPE, withoutSave, globalHookHash(migrated));
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE)).toEqual(withoutSave);
  expect(JSON.parse(fs.readFileSync(path.join(mockFolder, 'global-hooks.json'), 'utf8'))['@browser-save-form-action']).toBe(2);
});

it('does not resurrect a deleted Form tools hook during the Save form migration', () => {
  fs.writeFileSync(path.join(mockFolder, 'global-hooks.json'), JSON.stringify({
    '@browser-default-hooks': 1,
    [ALL_GROUPS_HOOK_SCOPE]: { enabled: true, hooks: [] },
  }));
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).hooks).toEqual([]);
});

it('updates only the existing default Save form contexts and preserves actions deleted after the first migration', () => {
  const savedForm = { id: 'save-form', name: 'My save title', contexts: ['input', 'password'], source: 'api.personalData.saveForm();' };
  fs.writeFileSync(path.join(mockFolder, 'global-hooks.json'), JSON.stringify({ '@browser-default-hooks': 1, '@browser-save-form-action': 1, [ALL_GROUPS_HOOK_SCOPE]: { enabled: true, hooks: [{ ...hook, id: 'browser-form-tools', actions: [savedForm] }] } }));
  const updated = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  expect(updated.hooks[0].actions![0]).toMatchObject({ name: 'My save title', contexts: ['page', 'input', 'password'] });
});

it('does not restore a Save form action removed before the page-context update', () => {
  fs.writeFileSync(path.join(mockFolder, 'global-hooks.json'), JSON.stringify({ '@browser-default-hooks': 1, '@browser-save-form-action': 1, [ALL_GROUPS_HOOK_SCOPE]: { enabled: true, hooks: [{ ...hook, id: 'browser-form-tools', actions: [] }] } }));
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).hooks[0].actions).toEqual([]);
});
it('adds defaults to an existing configuration while preserving disabled masters and custom hooks', () => {
  fs.writeFileSync(path.join(mockFolder,'global-hooks.json'),JSON.stringify({[ALL_GROUPS_HOOK_SCOPE]:{enabled:false,hooks:[hook]}}));
  const loaded = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  expect(loaded.enabled).toBe(false);
  expect(loaded.hooks.map(h=>h.id)).toEqual(['global-one','browser-form-tools']);
  expect(effectiveHookConfig('new-profile','https://example.com').enabled).toBe(false);
});

it('blocks invalid source before writing the global hook configuration', () => {
  const initial = getGlobalHooks('syntax-profile');
  const hash = globalHookHash(initial);
  expect(() => saveGlobalHooks('syntax-profile', { enabled: true, hooks: [{ ...hook, after: 'const broken = ;' }] }, hash)).toThrow('After load, line 1');
  expect(globalHookHash(getGlobalHooks('syntax-profile'))).toBe(hash);
});
