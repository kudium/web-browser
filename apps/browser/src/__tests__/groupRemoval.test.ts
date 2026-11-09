import { app, BrowserWindow, ipcMain, session } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { registerGroupRemoval } from '../main/groupRemoval';
import { showBrowserDialog } from '../main/dialogs';
import {
  passwordVault,
  authenticatePersonalData,
  withPersonalData,
} from '../main/passwordManager';
import { isGroupLocked } from '../main/groupLocks';
import { removeSiteProfile } from '../main/siteSettings';
import type { IApp } from '../types';

jest.mock('electron', () => ({
  app: { getPath: jest.fn() },
  BrowserWindow: { fromWebContents: jest.fn() },
  ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
  session: { fromPartition: jest.fn() },
}));
jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
jest.mock('../main/groupLocks', () => ({
  isGroupLocked: jest.fn(() => false),
}));
jest.mock('../main/history', () => ({ removeProfileHistory: jest.fn() }));
jest.mock('../main/siteSettings', () => ({ removeSiteProfile: jest.fn() }));
jest.mock('../main/passwordManager', () => ({
  passwordVault: jest.fn(() => ({
    status: () => ({ initialized: false }),
    removeOrdinaryNoteScope: jest.fn(),
  })),
  authenticatePersonalData: jest.fn(),
  withPersonalData: jest.fn(),
  personalDataRevision: () => 0,
}));
const source: IApp = {
  id: 'one',
  name: 'Work',
  sessionName: 'Work',
  sessionId: 'work',
  spaceId: 'default',
  url: 'https://example.com',
  icon: '',
};
function fixture(apps: IApp[] = [source]) {
  const frame = {};
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    getURL: () => 'file:///fixture.html',
    isDestroyed: () => false,
    send: jest.fn(),
    executeJavaScript: jest.fn(async () => apps),
  });
  const owner = {
    webContents: contents,
    isDestroyed: () => false,
  } as unknown as BrowserWindow;
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(owner);
  const clear = {
    clearStorageData: jest.fn(async () => {}),
    clearCache: jest.fn(async () => {}),
    clearAuthCache: jest.fn(async () => {}),
    closeAllConnections: jest.fn(async () => {}),
  };
  (session.fromPartition as jest.Mock).mockReturnValue(clear);
  const unloaded = jest.fn(() => true);
  const dispose = registerGroupRemoval(
    owner,
    () => source,
    unloaded,
    () => true
  );
  const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([name]) => name === 'browser-remove-group'
  )[1];
  return {
    run: (sender = contents, senderFrame = frame) =>
      handler({ sender, senderFrame }, 'one'),
    choose: () =>
      handler({ sender: contents, senderFrame: frame }, 'one', true),
    clear,
    unloaded,
    dispose,
    contents,
  };
}
let temporary: string;
beforeEach(() => {
  temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-removal-test-')
  );
  (app.getPath as jest.Mock).mockReturnValue(temporary);
  jest.clearAllMocks();
  (isGroupLocked as jest.Mock).mockReturnValue(false);
  (passwordVault as jest.Mock).mockReturnValue({
    status: () => ({ initialized: false }),
    removeOrdinaryNoteScope: jest.fn(),
  });
});
afterEach(() => fs.rmSync(temporary, { recursive: true, force: true }));
it('cancellation leaves the group session and settings intact', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 0 });
  const f = fixture();
  try {
    expect(await f.run()).toEqual({ removed: false });
    expect(f.clear.clearStorageData).not.toHaveBeenCalled();
    expect(removeSiteProfile).not.toHaveBeenCalled();
    expect(showBrowserDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultId: 0, cancelId: 0 })
    );
  } finally {
    f.dispose();
  }
});
it('deletes the unique profile only after explicit confirmation', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 1 });
  const f = fixture();
  try {
    expect(await f.run()).toEqual({ removed: true, ids: ['one'] });
    expect(session.fromPartition).toHaveBeenCalledWith(
      'persist:kudiumbrowser-work'
    );
    expect(f.clear.clearStorageData).toHaveBeenCalledTimes(1);
    expect(f.clear.clearCache).toHaveBeenCalledTimes(1);
    expect(removeSiteProfile).toHaveBeenCalledWith('work');
  } finally {
    f.dispose();
  }
});
it('preserves a profile referenced by another group, including archived groups', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 1 });
  const f = fixture([
    source,
    {
      ...source,
      id: 'other',
      sessionId: 'other',
      sessionProfileId: 'work',
      archived: true,
    },
  ]);
  try {
    expect(await f.run()).toEqual({ removed: true, ids: ['one'] });
    expect(f.clear.clearStorageData).not.toHaveBeenCalled();
    expect(removeSiteProfile).not.toHaveBeenCalled();
    expect((showBrowserDialog as jest.Mock).mock.calls[0][1].detail).toContain(
      'Shared and browser-wide data will be kept'
    );
  } finally {
    f.dispose();
  }
});
it('rejects active groups and forged callers before showing confirmation', async () => {
  const f = fixture();
  try {
    f.unloaded.mockReturnValue(false);
    await expect(f.run()).rejects.toThrow('Unload');
    await expect(f.run({} as typeof f.contents)).rejects.toThrow('Untrusted');
    expect(showBrowserDialog).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});
it('rechecks unloading and locks after confirmation before deleting data', async () => {
  const f = fixture();
  try {
    (showBrowserDialog as jest.Mock).mockImplementation(async () => {
      f.unloaded.mockReturnValue(false);
      return { response: 1 };
    });
    await expect(f.run()).rejects.toThrow('Unload');
    expect(f.clear.clearStorageData).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});
it('does not report removal when session cleanup fails', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 1 });
  const f = fixture();
  try {
    f.clear.clearStorageData.mockRejectedValueOnce(new Error('Disk failure'));
    await expect(f.run()).rejects.toThrow('Disk failure');
    expect(removeSiteProfile).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it('removes group-local Personal Data after confirmation without authentication', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 1 });
  (passwordVault as jest.Mock).mockReturnValue({
    status: () => ({ initialized: true }),
    removeOrdinaryNoteScope: jest.fn(),
  });
  const remove = jest.fn();
  (withPersonalData as jest.Mock).mockImplementation((work) =>
    work({ removeScope: remove })
  );
  const f = fixture();
  try {
    expect(await f.run()).toEqual({ removed: true, ids: ['one'] });
    expect(authenticatePersonalData).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('group:work', 'delete');
  } finally {
    f.dispose();
  }
});
it('confirmation cancellation preserves the session and local Personal Data', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 0 });
  (passwordVault as jest.Mock).mockReturnValue({
    status: () => ({ initialized: true }),
    removeOrdinaryNoteScope: jest.fn(),
  });
  const f = fixture();
  try {
    expect(await f.run()).toEqual({ removed: false });
    expect(authenticatePersonalData).not.toHaveBeenCalled();
    expect(withPersonalData).not.toHaveBeenCalled();
    expect(f.clear.clearStorageData).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it('rejects a group that becomes locked during confirmation', async () => {
  const f = fixture();
  try {
    (showBrowserDialog as jest.Mock).mockImplementation(async () => {
      (isGroupLocked as jest.Mock).mockReturnValue(true);
      return { response: 1 };
    });
    await expect(f.run()).rejects.toThrow('Unload');
    expect(f.clear.clearStorageData).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it('removes a blank group without asking for confirmation', async () => {
  const f = fixture([{ ...source, url: 'about:blank' }]);
  try {
    expect(await f.run()).toEqual({ removed: true, ids: ['one'] });
    expect(showBrowserDialog).not.toHaveBeenCalled();
    expect(f.clear.clearStorageData).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});

it('offers Cancel, Archive and Delete in one dialog and does not delete when Archive is chosen', async () => {
  const f = fixture();
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 1 });
  try {
    await expect(f.choose()).resolves.toEqual({
      removed: false,
      archive: true,
    });
    expect(showBrowserDialog).toHaveBeenCalledTimes(1);
    expect(showBrowserDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        buttons: ['Cancel', 'Archive', 'Delete'],
        cancelId: 0,
        defaultId: 0,
      })
    );
    expect(f.clear.clearStorageData).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});
