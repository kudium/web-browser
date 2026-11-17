/** @jest-environment node */
import { app, ipcMain } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'node-pty';
import * as projects from '../main/developerProject';
import {
  developerPageSummaries,
  aiDeveloperProjectAccess,
  registerSiteDeveloperLibrary,
} from '../main/siteDeveloperLibrary';
import { getSiteSettings } from '../main/siteSettings';
import { isGroupLocked } from '../main/groupLocks';
import type { IApp } from '../types';

jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({
    ...jest.requireActual('../browser/preferences').defaultPreferences,
    writeBrowserInstructions: true,
  }),
}));
jest.mock('../main/localStorage', () => ({
  safeStorage: jest.requireMock('electron').safeStorage,
}));

jest.mock('node-pty', () => ({
  spawn: jest.fn(() => ({
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
    onData: jest.fn(),
    onExit: jest.fn(),
  })),
}));
jest.mock('electron', () => ({
  app: {
    getPath: () => jest.requireActual('os').tmpdir(),
    on: jest.fn(),
    getFileIcon: jest.fn(),
  },
  ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
}));
jest.mock('../main/siteSettings', () => ({
  onSiteSettingsChanged: jest.fn(() => () => {}),
  siteOrigin: (url: string) =>
    url.startsWith('https://') ? new URL(url).origin : undefined,
  getSiteSettings: jest.fn(),
}));
jest.mock('../main/siteDeveloper', () => ({
  developerState: () => ({ status: 'success' }),
}));
jest.mock('../main/groupLocks', () => ({
  isGroupLocked: jest.fn(),
  getGroupLocks: () => ({ subscribe: () => () => {} }),
}));
const home = {
  id: 'home',
  name: 'Home',
  sessionName: 'Work',
  sessionId: 'work',
  sessionProfileId: 'shared',
  spaceId: 'one',
  url: 'https://example.com/home',
} as IApp;
const tabs = [
  home,
  { ...home, id: 'second', url: 'https://example.com/page' },
  { ...home, id: 'other-group', sessionId: 'other' },
  { ...home, id: 'other-space', spaceId: 'two' },
  { ...home, id: 'archived', archived: true },
];
beforeEach(() => {
  (isGroupLocked as jest.Mock).mockReturnValue(false);
  (getSiteSettings as jest.Mock).mockReturnValue({
    developer: { enabled: true, before: '', after: 'log(url)', css: '' },
  });
});
it('lists only the chosen group and space, including saved hooks on unloaded pages, without returning source code', () => {
  const pages = developerPageSummaries(tabs, home, () => undefined);
  expect(pages.map((page) => page.id)).toEqual(['home', 'second']);
  expect(pages[0]).toMatchObject({
    hasHooks: true,
    enabled: true,
    status: 'waiting',
    origin: 'https://example.com',
  });
  expect(getSiteSettings).toHaveBeenCalledWith('shared', 'https://example.com');
  expect(pages[0].hooks).toEqual([
    { id: '', name: 'Default hook', path: '/*', enabled: true, status: 'waiting' },
  ]);
  expect(JSON.stringify(pages)).not.toContain('log(url)');
  (getSiteSettings as jest.Mock).mockReturnValue({
    developer: { enabled: false, before: '', after: 'log(url)', css: '' },
  });
  expect(developerPageSummaries(tabs, home, () => undefined)[0]).toMatchObject({
    hasHooks: true,
    enabled: false,
  });
  (getSiteSettings as jest.Mock).mockReturnValue({
    developer: { enabled: true, before: ' ', after: '', css: '' },
  });
  expect(developerPageSummaries(tabs, home, () => undefined)[0].hasHooks).toBe(
    false
  );
});
it('rejects locked groups, foreign windows, subframes and arbitrary group IDs', () => {
  const mainFrame = {};
  const sender = {
    id: 11,
    mainFrame,
    on: jest.fn(),
    removeListener: jest.fn(),
  };
  const dispose = registerSiteDeveloperLibrary(
    { webContents: sender } as any,
    () => tabs,
    () => undefined
  );
  const handle = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([channel]) => channel === 'site-developer-pages'
  )[1];
  expect(() =>
    handle({ sender: { id: 12, mainFrame }, senderFrame: mainFrame }, 'home')
  ).toThrow('Untrusted');
  expect(() => handle({ sender, senderFrame: {} }, 'home')).toThrow(
    'Untrusted'
  );
  expect(() =>
    handle({ sender, senderFrame: mainFrame }, 'other-scope')
  ).toThrow('no longer available');
  (isGroupLocked as jest.Mock).mockReturnValue(true);
  expect(() => handle({ sender, senderFrame: mainFrame }, 'home')).toThrow(
    'Unlock'
  );
  dispose();
  expect(ipcMain.removeHandler).toHaveBeenCalledWith('site-developer-pages');
});
it('restricts project actions to the host main frame and rejects locked groups', async () => {
  const mainFrame = {};
  const sender = {
    id: 21,
    mainFrame,
    on: jest.fn(),
    removeListener: jest.fn(),
  };
  const dispose = registerSiteDeveloperLibrary(
    { webContents: sender, isDestroyed: () => false } as any,
    () => tabs,
    () => undefined
  );
  const handle = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([channel]) => channel === 'site-developer-project'
  )[1];
  try {
    expect(() => handle({ sender, senderFrame: {} }, 'home', 'get')).toThrow(
      'Untrusted'
    );
    expect(() =>
      handle({ sender, senderFrame: mainFrame }, 'home', 'execute')
    ).toThrow('Choose');
    await expect(
      handle({ sender, senderFrame: mainFrame }, 'archived', 'get')
    ).rejects.toThrow('no longer available');
    (isGroupLocked as jest.Mock).mockReturnValue(true);
    await expect(
      handle({ sender, senderFrame: mainFrame }, 'home', 'get')
    ).rejects.toThrow('Unlock');
  } finally {
    dispose();
  }
});
it('restricts saved scripts to trusted main frames and unlocked group sources', () => {
  const mainFrame = {};
  const sender = {
    id: 31,
    mainFrame,
    on: jest.fn(),
    removeListener: jest.fn(),
  };
  const dispose = registerSiteDeveloperLibrary(
    { webContents: sender } as any,
    () => tabs,
    () => undefined
  );
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .slice()
    .reverse()
    .find((call) => call[0] === 'site-developer-scripts')[1];
  expect(() =>
    handler({ sender: { id: 90 }, senderFrame: mainFrame }, 'home', {
      action: 'list',
    })
  ).toThrow('Untrusted');
  expect(() =>
    handler({ sender, senderFrame: {} }, 'home', { action: 'list' })
  ).toThrow('Untrusted');
  expect(() =>
    handler({ sender, senderFrame: mainFrame }, 'home', {
      action: 'run',
      id: {},
    })
  ).toThrow('Invalid');
  expect(() =>
    handler({ sender, senderFrame: mainFrame }, 'missing', { action: 'list' })
  ).toThrow('no longer available');
  (isGroupLocked as jest.Mock).mockReturnValue(true);
  expect(() =>
    handler({ sender, senderFrame: mainFrame }, 'home', { action: 'list' })
  ).toThrow('Unlock');
  dispose();
});
it('restricts Files to trusted main frames, valid requests and unlocked source groups', async () => {
  const mainFrame = {};
  const sender = {
    id: 41,
    mainFrame,
    on: jest.fn(),
    removeListener: jest.fn(),
  };
  const dispose = registerSiteDeveloperLibrary(
    { webContents: sender, isDestroyed: () => false } as any,
    () => tabs,
    () => undefined
  );
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .slice()
    .reverse()
    .find(([channel]) => channel === 'site-developer-files')[1];
  const request = { action: 'list', path: '' };
  try {
    await expect(
      handler({ sender: { id: 99 }, senderFrame: mainFrame }, 'home', request)
    ).rejects.toThrow('Untrusted');
    await expect(
      handler({ sender, senderFrame: {} }, 'home', request)
    ).rejects.toThrow('Untrusted');
    await expect(
      handler({ sender, senderFrame: mainFrame }, 'home', {
        action: 'exec',
        path: '',
      })
    ).rejects.toThrow('Invalid');
    await expect(
      handler({ sender, senderFrame: mainFrame }, 'missing', request)
    ).rejects.toThrow('no longer available');
    (isGroupLocked as jest.Mock).mockReturnValue(true);
    await expect(
      handler({ sender, senderFrame: mainFrame }, 'home', request)
    ).rejects.toThrow('Unlock');
  } finally {
    dispose();
  }
  expect(ipcMain.removeHandler).toHaveBeenCalledWith('site-developer-files');
});

it('routes the folder context action into a new inbuilt terminal for the source group', async () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'folder-terminal-ipc-'))
  );
  fs.mkdirSync(path.join(root, 'src'));
  const folder = jest
    .spyOn(projects, 'linkedProjectFolder')
    .mockReturnValue(root);
  const mainFrame = {};
  const sender = {
    id: 99,
    mainFrame,
    on: jest.fn(),
    removeListener: jest.fn(),
    send: jest.fn(),
  };
  const dispose = registerSiteDeveloperLibrary(
    { webContents: sender, isDestroyed: () => false } as any,
    () => tabs,
    () => undefined
  );
  try {
    const handler = (ipcMain.handle as jest.Mock).mock.calls
      .slice()
      .reverse()
      .find(([channel]) => channel === 'site-developer-files')[1];
    const result = await handler({ sender, senderFrame: mainFrame }, 'home', {
      action: 'terminal-tab',
      path: 'src',
    });
    expect(result.path).toBe('src');
    expect(result.terminal).toMatchObject({ open: true, running: true });
    expect(result.terminal.tabs[result.terminal.tabs.length - 1].name).toBe(
      'src'
    );
    expect(spawn).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: path.join(root, 'src') })
    );
  } finally {
    dispose();
    folder.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('binds AI project access to a live unlocked source group and its linked folder', () => {
  const host = {
    webContents: {
      id: 71,
      on: jest.fn(),
      removeListener: jest.fn(),
      send: jest.fn(),
    },
    isDestroyed: () => false,
  } as any;
  let current = [...tabs];
  const folder = jest
    .spyOn(projects, 'linkedProjectFolder')
    .mockReturnValue('/tmp/project-one');
  const dispose = registerSiteDeveloperLibrary(
    host,
    () => current,
    () => undefined
  );
  try {
    const access = aiDeveloperProjectAccess(host, home.id);
    expect(access.folder).toBe('/tmp/project-one');
    expect(() => access.check()).not.toThrow();
    folder.mockReturnValue('/tmp/project-two');
    expect(() => access.check()).toThrow('access changed');
    folder.mockReturnValue('/tmp/project-one');
    (isGroupLocked as jest.Mock).mockReturnValue(true);
    expect(() => aiDeveloperProjectAccess(host, home.id)).toThrow('Unlock');
    (isGroupLocked as jest.Mock).mockReturnValue(false);
    current = current.filter((tab) => tab.id !== home.id);
    expect(() => access.check()).toThrow('no longer available');
    expect(() =>
      aiDeveloperProjectAccess({ webContents: { id: 999 } } as any, home.id)
    ).toThrow('unavailable');
  } finally {
    dispose();
    folder.mockRestore();
  }
});

it('waits for imported groups to reach layout sync before loading their project', async () => {
  const mainFrame = {};
  const sender = {
    id: 921,
    mainFrame,
    on: jest.fn(),
    removeListener: jest.fn(),
  };
  let synced: IApp[] = [];
  const project = jest.spyOn(projects, 'projectAction').mockResolvedValue({
    name: 'Project',
    path: '/tmp/project',
    available: true,
  });
  const dispose = registerSiteDeveloperLibrary(
    { webContents: sender, isDestroyed: () => false } as any,
    () => synced,
    () => undefined
  );
  const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([name]) => name === 'site-developer-project'
  )[1];
  try {
    const request = handler({ sender, senderFrame: mainFrame }, 'home', 'get');
    setTimeout(() => {
      synced = [home];
    }, 10);
    await expect(request).resolves.toMatchObject({ path: '/tmp/project' });
    expect(project).toHaveBeenCalled();
  } finally {
    dispose();
    project.mockRestore();
  }
});

it('tracks newly saved hooks before they have code or run', () => {
  (getSiteSettings as jest.Mock).mockReturnValue({
    developer: {
      enabled: false,
      before: '',
      after: '',
      css: '',
      hooks: [
        {
          id: 'new',
          name: 'New hook',
          enabled: true,
          path: '/*',
          before: '',
          after: '',
          css: '',
        },
      ],
    },
  });
  expect(developerPageSummaries(tabs, home, () => undefined)[0]).toMatchObject({
    hasHooks: true,
    enabled: false,
    status: 'waiting',
  });
});

it('starts a native file drag and rechecks group access after loading the icon', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'project-drag-'));
  const file = path.join(folder, 'resume #1.pdf');
  fs.writeFileSync(file, 'resume');
  const linked = jest
    .spyOn(projects, 'linkedProjectFolder')
    .mockReturnValue(folder);
  const mainFrame = {};
  const sender = {
    id: 91,
    mainFrame,
    on: jest.fn(),
    removeListener: jest.fn(),
    startDrag: jest.fn(),
  };
  const dispose = registerSiteDeveloperLibrary(
    { webContents: sender, isDestroyed: () => false } as any,
    () => tabs,
    () => undefined
  );
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .slice()
    .reverse()
    .find(([channel]) => channel === 'site-developer-files')[1];
  const event = { sender, senderFrame: mainFrame };
  const icon = {};
  try {
    (app.getFileIcon as jest.Mock).mockResolvedValue(icon);
    await handler(event, 'home', { action: 'drag', path: 'resume #1.pdf' });
    expect(sender.startDrag).toHaveBeenCalledWith({
      file: fs.realpathSync(file),
      icon,
    });
    sender.startDrag.mockClear();
    (app.getFileIcon as jest.Mock).mockImplementation(async () => {
      (isGroupLocked as jest.Mock).mockReturnValue(true);
      return icon;
    });
    await expect(
      handler(event, 'home', { action: 'drag', path: 'resume #1.pdf' })
    ).rejects.toThrow('Unlock');
    expect(sender.startDrag).not.toHaveBeenCalled();
  } finally {
    dispose();
    linked.mockRestore();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

it('discovers and imports project tasks by reviewed identity and rejects changed tasks', async () => {
  const folder = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'project-import-'))
  );
  const manifest = path.join(folder, 'package.json');
  fs.writeFileSync(manifest, JSON.stringify({ scripts: { test: 'vitest' } }));
  const linked = jest
    .spyOn(projects, 'linkedProjectFolder')
    .mockReturnValue(folder);
  const mainFrame = {};
  const sender = {
    id: 101,
    mainFrame,
    on: jest.fn(),
    removeListener: jest.fn(),
    send: jest.fn(),
  };
  const dispose = registerSiteDeveloperLibrary(
    { webContents: sender, isDestroyed: () => false } as any,
    () => tabs,
    () => undefined
  );
  const handler = (ipcMain.handle as jest.Mock).mock.calls
    .slice()
    .reverse()
    .find(([channel]) => channel === 'site-developer-scripts')[1];
  const event = { sender, senderFrame: mainFrame };
  try {
    const found = await handler(event, 'home', { action: 'discover' });
    expect(found.candidates).toHaveLength(1);
    expect(found.candidates[0].command).toBe('npm run test');
    const result = await handler(event, 'home', {
      action: 'import',
      ids: [found.candidates[0].id],
    });
    expect(result.imported).toBe(1);
    expect(sender.send).toHaveBeenCalledWith('site-developer-library-changed');
    const again = await handler(event, 'home', { action: 'discover' });
    expect(again.candidates[0].saved).toBe(true);
    fs.writeFileSync(manifest, '{"scripts":{}}');
    await expect(
      handler(event, 'home', {
        action: 'import',
        ids: [found.candidates[0].id],
      })
    ).rejects.toThrow('tasks changed');
  } finally {
    dispose();
    linked.mockRestore();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
