import { ipcMain } from 'electron';
import { scopedAIIPC } from '../main/aiIpc';
import { markPrivateSession } from '../main/privateSessions';

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
}));

it('routes simultaneous regular and private requests and tears down only their owner', () => {
  const first = {} as any;
  const second = {} as any;
  markPrivateSession(first);
  markPrivateSession(second);
  const regular = scopedAIIPC();
  const privateA = scopedAIIPC(first);
  const privateB = scopedAIIPC(second);
  regular.handle('test-ai', () => 'regular');
  privateA.handle('test-ai', () => 'private A');
  privateB.handle('test-ai', () => 'private B');
  const invoke = (ipcMain.handle as jest.Mock).mock.calls[0][1];
  const event = (session: unknown) => ({ sender: { session } });
  expect(invoke(event({}))).toBe('regular');
  expect(invoke(event(first))).toBe('private A');
  expect(invoke(event(second))).toBe('private B');
  privateA.dispose();
  expect(() => invoke(event(first))).toThrow('no longer available');
  expect(invoke(event({}))).toBe('regular');
  expect(invoke(event(second))).toBe('private B');
  regular.dispose();
  expect(invoke(event(second))).toBe('private B');
  privateB.dispose();
  expect(ipcMain.removeHandler).toHaveBeenCalledWith('test-ai');
});
