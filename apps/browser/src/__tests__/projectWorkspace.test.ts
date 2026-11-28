/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import type { IApp } from '../types';
import { aiGroupId } from '../browser/aiGroups';

let mockRoot: string;
let enabled = true;
const preferencesListeners = new Set<() => void>();
jest.mock('electron', () => ({
  app: { getPath: () => mockRoot },
  dialog: {},
  shell: {},
}));
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({ writeBrowserInstructions: enabled }),
  onBrowserPreferencesChanged: (listener: () => void) => {
    preferencesListeners.add(listener);
    return () => preferencesListeners.delete(listener);
  },
  validatePreferences: (value: unknown) => value,
  updateBrowserPreferences: jest.fn(),
}));
const review = jest.fn();
jest.mock('../main/dialogs', () => ({
  showBrowserDialog: (...args: unknown[]) => review(...args),
}));
jest.mock('../main/projectTerminal', () => ({
  projectTerminalDefinitions: () => undefined,
  onProjectTerminalsChanged: () => () => {},
}));
const sites = new Map<string, Record<string, string>>();
jest.mock('../main/siteSettings', () => ({
  siteOrigin: (url: string) => new URL(url).origin,
  getSiteSettings: (_profile: string, origin: string) => ({
    permissions: sites.get(origin) || {},
  }),
  updateSiteSettings: (
    _profile: string,
    origin: string,
    patch: { permissions: Record<string, string> }
  ) => sites.set(origin, patch.permissions),
  onSiteSettingsChanged: () => () => {},
}));

import { projectAction, linkedProjectFolder } from '../main/developerProject';
import { projectScripts } from '../main/projectScripts';
import {
  readWorkspaceManifest,
  writeWorkspaceManifest,
} from '../main/workspaceManifest';
import {
  restoreProjectWorkspace,
  WorkspaceMutation,
} from '../main/projectWorkspaceRestore';
import { ProjectWorkspaceSync } from '../main/projectWorkspaceSync';
import { workspaceFromBrowser } from '../main/workspaceBrowserState';

let tabs: IApp[];
let folder: string;
let sync: ProjectWorkspaceSync;
const host = new EventEmitter() as any;
const access = {
  mode: () => 'standard' as const,
  change: jest.fn(),
  assertChange: jest.fn(),
};
const check = jest.fn();
let update: jest.MockedFunction<WorkspaceMutation>;
const key = () => aiGroupId(tabs[0]);
beforeEach(() => {
  mockRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-portable-'))
  );
  folder = path.join(mockRoot, 'project');
  fs.mkdirSync(folder);
  tabs = [
    {
      id: 'a',
      sessionId: 'group',
      name: 'Blank',
      sessionName: 'Blank',
      url: 'https://blank.test/',
      icon: '',
      sessionMode: 'separate',
      pinned: true,
    } as IApp,
  ];
  enabled = true;
  sites.clear();
  jest.clearAllMocks();
  review.mockResolvedValue({ response: 1 });
  update = jest.fn(async (patches, additions = []) => {
    patches.forEach(({ id, changes }) =>
      Object.assign(
        tabs.find((tab) => tab.id === id)!,
        changes
      )
    );
    tabs.push(...additions);
    sync.refresh();
  });
  sync = new ProjectWorkspaceSync(() => tabs);
  sync.refresh();
});
afterEach(() => {
  sync.dispose();
  fs.rmSync(mockRoot, { recursive: true, force: true });
});
const restore = () =>
  restoreProjectWorkspace(host, 'a', folder, () => tabs, update, check, access);
const link = async () => {
  const resume = sync.suspend(key());
  try {
    await projectAction(
      host,
      key(),
      'link',
      check,
      undefined,
      folder,
      { name: 'Blank', slug: 'blank' },
      restore
    );
  } finally {
    resume();
  }
  sync.flush();
};

it('restores a team folder, saves project scripts without running them, and round-trips subsequent edits', async () => {
  writeWorkspaceManifest(folder, {
    version: 1,
    group: {
      name: 'Atlas',
      slug: 'atlas',
      display: 'folder',
      sessionMode: 'separate',
    },
    tabs: [{ url: 'https://docs.test/', title: 'Docs', pinned: true }],
    scripts: [
      { id: 'start', name: 'Start', command: 'npm run dev', shortcut: 'cmd+1' },
    ],
    skills: ['.kudium/skills/qa'],
    ai: { sessions: { qa: { tabs: [], description: 'Check the dashboard' } } },
  });
  await link();
  expect(linkedProjectFolder(key())).toBe(folder);
  expect(tabs).toHaveLength(2);
  expect(tabs[1]).toMatchObject({
    sessionName: 'Atlas',
    sessionId: 'group',
    customName: 'Docs',
    tabPinned: true,
  });
  expect(update).toHaveBeenCalledTimes(1);
  const saved = projectScripts(key(), folder, { action: 'list' });
  expect(saved).toEqual([
    expect.objectContaining({
      name: 'Start',
      command: 'npm run dev',
      scope: 'project',
    }),
  ]);
  tabs[1].url = 'https://docs.test/guide';
  sync.refresh();
  projectScripts(key(), folder, {
    action: 'save',
    id: saved[0].id,
    name: 'Start',
    command: 'npm run preview',
    scope: 'project',
  });
  projectScripts(key(), folder, {
    action: 'save',
    name: 'Personal',
    command: 'echo personal',
    scope: 'global',
  });
  sync.flush();
  const manifest = readWorkspaceManifest(folder)!;
  expect(manifest.tabs).toContainEqual({
    url: 'https://docs.test/guide',
    title: 'Docs',
    pinned: true,
  });
  expect(manifest.scripts).toEqual([
    {
      id: 'start',
      name: 'Start',
      command: 'npm run preview',
      shortcut: 'cmd+1',
    },
  ]);
  expect(manifest.skills).toEqual(['.kudium/skills/qa']);
  expect(manifest.ai?.sessions).toEqual({
    qa: { tabs: [], description: 'Check the dashboard' },
  });
  expect(JSON.stringify(manifest)).not.toContain(mockRoot);
  await link();
  expect(tabs).toHaveLength(2);
  expect(
    projectScripts(key(), folder, { action: 'list' }).filter(
      (script) => script.scope === 'project'
    )
  ).toHaveLength(1);
});

it('restores a copied project in a fresh browser profile with new local group IDs', async () => {
  writeWorkspaceManifest(folder, {
    version: 1,
    group: { name: 'Team', slug: 'team', display: 'folder' },
    tabs: [{ url: 'https://team.test/docs', title: 'Docs', pinned: true }],
    scripts: [{ id: 'dev', name: 'Dev', command: 'npm run dev' }],
    ai: {
      sessions: {
        review: {
          tabs: ['https://team.test/docs'],
          description: 'Review the project',
        },
      },
    },
  });
  await link();
  const originalProfile = mockRoot;
  const copiedFolder = path.join(originalProfile, 'project-copy');
  fs.cpSync(folder, copiedFolder, { recursive: true });
  sync.dispose();
  mockRoot = path.join(originalProfile, 'new-profile');
  fs.mkdirSync(mockRoot);
  folder = copiedFolder;
  tabs = [
    {
      ...tabs[0],
      id: 'a',
      sessionId: 'new-group',
      sessionName: 'Blank',
      sessionSlug: undefined,
      url: 'https://blank.test/',
    },
  ];
  sync = new ProjectWorkspaceSync(() => tabs);
  sync.refresh();
  try {
    await link();
    expect(linkedProjectFolder(key())).toBe(copiedFolder);
    expect(
      tabs.find((tab) => tab.url === 'https://team.test/docs')
    ).toMatchObject({
      sessionId: 'new-group',
      tabPinned: true,
      customName: 'Docs',
    });
    expect(projectScripts(key(), folder, { action: 'list' })).toEqual([
      expect.objectContaining({ name: 'Dev', command: 'npm run dev' }),
    ]);
    expect(
      readWorkspaceManifest(folder)?.ai?.sessions?.review.description
    ).toBe('Review the project');
    expect(JSON.stringify(readWorkspaceManifest(folder))).not.toContain(
      originalProfile
    );
  } finally {
    sync.dispose();
    mockRoot = originalProfile;
  }
});

it('cancellation leaves the browser, scripts, link and source file untouched', async () => {
  writeWorkspaceManifest(folder, {
    version: 1,
    group: { name: 'Team' },
    scripts: [{ id: 'dev', name: 'Dev', command: 'npm start' }],
  });
  const before = fs.readFileSync(
    path.join(folder, 'kudium.workspace.json'),
    'utf8'
  );
  review.mockResolvedValue({ response: 0 });
  await expect(link()).rejects.toThrow('cancelled');
  expect(tabs).toHaveLength(1);
  expect(update).not.toHaveBeenCalled();
  expect(linkedProjectFolder(key())).toBeUndefined();
  expect(projectScripts(key(), folder, { action: 'list' })).toEqual([]);
  expect(
    fs.readFileSync(path.join(folder, 'kudium.workspace.json'), 'utf8')
  ).toBe(before);
});

it('rejects excessive terminal definitions before applying or linking anything', async () => {
  writeWorkspaceManifest(folder, {
    version: 1,
    terminals: Array.from({ length: 9 }, (_, index) => ({
      name: `Shell ${index}`,
      cwd: '.',
    })),
  });
  await expect(link()).rejects.toThrow('up to eight terminals');
  expect(review).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(linkedProjectFolder(key())).toBeUndefined();
  expect(readWorkspaceManifest(folder)?.terminals).toHaveLength(9);
});

it('rejects stale file edits and revoked group access after review', async () => {
  writeWorkspaceManifest(folder, { version: 1, group: { name: 'Team' } });
  review.mockImplementationOnce(async () => {
    writeWorkspaceManifest(folder, {
      version: 1,
      group: { name: 'Changed by teammate' },
    });
    return { response: 1 };
  });
  await expect(link()).rejects.toThrow('configuration changed');
  expect(update).not.toHaveBeenCalled();
  review.mockImplementationOnce(async () => {
    check.mockImplementation(() => {
      throw new Error('Locked');
    });
    return { response: 1 };
  });
  await expect(link()).rejects.toThrow('Locked');
  check.mockReset();
  expect(update).not.toHaveBeenCalled();
});

it('reviews AI access separately and honors refusal and the active-action guard', async () => {
  writeWorkspaceManifest(folder, {
    version: 1,
    group: { name: 'Team' },
    ai: { trusted: true, mode: 'full' },
  });
  review
    .mockResolvedValueOnce({ response: 1 })
    .mockResolvedValueOnce({ response: 0 });
  await link();
  expect(review.mock.calls[1][1].message).toBe(
    'Change AI access for this group?'
  );
  expect(access.change).not.toHaveBeenCalled();
  expect(tabs[0].aiTrusted).not.toBe(true);
  writeWorkspaceManifest(folder, {
    version: 1,
    ai: { trusted: true, mode: 'full' },
  });
  access.assertChange.mockImplementationOnce(() => {
    throw new Error('Stop the current AI action');
  });
  update.mockClear();
  await expect(link()).rejects.toThrow('Stop the current AI action');
  expect(update).not.toHaveBeenCalled();
});

it('debounces saves, skips unchanged layouts and protects external changes', async () => {
  await link();
  const read = jest.spyOn(fs, 'readFileSync');
  const write = jest.spyOn(fs, 'writeFileSync');
  for (let i = 0; i < 100; i += 1) sync.refresh();
  sync.flush();
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  read.mockRestore();
  write.mockRestore();
  const file = path.join(folder, 'kudium.workspace.json');
  const external = {
    ...readWorkspaceManifest(folder),
    group: { name: 'Teammate setup' },
  };
  fs.writeFileSync(file, JSON.stringify(external));
  tabs[0].sessionName = 'My browser name';
  sync.refresh();
  sync.flush();
  expect(readWorkspaceManifest(folder)?.group?.name).toBe('Teammate setup');
  expect(sync.notice(key())).toContain('changed outside Kudium');
});

it('coalesces repeated edits into one delayed save and removes deleted scripts', async () => {
  await link();
  const script = projectScripts(key(), folder, {
    action: 'save',
    name: 'Build',
    command: 'npm run build',
    scope: 'project',
  })[0];
  sync.flush();
  jest.useFakeTimers();
  const write = jest.spyOn(fs, 'writeFileSync');
  try {
    for (let index = 0; index < 10; index += 1) {
      tabs[0].url = `https://example.test/${index}`;
      sync.refresh();
    }
    projectScripts(key(), folder, { action: 'delete', id: script.id });
    write.mockClear();
    jest.advanceTimersByTime(499);
    expect(write).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(readWorkspaceManifest(folder)?.scripts).toEqual([]);
    expect(readWorkspaceManifest(folder)?.tabs?.[0].url).toBe(
      'https://example.test/9'
    );
  } finally {
    write.mockRestore();
    jest.useRealTimers();
  }
});

it('keeps an existing manifest at startup and respects the project-write preference', async () => {
  await link();
  sync.dispose();
  fs.writeFileSync(
    path.join(folder, 'kudium.workspace.json'),
    JSON.stringify({ version: 1, group: { name: 'New team setup' } })
  );
  sync = new ProjectWorkspaceSync(() => tabs);
  sync.refresh();
  sync.flush();
  expect(readWorkspaceManifest(folder)?.group?.name).toBe('New team setup');
  tabs[0].sessionName = 'New browser name';
  sync.refresh();
  sync.flush();
  expect(readWorkspaceManifest(folder)?.group?.name).toBe('New team setup');
  enabled = false;
  tabs[0].url = 'https://new.test/';
  sync.refresh();
  sync.flush();
  expect(readWorkspaceManifest(folder)?.group?.name).toBe('New team setup');
});

it('exports the real tab pin state independently of the group keep state', () => {
  tabs[0].pinned = true;
  expect(
    workspaceFromBrowser(tabs, key(), folder, undefined).tabs?.[0].pinned
  ).toBeUndefined();
  tabs[0].tabPinned = true;
  expect(
    workspaceFromBrowser(tabs, key(), folder, undefined).tabs?.[0].pinned
  ).toBe(true);
});
