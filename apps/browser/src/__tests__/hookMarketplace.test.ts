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
import { getSiteSettings, updateSiteSettings } from '../main/siteSettings';
import {
  getGlobalHooks,
  saveGlobalHooks,
  globalHookHash,
} from '../main/globalHooks';

let mockFolder: string;
jest.mock('electron', () => ({
  app: { getPath: () => mockFolder, getVersion: () => '1.0.0' },
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  BrowserWindow: { fromWebContents: () => mockHost },
  shell: { openExternal: jest.fn() },
}));
jest.mock('../main/preferences', () => ({ showBrowserPreferences: jest.fn() }));
jest.mock('../main/siteDeveloperWindow', () => ({
  getSiteDeveloperBinding: () => undefined,
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
it('rejects site mismatches and stores global hooks disabled without enabling their profile', async () => {
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
  expect(global.enabled).toBe(false);
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

it('installs All groups into its own disabled store and keeps group settings separate', async () => {
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
    id: 'tab',
    receipt: preview.receipt,
    allGroups: true,
    global: true,
  });
  expect(result.siteHooks).toEqual([]);
  expect(result.global.enabled).toBe(false);
  expect(result.global.hooks[0].enabled).toBe(false);
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
  expect(getGlobalHooks('profile-one').enabled).toBe(false);
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
