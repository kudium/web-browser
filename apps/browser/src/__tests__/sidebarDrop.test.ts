/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ipcMain } from 'electron';
import { inspectSidebarPath, registerSidebarDrop } from '../main/sidebarDrop';
import { linkProjectFolder } from '../main/developerProject';

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
}));
jest.mock('../main/developerProject', () => ({ linkProjectFolder: jest.fn() }));
let root: string;
beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sidebar-drop-'))
  );
  jest.clearAllMocks();
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
it('recognizes exported groups even when renamed, and proposes containing folders for ordinary files', async () => {
  const group = path.join(root, 'renamed.json');
  fs.writeFileSync(group, JSON.stringify({ format: 'kudiumbrowser-group' }));
  expect(await inspectSidebarPath(group)).toMatchObject({
    kind: 'import',
    file: group,
  });
  const ordinary = path.join(root, 'package.json');
  fs.writeFileSync(ordinary, '{"scripts":{}}');
  expect(await inspectSidebarPath(ordinary)).toMatchObject({
    kind: 'project',
    folder: root,
    fileName: 'package.json',
  });
  expect(await inspectSidebarPath(root)).toMatchObject({
    kind: 'project',
    folder: root,
  });
  const invalid = path.join(root, 'broken.kudiumbrowser-group.json');
  fs.writeFileSync(invalid, 'invalid');
  expect(await inspectSidebarPath(invalid)).toMatchObject({ kind: 'import' });
});
it('uses the reviewed import flow and creates a project only after explicit submission', async () => {
  const host = {
    webContents: { id: 8, mainFrame: {} },
    isDestroyed: () => false,
  };
  const existing = [
    {
      id: 'old',
      sessionId: 'old',
      name: 'Old',
      sessionSlug: 'taken',
      spaceId: 'space',
      url: 'about:blank',
      icon: '',
    },
  ];
  const importFile = jest.fn(async () => null);
  const cleanup = registerSidebarDrop(
    host as never,
    () => existing,
    importFile
  );
  const invoke = (channel: string, ...args: unknown[]) =>
    (ipcMain.handle as jest.Mock).mock.calls.find(
      ([name]) => name === channel
    )![1](
      { sender: host.webContents, senderFrame: host.webContents.mainFrame },
      ...args
    );
  try {
    const file = path.join(root, 'group.kudiumbrowser-group.json');
    fs.writeFileSync(file, '{}');
    expect(await invoke('sidebar-drop', file, 'space')).toEqual({
      kind: 'import',
      imported: null,
    });
    expect(importFile).toHaveBeenCalledWith('space', file);
    const proposal = await invoke('sidebar-drop', root, 'space');
    expect(linkProjectFolder).not.toHaveBeenCalled();
    await expect(
      invoke('sidebar-drop-create', {
        token: 'fake',
        name: 'Project',
        slug: 'project',
      })
    ).rejects.toThrow('again');
    await expect(
      invoke('sidebar-drop-create', {
        token: proposal.token,
        name: 'Project',
        slug: 'taken',
      })
    ).rejects.toThrow('already used');
    const result = await invoke('sidebar-drop-create', {
      token: proposal.token,
      name: 'My project',
      slug: 'my-project',
    });
    expect(result.tab).toMatchObject({
      sessionName: 'My project',
      sessionSlug: 'my-project',
      spaceId: 'space',
      url: 'about:blank',
    });
    expect(linkProjectFolder).toHaveBeenCalledWith(expect.any(String), root, {
      name: 'My project',
      slug: 'my-project',
    });
    await expect(
      invoke('sidebar-drop-create', {
        token: proposal.token,
        name: 'My project',
        slug: 'my-project',
      })
    ).rejects.toThrow('again');
  } finally {
    cleanup();
  }
});
it('rejects requests from an untrusted frame', () => {
  const host = {
    webContents: { id: 9, mainFrame: {} },
    isDestroyed: () => false,
  };
  const cleanup = registerSidebarDrop(
    host as never,
    () => [],
    async () => null
  );
  try {
    const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([name]) => name === 'sidebar-drop'
    )![1];
    expect(() =>
      handler({ sender: host.webContents, senderFrame: {} }, root, 'space')
    ).toThrow('Untrusted');
  } finally {
    cleanup();
  }
});
it('cleans up after the window and its webContents are destroyed', () => {
  let destroyed = false;
  const host = {
    get webContents() {
      if (destroyed) throw new TypeError('Object has been destroyed');
      return { id: 10, mainFrame: {} };
    },
    isDestroyed: () => destroyed,
  };
  const cleanup = registerSidebarDrop(
    host as never,
    () => [],
    async () => null
  );
  destroyed = true;
  expect(cleanup).not.toThrow();
  expect(cleanup).not.toThrow();
  expect(ipcMain.removeHandler).toHaveBeenCalledWith('sidebar-drop');
  expect(ipcMain.removeHandler).toHaveBeenCalledWith('sidebar-drop-create');
});
it('links a reviewed imported group to the containing directory of its dropped export', async () => {
  const host = {
    webContents: { id: 81, mainFrame: {} },
    isDestroyed: () => false,
  };
  const tab = {
    id: 'imported',
    sessionId: 'imported-profile',
    spaceId: 'space',
    name: 'Website',
    sessionName: 'Website',
    sessionSlug: 'website',
    url: 'https://example.com',
    icon: '',
  };
  const importFile = jest
    .fn()
    .mockResolvedValue({ tabs: [tab], reviewHooks: true });
  const cleanup = registerSidebarDrop(host as never, () => [], importFile);
  try {
    const file = path.join(root, 'website.kudiumbrowser-group.json');
    fs.writeFileSync(file, '{}');
    const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
      ([channel]) => channel === 'sidebar-drop'
    )![1];
    const result = await handler(
      { sender: host.webContents, senderFrame: host.webContents.mainFrame },
      file,
      'space'
    );
    expect(result.imported.reviewHooks).toBe(true);
    expect(linkProjectFolder).toHaveBeenCalledWith(
      JSON.stringify(['imported-profile', 'space']),
      root,
      { name: 'Website', slug: 'website' }
    );
  } finally {
    cleanup();
  }
});
