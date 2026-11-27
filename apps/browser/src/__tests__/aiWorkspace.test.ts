/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { IApp } from '../types';

const dialog = jest.fn();
jest.mock('../main/dialogs', () => ({ showBrowserDialog: (...args: unknown[]) => dialog(...args) }));
let preferences: Record<string, unknown> = {};
const updatePreferences = jest.fn();
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => preferences,
  validatePreferences: (patch: Record<string, unknown>) => {
    if ('bogus' in patch) throw new Error('Invalid preferences');
    return patch;
  },
  updateBrowserPreferences: (patch: unknown) => updatePreferences(patch),
}));
const sites = new Map<string, { permissions: Record<string, string> }>();
jest.mock('../main/siteSettings', () => ({
  siteOrigin: (url: string) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : undefined;
    } catch {
      return undefined;
    }
  },
  getSiteSettings: (profile: string, origin: string) => ({
    permissions: { ...(sites.get(`${profile}|${origin}`)?.permissions || {}) },
  }),
  updateSiteSettings: (profile: string, origin: string, patch: { permissions: Record<string, string> }) => {
    sites.set(`${profile}|${origin}`, { permissions: patch.permissions });
  },
}));
const scripts: { id: string; name: string; command: string; scope: 'project' | 'global' }[] = [];
jest.mock('../main/projectScripts', () => ({
  projectScripts: (_group: string, _folder: string, request: Record<string, string>) => {
    if (request.action === 'save') {
      const existing = scripts.find((script) => script.id === request.id);
      if (existing) Object.assign(existing, { name: request.name, command: request.command });
      else scripts.push({ id: `s${scripts.length + 1}`, name: request.name, command: request.command, scope: 'project' });
    }
    return scripts;
  },
}));
const links = new Map<string, string>();
jest.mock('../main/developerProject', () => ({
  linkedProjectFolder: (key: string) => links.get(key),
}));

import { aiWorkspaceTool, AIWorkspaceContext } from '../main/aiWorkspace';

const tab = (id: string, url: string, extra: Partial<IApp> = {}): IApp =>
  ({ id, url, name: new URL(url).hostname, icon: '', sessionId: 'g1', sessionName: 'Delight', ...extra } as IApp);
// aiGroupId(tab) for sessionId g1 / g2 in the default space.
const G1 = JSON.stringify(['g1', 'default']);
const G2 = JSON.stringify(['g2', 'default']);

let root: string;
let tabs: IApp[];
let context: AIWorkspaceContext;
const calls: string[] = [];
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-workspace-')));
  tabs = [tab('t1', 'http://localhost:5173/', { groupDisplay: 'stack' })];
  scripts.length = 0;
  sites.clear();
  links.clear();
  calls.length = 0;
  preferences = { writeBrowserInstructions: true, zoom: 1, tabDisplayMode: 'horizontal', cloudSync: { account: 'me' } };
  dialog.mockReset();
  updatePreferences.mockReset();
  context = {
    host: {} as never,
    signal: new AbortController().signal,
    name: 'get_workspace_config',
    args: {},
    tabs: () => tabs,
    tab: tabs[0],
    groupId: G1,
    mode: 'standard',
    check: () => {},
    openTab: async (url, source) => {
      calls.push(`open ${url} from ${source}`);
      const id = `t${tabs.length + 1}`;
      tabs.push(tab(id, url));
      return { tabId: id };
    },
    createGroup: async (name, url) => {
      calls.push(`create ${name} ${url}`);
      tabs.push(tab('n1', url, { sessionId: 'g2', sessionName: name }));
      return { groupId: G2, tabId: 'n1' };
    },
    selectGroup: (id) => calls.push(`select ${id}`),
    updateGroup: async (changes) => {
      calls.push(`update ${JSON.stringify(changes)}`);
      changes.forEach(({ id, changes: patch }) => Object.assign(tabs.find((entry) => entry.id === id)!, patch));
    },
    linkFolder: async (source, folder) => {
      calls.push(`link ${source} ${folder}`);
      const key = JSON.stringify([tabs.find((entry) => entry.id === source)!.sessionId, 'default']);
      links.set(key, folder);
    },
    chooseAccess: (mode) => calls.push(`access ${mode}`),
    withApproval: async (run) => {
      calls.push('approval on');
      try {
        return await run();
      } finally {
        calls.push('approval off');
      }
    },
  };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const run = (name: AIWorkspaceContext['name'], args: Record<string, unknown> = {}) =>
  aiWorkspaceTool({ ...context, name, args });

it('reads the effective manifest from the browser, or the file when linked', async () => {
  await expect(run('get_workspace_config')).resolves.toMatchObject({
    linked: false,
    source: 'browser',
    manifest: { version: 1, group: { name: 'Delight', display: 'stack' }, tabs: [{ url: 'http://localhost:5173/' }] },
  });
  links.set(G1, root);
  fs.writeFileSync(path.join(root, 'kudium.workspace.json'), JSON.stringify({ version: 1, skills: ['SKILL.md'] }));
  await expect(run('get_workspace_config')).resolves.toMatchObject({
    linked: true,
    source: 'file',
    path: path.join(root, 'kudium.workspace.json'),
    manifest: { version: 1, skills: ['SKILL.md'] },
    browser: { skills: ['SKILL.md'] },
  });
  expect(dialog).not.toHaveBeenCalled();
});

it('applies a manifest after one review, confirms the ai block separately and writes the file', async () => {
  links.set(G1, root);
  dialog.mockResolvedValueOnce({ response: 1 }).mockResolvedValueOnce({ response: 1 });
  const manifest = {
    version: 1,
    group: { name: 'Delight', display: 'folder' },
    tabs: [{ url: 'http://localhost:5173/', pinned: true }, { url: 'http://localhost:8000/docs' }],
    scripts: [{ id: 'dev', name: 'Dev', command: 'pnpm dev' }],
    siteSettings: { 'localhost:5173': { notifications: 'allow' } },
    ai: { trusted: true, mode: 'full' },
  };
  const result = await run('apply_workspace_config', { manifest });
  expect(dialog).toHaveBeenCalledTimes(2);
  expect(dialog.mock.calls[0][1]).toMatchObject({ message: 'Apply workspace configuration to “Delight”?', buttons: ['Cancel', 'Apply'] });
  expect(dialog.mock.calls[0][1].detail).toContain('+ Dev: pnpm dev');
  expect(dialog.mock.calls[0][1].detail).toContain('Writes kudium.workspace.json');
  expect(dialog.mock.calls[1][1]).toMatchObject({ message: 'Change AI access for this group?' });
  expect(dialog.mock.calls[1][1].detail).toContain('trusted group: false → true');
  expect(calls).toEqual([
    'approval on',
    'update [{"id":"t1","changes":{"groupDisplay":"folder"}}]',
    'open http://localhost:8000/docs from t1',
    'update [{"id":"t1","changes":{"pinned":true}}]',
    'update [{"id":"t1","changes":{"aiTrusted":true}},{"id":"t2","changes":{"aiTrusted":true}}]',
    'access full',
    'approval off',
  ]);
  expect(scripts).toEqual([{ id: 's1', name: 'Dev', command: 'pnpm dev', scope: 'project' }]);
  expect(sites.get('g1|http://localhost:5173')).toEqual({ permissions: { notifications: 'allow' } });
  expect(result).toMatchObject({ applied: true, aiApplied: true, tabIds: ['t2'], scripts: { added: 1, changed: 0 }, siteSettings: 1 });
  expect(JSON.parse(fs.readFileSync(path.join(root, 'kudium.workspace.json'), 'utf8'))).toMatchObject({
    version: 1,
    group: { name: 'Delight', slug: 'delight', display: 'folder' },
    scripts: [{ id: 'dev' }],
  });
});

it('changes nothing when the review is declined, and skips the ai block when its confirmation is declined', async () => {
  dialog.mockResolvedValueOnce({ response: 0 });
  await expect(
    run('apply_workspace_config', { manifest: { version: 1, tabs: [{ url: 'http://localhost:9/' }] } })
  ).rejects.toThrow('declined');
  expect(calls).toEqual([]);
  expect(tabs).toHaveLength(1);
  dialog.mockResolvedValueOnce({ response: 1 }).mockResolvedValueOnce({ response: 0 });
  const result = await run('apply_workspace_config', { manifest: { version: 1, ai: { trusted: true } } });
  expect(result).toMatchObject({ applied: true, aiApplied: false });
  expect(tabs[0].aiTrusted).toBeUndefined();
  expect(calls).toEqual(['approval on', 'approval off']);
});

it('reports no-op manifests without a dialog and rejects invalid ones before review', async () => {
  await expect(run('apply_workspace_config', { manifest: { version: 1 } })).resolves.toMatchObject({ applied: false });
  await expect(run('apply_workspace_config', { manifest: { version: 1, apiKey: 'x' } })).rejects.toThrow('secret');
  await expect(run('apply_workspace_config', { manifest: { version: 1, hooks: {} } })).rejects.toThrow('unsupported key');
  expect(dialog).not.toHaveBeenCalled();
});

it('sets up a new project: review, create group, link, open the rest, write files', async () => {
  dialog.mockResolvedValueOnce({ response: 1 });
  fs.writeFileSync(
    path.join(root, 'kudium.workspace.json'),
    JSON.stringify({
      version: 1,
      group: { name: 'Delight' },
      tabs: [{ url: 'http://localhost:5173/' }, { url: 'http://localhost:8000/docs' }],
      scripts: [{ id: 'dev', name: 'Dev', command: 'pnpm dev' }],
    })
  );
  const result = await run('setup_project', { folder: root });
  expect(dialog).toHaveBeenCalledTimes(1);
  expect(dialog.mock.calls[0][1]).toMatchObject({ message: 'Set up project “Delight”?', buttons: ['Cancel', 'Set up project'] });
  expect(dialog.mock.calls[0][1].detail).toContain('Create the group “Delight”');
  expect(dialog.mock.calls[0][1].detail).toContain('.mcp.json');
  expect(calls).toEqual([
    'approval on',
    'create Delight http://localhost:5173/',
    `link n1 ${root}`,
    'open http://localhost:8000/docs from n1',
    'approval off',
  ]);
  expect(result).toMatchObject({ groupId: G2, tabIds: ['n1', 't3'], folder: root, scripts: { added: 1, changed: 0 }, aiApplied: false });
  expect(scripts.map((script) => script.command)).toEqual(['pnpm dev']);
});

it('reuses the group already linked to the folder and needs a first tab for a new one', async () => {
  links.set(G1, root);
  dialog.mockResolvedValueOnce({ response: 1 });
  await expect(run('setup_project', { folder: root, manifest: { version: 1, tabs: [{ url: 'http://localhost:5173/' }] } })).resolves.toMatchObject({
    groupId: G1,
    tabIds: [],
  });
  expect(calls).toEqual(['approval on', `select ${G1}`, `link t1 ${root}`, 'approval off']);
  links.clear();
  await expect(run('setup_project', { folder: root, manifest: { version: 1 } })).rejects.toThrow('first website');
  await expect(run('setup_project', { folder: 'relative' })).rejects.toThrow('absolute');
  await expect(run('setup_project', { folder: path.join(root, 'nope') })).rejects.toThrow('existing project folder');
});

it('hides account and network preferences, and reviews every preference write', async () => {
  await expect(run('get_preferences')).resolves.toEqual({
    preferences: { writeBrowserInstructions: true, zoom: 1, tabDisplayMode: 'horizontal' },
    hidden: expect.arrayContaining(['cloudSync', 'advanced']),
  });
  await expect(run('set_preferences', { preferences: { cloudSync: {} }, reason: 'x' })).rejects.toThrow('cannot be changed');
  await expect(run('set_preferences', { preferences: { zoom: 1.5 } })).rejects.toThrow('reason');
  await expect(run('set_preferences', { preferences: { bogus: 1 }, reason: 'x' })).rejects.toThrow('Invalid preferences');
  await expect(run('set_preferences', { preferences: { zoom: 1 }, reason: 'same' })).resolves.toEqual({ changed: false, keys: [] });
  expect(dialog).not.toHaveBeenCalled();
  dialog.mockResolvedValueOnce({ response: 0 });
  await expect(run('set_preferences', { preferences: { zoom: 1.5 }, reason: 'bigger text' })).rejects.toThrow('declined');
  expect(updatePreferences).not.toHaveBeenCalled();
  dialog.mockResolvedValueOnce({ response: 1 });
  await expect(run('set_preferences', { preferences: { zoom: 1.5, tabDisplayMode: 'hover' }, reason: 'bigger text' })).resolves.toEqual({
    changed: true,
    keys: ['zoom', 'tabDisplayMode'],
  });
  expect(dialog.mock.calls[1][1].detail).toBe('bigger text\n\nzoom: 1 → 1.5\ntabDisplayMode: "horizontal" → "hover"');
  expect(updatePreferences).toHaveBeenCalledWith({ zoom: 1.5, tabDisplayMode: 'hover' });
});
