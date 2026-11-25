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
  expect(initial.hooks).toEqual([]);
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

it('does not install bundled form actions in new profiles', () => {
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).hooks).toEqual([]);
  expect(effectiveHookConfig('new-profile', 'https://example.com').hooks).toEqual([]);
});

it('removes unchanged legacy Form tools and preserves customized copies', () => {
  const bundled: import('../browser/hookMarketplace').GlobalHook = {
    id: 'browser-form-tools', name: 'Form tools', enabled: true,
    path: '/*', before: '', after: '', css: '', exclusions: [],
    actions: [
      { id: 'generate-password', name: 'Generate password', contexts: ['password'], source: 'api.passwords.generateAndFill();' },
      { id: 'save-form', name: 'Save form to Personal Data', contexts: ['page', 'input', 'password'], source: 'api.personalData.saveForm();' },
      { id: 'fill-personal-data', name: 'Fill from Personal Data', contexts: ['input'], source: 'api.personalData.fill();' },
    ],
  };
  fs.writeFileSync(path.join(mockFolder, 'global-hooks.json'), JSON.stringify({
    '@browser-default-hooks': 1,
    [ALL_GROUPS_HOOK_SCOPE]: { enabled: false, hooks: [bundled, hook] },
  }));
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE)).toEqual({ enabled: false, hooks: [hook] });
  // Once retired, even a manually restored legacy ID is user-owned.
  const current = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  saveGlobalHooks(ALL_GROUPS_HOOK_SCOPE, { ...current, hooks: [bundled] }, globalHookHash(current));
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).hooks).toEqual([bundled]);
});

it('preserves customized Form tools during retirement', () => {
  const customized = { ...hook, id: 'browser-form-tools', name: 'Form tools' };
  fs.writeFileSync(path.join(mockFolder, 'global-hooks.json'), JSON.stringify({
    [ALL_GROUPS_HOOK_SCOPE]: { enabled: false, hooks: [customized] },
  }));
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE)).toEqual({ enabled: false, hooks: [customized] });
});

it('blocks invalid source before writing the global hook configuration', () => {
  const initial = getGlobalHooks('syntax-profile');
  const hash = globalHookHash(initial);
  expect(() => saveGlobalHooks('syntax-profile', { enabled: true, hooks: [{ ...hook, after: 'const broken = ;' }] }, hash)).toThrow('After load, line 1');
  expect(globalHookHash(getGlobalHooks('syntax-profile'))).toBe(hash);
});

it('website exclusions survive reloads, while global disable and removal apply across all profiles', () => {
  const scope = ALL_GROUPS_HOOK_SCOPE;
  const save = (config: ReturnType<typeof getGlobalHooks>) => saveGlobalHooks(scope, config, globalHookHash(getGlobalHooks(scope)));
  save({ enabled: true, hooks: [{ ...hook, exclusions: ['example.com'] }] });
  for (const profile of ['one', 'two']) {
    expect(effectiveHookConfig(profile, 'https://example.com/articles/1').hooks).toEqual([]);
    expect(effectiveHookConfig(profile, 'http://example.com/articles/2').hooks).toEqual([]);
    expect(effectiveHookConfig(profile, 'https://other.com/articles/1').hooks).toHaveLength(1);
    expect(effectiveHookConfig(profile, 'https://sub.example.com/articles/1').hooks).toHaveLength(1);
    expect(effectiveHookConfig(profile, 'https://notexample.com/articles/1').hooks).toHaveLength(1);
  }
  const folder = mockFolder;
  mockFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-reload-'));
  getGlobalHooks(scope);
  fs.rmSync(mockFolder, { recursive: true, force: true });
  mockFolder = folder;
  expect(getGlobalHooks(scope).hooks[0].exclusions).toEqual(['example.com']);
  save({ enabled: true, hooks: [{ ...hook, enabled: false, exclusions: [] }] });
  expect(effectiveHookConfig('one', 'https://example.com/articles/1').hooks).toEqual([]);
  expect(effectiveHookConfig('two', 'https://other.com/articles/1').hooks).toEqual([]);
  save({ enabled: true, hooks: [] });
  expect(effectiveHookConfig('one', 'https://example.com/articles/1').hooks).toEqual([]);
  expect(effectiveHookConfig('two', 'https://other.com/articles/1').hooks).toEqual([]);
  expect(getGlobalHooks(scope).hooks).toEqual([]);
});
