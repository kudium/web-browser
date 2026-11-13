/** @jest-environment node */
/* The portable package is shared with the web service; mocked getters run after setup. */
/* eslint-disable import/no-relative-packages, no-use-before-define */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ipcMain } from 'electron';
import { parseHookPackage } from '../../../../packages/hooks/package';
import {
  registerHookMarketplace,
  queueHookInstallLink,
  setHookPublisher,
  setHookAccountStatus,
} from '../main/hookMarketplace';
import { fetchHookPackage, hookPackageHash } from '../main/hookPackageFetch';
import { showBrowserPreferences } from '../main/preferences';
import { ALL_GROUPS_HOOK_SCOPE } from '../browser/hookMarketplace';
import { createHookTestWindow } from '../main/hookTestWindow';
import { createHookEditorWindow } from '../main/siteDeveloperWindow';
import { getSiteSettings, updateSiteSettings } from '../main/siteSettings';
import {
  getGlobalHooks,
  saveGlobalHooks,
  globalHookHash,
} from '../main/globalHooks';

let mockFolder: string;
jest.mock('electron', () => ({
  app: { getPath: () => mockFolder, getVersion: () => '1.0.0' },
  ipcMain: { handle: jest.fn(), on: jest.fn(), removeListener: jest.fn() },
  BrowserWindow: { fromWebContents: () => mockHost },
  shell: { openExternal: jest.fn() },
}));
jest.mock('../main/preferences', () => ({
  showBrowserPreferences: jest.fn(),
  getBrowserPreferences: () => ({
    translucentChrome: true,
    translucentAI: false,
  }),
}));
jest.mock('../main/hookTestWindow', () => ({
  createHookTestWindow: jest.fn(() => mockTestWindow),
  validateHookTest: jest.fn(),
}));
jest.mock('../main/siteDeveloperWindow', () => ({
  getSiteDeveloperBinding: () => undefined,
  createHookEditorWindow: jest.fn(() => mockEditor),
}));
jest.mock('../main/hookPackageFetch', () => ({
  ...jest.requireActual('../main/hookPackageFetch'),
  fetchHookPackage: jest.fn(),
}));
const mockSender = {
  id: 101,
  isDestroyed: () => false,
  mainFrame: {},
  send: jest.fn(),
};
const mockHost = { webContents: mockSender, isDestroyed: () => false };
const mockEditorContents = {
  once: jest.fn(),
  id: 303,
  send: jest.fn(),
  setWindowOpenHandler: jest.fn(),
  mainFrame: {},
  on: jest.fn(),
  isDestroyed: () => false,
};
const mockEditor = {
  webContents: mockEditorContents,
  once: jest.fn(),
  show: jest.fn(),
  focus: jest.fn(),
  close: jest.fn(),
  isDestroyed: () => false,
  loadURL: jest.fn(async () => {}),
  isMaximized: () => false,
  maximize: jest.fn(),
  unmaximize: jest.fn(),
};
const mockTestWindow = { destroy: jest.fn() };
const targets = [
  {
    id: 'tab',
    name: 'Reader',
    groupName: 'Work',
    groupId: 'work',
    profile: 'profile-one',
    url: 'https://example.com/articles/1',
  },
];
let handler: (event: any, input: any) => Promise<any>;
const event = { sender: mockSender, senderFrame: mockSender.mainFrame };
const pkg = parseHookPackage({
  schemaVersion: 1,
  minimumBrowserVersion: '1.0.0',
  name: 'Reader',
  description: 'Reading',
  license: 'MIT',
  applicability: 'general',
  sites: [],
  path: '/*',
  lifecycle: { before: '', after: '', css: 'p{}' },
});
beforeAll(() => {
  registerHookMarketplace(mockHost as any, () => targets);
  const [, callback] = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([channel]) => channel === 'hook-marketplace'
  );
  handler = callback;
});
beforeEach(() => {
  mockFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-install-test-'));
  (fetchHookPackage as jest.Mock).mockResolvedValue({
    source: 'https://example.org/package',
    package: pkg,
    verified: false,
  });
});
afterEach(() => fs.rmSync(mockFolder, { recursive: true, force: true }));
it('denies website and subframe IPC; receipts stay bound to the requesting renderer', async () => {
  await expect(
    handler(
      { sender: { id: 999, mainFrame: {} }, senderFrame: {} },
      { action: 'destinations' }
    )
  ).rejects.toThrow('Untrusted');
  await expect(
    handler({ ...event, senderFrame: {} }, { action: 'state', id: 'tab' })
  ).rejects.toThrow('Untrusted');
  const preview = await handler(event, {
    action: 'preview',
    url: 'https://example.org/package',
  });
  const otherSender = { ...mockSender, id: 202, mainFrame: {} };
  registerHookMarketplace({ webContents: otherSender } as any, () => targets);
  await expect(
    handler(
      { sender: otherSender, senderFrame: otherSender.mainFrame },
      { action: 'install', id: 'tab', receipt: preview.receipt, global: false }
    )
  ).rejects.toThrow('expired');
});
it('imports a disabled hook with a fresh local ID while preserving existing hooks', async () => {
  updateSiteSettings('profile-one', 'https://example.com', {
    developer: {
      enabled: true,
      before: 'default code',
      after: '',
      css: '',
      hooks: [
        {
          id: 'existing',
          name: 'Local',
          enabled: true,
          path: '/*',
          before: '',
          after: 'log(1)',
          css: '',
        },
      ],
    },
  });
  const preview = await handler(event, {
    action: 'preview',
    url: 'https://example.org/package',
  });
  await handler(event, {
    action: 'install',
    id: 'tab',
    receipt: preview.receipt,
    global: false,
  });
  const config = getSiteSettings('profile-one', 'https://example.com')
    .developer!;
  expect(config.before).toBe('default code');
  expect(config.hooks).toHaveLength(2);
  expect(config.hooks?.[0].enabled).toBe(true);
  expect(config.hooks?.[1].enabled).toBe(false);
  expect(config.hooks?.[1].installed?.contentHash).toBe(hookPackageHash(pkg));
  await expect(
    handler(event, {
      action: 'install',
      id: 'tab',
      receipt: preview.receipt,
      global: false,
    })
  ).rejects.toThrow('expired');
});
it('rejects site mismatches and installs individual global hooks disabled', async () => {
  (fetchHookPackage as jest.Mock).mockResolvedValueOnce({
    source: 'https://example.org/package',
    package: {
      ...pkg,
      applicability: 'site',
      sites: [{ host: 'other.com', includeSubdomains: false }],
    },
    verified: false,
  });
  const mismatch = await handler(event, {
    action: 'preview',
    url: 'https://example.org/package',
  });
  await expect(
    handler(event, {
      action: 'install',
      id: 'tab',
      receipt: mismatch.receipt,
      global: false,
    })
  ).rejects.toThrow('does not support');
  const preview = await handler(event, {
    action: 'preview',
    url: 'https://example.org/package',
  });
  await handler(event, {
    action: 'install',
    id: 'tab',
    receipt: preview.receipt,
    global: true,
  });
  const global = getGlobalHooks('profile-one');
  expect(global.enabled).toBe(true);
  expect(global.hooks[0].enabled).toBe(false);
  expect(global.hooks[0].exclusions).toEqual([]);
});
it('tracks local edits and applies reviewed updates with optimistic checks and preserved exclusions', async () => {
  const preview = await handler(event, {
    action: 'preview',
    url: 'https://example.org/package',
  });
  await handler(event, {
    action: 'install',
    id: 'tab',
    receipt: preview.receipt,
    global: true,
  });
  const global = getGlobalHooks('profile-one');
  const hook = global.hooks[0];
  global.hooks[0] = {
    ...hook,
    css: 'local CSS',
    exclusions: ['private.example.com'],
  };
  saveGlobalHooks(
    'profile-one',
    global,
    globalHookHash(getGlobalHooks('profile-one'))
  );
  (fetchHookPackage as jest.Mock).mockResolvedValue({
    source: 'https://example.org/package',
    package: { ...pkg, lifecycle: { ...pkg.lifecycle, css: 'new CSS' } },
    verified: false,
  });
  const [update] = await handler(event, { action: 'updates', id: 'tab' });
  expect(update.modified).toBe(true);
  expect(update.localPackage.lifecycle.css).toBe('local CSS');
  await expect(
    handler(event, {
      action: 'install',
      id: 'tab',
      global: true,
      receipt: update.preview.receipt,
      replaceId: hook.id,
      expectedHash: 'stale',
    })
  ).rejects.toThrow('changed');
  await handler(event, {
    action: 'install',
    id: 'tab',
    global: true,
    receipt: update.preview.receipt,
    replaceId: hook.id,
    expectedHash: update.localHash,
  });
  expect(getGlobalHooks('profile-one').hooks[0]).toMatchObject({
    id: hook.id,
    css: 'new CSS',
    enabled: false,
    exclusions: ['private.example.com'],
  });
});
it('delivers queued installs only after a trusted main-frame ready handshake', () => {
  queueHookInstallLink(
    'kudium://install-hook?url=https%3A%2F%2Fexample.org%2Fpackage'
  );
  const ready = (ipcMain.on as jest.Mock).mock.calls.find(
    ([channel]) => channel === 'hook-marketplace-ready'
  )[1];
  ready({ ...event, senderFrame: {} });
  expect(mockSender.send).not.toHaveBeenCalled();
  ready(event);
  expect(mockSender.send).toHaveBeenCalledWith(
    'hook-marketplace-install',
    'https://example.org/package'
  );
});

it('installs disabled All groups hooks with the master switch on and keeps group settings separate', async () => {
  const preview = await handler(event, {
    action: 'preview',
    url: 'https://example.org/package',
  });
  await expect(
    handler(event, {
      action: 'install',
      id: 'tab',
      receipt: preview.receipt,
      allGroups: true,
      global: false,
    })
  ).rejects.toThrow('requires a general hook');
  const result = await handler(event, {
    action: 'install',
    id: ALL_GROUPS_HOOK_SCOPE,
    receipt: preview.receipt,
    allGroups: true,
    global: true,
  });
  expect(result.siteHooks).toEqual([]);
  expect(result.global.enabled).toBe(true);
  expect(result.global.hooks.find((hook: any) => hook.installed)?.enabled).toBe(false);
  expect(getGlobalHooks('profile-one').hooks).toEqual([]);
  const all = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  const updated = await handler(event, {
    action: 'global-save',
    id: 'tab',
    allGroups: true,
    config: { ...all, enabled: true },
    expectedHash: globalHookHash(all),
  });
  expect(updated.global.enabled).toBe(true);
  expect(getGlobalHooks('profile-one').enabled).toBe(true);
});

it('publishes only saved default code with a public name and exposes a bounded account status', async () => {
  const published = jest
    .fn()
    .mockResolvedValue({ id: 'published-hook', version: 1 });
  setHookPublisher(published);
  setHookAccountStatus(() => ({
    signedIn: true,
    email: 'publisher@example.test',
  }));
  expect(await handler(event, { action: 'account-status' })).toEqual({
    signedIn: true,
    email: 'publisher@example.test',
  });
  updateSiteSettings('profile-one', 'https://example.com', {
    developer: {
      enabled: false,
      before: '',
      after: 'log("saved source")',
      css: '',
      hooks: [],
    },
  });
  const state = await handler(event, { action: 'state', id: 'tab' });
  expect(state.defaultHook.after).toBe('log("saved source")');
  await handler(event, {
    action: 'publish',
    id: 'tab',
    hookId: '',
    name: 'Reader helper',
    description: 'Useful reading helpers',
    license: 'MIT',
    general: false,
    after: 'untrusted draft',
  });
  expect(published).toHaveBeenCalledWith({
    package: expect.objectContaining({
      name: 'Reader helper',
      lifecycle: { before: '', after: 'log("saved source")', css: '' },
    }),
  });
  await handler(event, { action: 'account-preferences' });
  expect(showBrowserPreferences).toHaveBeenCalledWith(mockHost, 'sync');
  await expect(
    handler(
      { sender: { id: 888, mainFrame: {} }, senderFrame: {} },
      { action: 'account-status' }
    )
  ).rejects.toThrow('Untrusted');
});

it('manages all-group hooks from a trusted Settings host without website tabs', async () => {
  const sender = { id: 999, mainFrame: {} };
  registerHookMarketplace({ webContents: sender } as any, () => []);
  const request = { sender, senderFrame: sender.mainFrame };
  const state = await handler(request, {
    action: 'state',
    id: '@all-groups',
    allGroups: true,
  });
  const saved = await handler(request, {
    action: 'global-save',
    id: '@all-groups',
    allGroups: true,
    config: { ...state.global, enabled: true },
    expectedHash: state.globalHash,
  });
  expect(saved.global.enabled).toBe(true);
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).enabled).toBe(true);
  await expect(
    handler(request, { action: 'state', id: '@all-groups', allGroups: false })
  ).rejects.toThrow('Choose an unlocked website');
  await expect(
    handler(
      {
        sender: { id: 998, mainFrame: sender.mainFrame },
        senderFrame: sender.mainFrame,
      },
      { action: 'state', allGroups: true }
    )
  ).rejects.toThrow('Untrusted');
});

it('opens the shared native window, binds saves to its hook and reuses an open editor', async () => {
  const config = {
    enabled: true,
    hooks: [
      {
        id: 'window-hook',
        name: 'Window hook',
        enabled: false,
        path: '/*',
        before: '',
        after: '',
        css: 'p{}',
        exclusions: [],
      },
      {
        id: 'other',
        name: 'Other',
        enabled: false,
        path: '/*',
        before: '',
        after: '',
        css: '',
        exclusions: [],
      },
    ],
  };
  saveGlobalHooks(
    ALL_GROUPS_HOOK_SCOPE,
    config,
    globalHookHash(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE))
  );
  await handler(event, {
    action: 'global-editor-open',
    id: ALL_GROUPS_HOOK_SCOPE,
    allGroups: true,
    hookId: 'window-hook',
  });
  expect(createHookEditorWindow).toHaveBeenCalledWith(
    'Window hook — Hook Editor',
    mockHost
  );
  expect(mockEditor.loadURL).toHaveBeenCalledWith(
    expect.stringContaining('view=global-hook-editor')
  );
  await handler(event, {
    action: 'global-editor-open',
    id: ALL_GROUPS_HOOK_SCOPE,
    allGroups: true,
    hookId: 'window-hook',
  });
  expect(mockEditor.focus).toHaveBeenCalled();
  const editorEvent = {
    sender: mockEditorContents,
    senderFrame: mockEditorContents.mainFrame,
  };
  const state = await handler(editorEvent, { action: 'state' });
  expect(state.editorHook.id).toBe('window-hook');
  await expect(
    handler(editorEvent, {
      action: 'global-save',
      allGroups: false,
      config: {
        ...config,
        hooks: config.hooks.map((hook) => ({ ...hook, css: 'changed' })),
      },
      expectedHash: state.globalHash,
    })
  ).rejects.toThrow('selected hook');
  const result = await handler(editorEvent, {
    action: 'global-save',
    allGroups: false,
    config: {
      ...config,
      hooks: config.hooks.map((hook) =>
        hook.id === 'window-hook' ? { ...hook, css: 'p{color:blue}' } : hook
      ),
    },
    expectedHash: state.globalHash,
  });
  expect(result.editorHook.css).toBe('p{color:blue}');
  expect(getGlobalHooks('profile-one').hooks).toEqual([]);
  await expect(
    handler(editorEvent, { action: 'preview', url: 'https://example.com' })
  ).rejects.toThrow('Unsupported');
  await handler(editorEvent, {
    action: 'global-test-run',
    url: 'https://example.com',
    hook: result.editorHook,
  });
  expect(createHookTestWindow).toHaveBeenCalledWith(
    mockHost,
    result.editorHook,
    'https://example.com',
    expect.any(Function)
  );
  await handler(editorEvent, { action: 'global-test-stop' });
  expect(mockTestWindow.destroy).toHaveBeenCalled();
  await expect(
    handler(event, {
      action: 'global-test-run',
      url: 'https://example.com',
      hook: result.editorHook,
    })
  ).rejects.toThrow('Hook Editor');
  const closed = mockEditor.once.mock.calls.find(
    ([name]) => name === 'closed'
  )[1];
  closed();
  await expect(handler(editorEvent, { action: 'state' })).rejects.toThrow(
    'Untrusted'
  );
});

it('publishes the saved test URL and retains it when installing the package', async () => {
  const published = jest.fn(async (_input: any) => ({
    id: 'listing',
    version: 1,
  }));
  setHookPublisher(published);
  const hook = {
    id: 'test-url-hook',
    name: 'Test URL hook',
    testUrl: 'https://example.com/sample',
    enabled: false,
    path: '/*',
    before: '',
    after: '',
    css: 'p{}',
    exclusions: [],
  };
  saveGlobalHooks(
    ALL_GROUPS_HOOK_SCOPE,
    { enabled: true, hooks: [hook] },
    globalHookHash(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE))
  );
  await handler(event, {
    action: 'publish',
    id: 'tab',
    allGroups: true,
    hookId: 'global:test-url-hook',
    description: 'Test hook',
    license: 'MIT',
    general: true,
  });
  const publishedPackage = published.mock.calls[0][0].package;
  expect(publishedPackage.testUrl).toBe(hook.testUrl);
  (fetchHookPackage as jest.Mock).mockResolvedValue({
    source: 'https://example.org/package',
    package: publishedPackage,
    verified: false,
  });
  const preview = await handler(event, {
    action: 'preview',
    url: 'https://example.org/package',
  });
  const installed = await handler(event, {
    action: 'install',
    id: 'tab',
    allGroups: true,
    global: true,
    receipt: preview.receipt,
  });
  expect(installed.global.hooks[1].testUrl).toBe(hook.testUrl);
  expect(installed.global.hooks[1].enabled).toBe(false);
});

it('retains publication identity and publishes an edited hook as the next version', async () => {
  const publisher = jest.fn(async (input: any) => ({ id: 'own-listing', version: input.id ? 2 : 1 }));
  setHookPublisher(publisher);
  const hook = { id: 'republish-hook', name: 'Reader', enabled: false, path: '/*', before: '', after: '', css: 'p{}', exclusions: [] };
  saveGlobalHooks(ALL_GROUPS_HOOK_SCOPE, { enabled: true, hooks: [hook] }, globalHookHash(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE)));
  const input = { action: 'publish' as const, id: 'tab', allGroups: true, hookId: `global:${hook.id}`, description: 'Reader styles', license: 'MIT' as const, general: true };
  await handler(event, input);
  const saved = getGlobalHooks(ALL_GROUPS_HOOK_SCOPE);
  expect(saved.hooks[0].publication).toMatchObject({ id: 'own-listing', version: 1 });
  saveGlobalHooks(ALL_GROUPS_HOOK_SCOPE, { ...saved, hooks: [{ ...saved.hooks[0], css: 'p{color:blue}' }] }, globalHookHash(saved));
  await handler(event, { ...input, listingId: 'own-listing', expectedVersion: 1 });
  expect(publisher).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'own-listing', expectedVersion: 1, package: expect.objectContaining({ lifecycle: expect.objectContaining({ css: 'p{color:blue}' }) }) }));
  expect(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE).hooks[0].publication?.version).toBe(2);
});

it('publishes and installs actions-only packages without transferring grants', async () => {
  const published = jest.fn(async (_input: any) => ({id:'action-listing',version:1}));
  setHookPublisher(published);
  const action = {id:'generate',name:'Generate password',contexts:['password' as const],source:'api.passwords.generateAndFill();'};
  const hook = {id:'action-hook',name:'Password action',enabled:false,path:'/*',before:'',after:'',css:'',exclusions:[],actions:[action]};
  saveGlobalHooks(ALL_GROUPS_HOOK_SCOPE,{enabled:true,hooks:[hook]},globalHookHash(getGlobalHooks(ALL_GROUPS_HOOK_SCOPE)));
  await handler(event,{action:'publish',id:'tab',allGroups:true,hookId:'global:action-hook',description:'Generate a password',license:'MIT',general:true});
  const pkg = published.mock.calls[0][0].package;
  expect(pkg.schemaVersion).toBe(2); expect(pkg.actions).toEqual([action]);
  expect(pkg.grants).toBeUndefined();
  (fetchHookPackage as jest.Mock).mockResolvedValue({verified:false,package:pkg,source:'https://example.com/action-package'});
  const preview = await handler(event,{action:'preview',url:'https://example.com/action-package'});
  const installed = await handler(event,{action:'install',id:'tab',allGroups:true,global:true,receipt:preview.receipt});
  expect(installed.global.hooks[1].actions).toEqual([action]);
  expect(installed.global.hooks[1].enabled).toBe(false);
});
