/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ipcMain } from 'electron';
import { registerProjectFolderDrop } from '../main/projectFolderDrop';
import { projectAction } from '../main/developerProject';
import { isGroupLocked } from '../main/groupLocks';
import type { IApp } from '../types';

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
}));
jest.mock('../main/developerProject', () => ({
  projectAction: jest.fn(
    async (_host, _group, _action, ensureAccess, _editor, folder) => {
      ensureAccess();
      return { path: folder, name: path.basename(folder), available: true };
    }
  ),
}));
jest.mock('../main/groupLocks', () => ({ isGroupLocked: jest.fn() }));

test('links a real folder only for its trusted window and current unlocked group', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-folder-drop-'));
  const host = {
    webContents: { id: 27, mainFrame: {} },
    isDestroyed: () => false,
  };
  let tabs = [
    {
      id: 'tab',
      sessionId: 'group',
      sessionName: 'Work',
      name: 'Home',
      url: 'about:blank',
      icon: '',
      spaceId: 'default',
    },
  ] as IApp[];
  const linked = jest.fn();
  const off = registerProjectFolderDrop(host as never, () => tabs, linked);
  const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([channel]) => channel === 'project-folder-drop'
  )![1];
  const event = {
    sender: host.webContents,
    senderFrame: host.webContents.mainFrame,
  };
  try {
    expect(await handler(event, 'tab', root)).toMatchObject({
      path: fs.realpathSync(root),
      available: true,
    });
    expect(projectAction).toHaveBeenCalledWith(
      host,
      JSON.stringify(['group', 'default']),
      'link',
      expect.any(Function),
      undefined,
      fs.realpathSync(root),
      expect.objectContaining({ name: 'Work' })
    );
    expect(linked).toHaveBeenCalledTimes(1);
    expect(() => handler({ ...event, senderFrame: {} }, 'tab', root)).toThrow(
      'Untrusted'
    );
    expect(() =>
      handler({ ...event, sender: { id: 99 } }, 'tab', root)
    ).toThrow('Untrusted');
    expect(() => handler(event, 'tab', 'relative')).toThrow(
      'local project folder'
    );
    fs.writeFileSync(path.join(root, 'file.txt'), 'text');
    await expect(
      handler(event, 'tab', path.join(root, 'file.txt'))
    ).rejects.toThrow('Drop a folder');
    (isGroupLocked as jest.Mock).mockReturnValue(true);
    await expect(handler(event, 'tab', root)).rejects.toThrow('Unlock');
    (isGroupLocked as jest.Mock).mockReturnValue(false);
    const realpath = jest
      .spyOn(fs.promises, 'realpath')
      .mockImplementationOnce(async () => {
        tabs = [];
        return root;
      });
    await expect(handler(event, 'tab', root)).rejects.toThrow(
      'no longer available'
    );
    realpath.mockRestore();
    expect(projectAction).toHaveBeenCalledTimes(1);
  } finally {
    off();
    fs.rmSync(root, { recursive: true, force: true });
  }
  expect(ipcMain.removeHandler).toHaveBeenCalledWith('project-folder-drop');
});
