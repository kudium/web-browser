/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hookPanelState, panelStateRequest } from '../main/hookPanelState';
let mockRoot: string;
let mockAvailable = true;
jest.mock('electron', () => ({ app: { getPath: () => mockRoot } }));
jest.mock('../main/localStorage', () => ({
  safeStorage: {
    isEncryptionAvailable: () => mockAvailable,
    getSelectedStorageBackend: () => 'keychain',
    isFileAvailable: () => true,
    encryptString: (text: string) => Buffer.from(text).reverse(),
    decryptString: (data: Buffer) => Buffer.from(data).reverse().toString(),
  },
}));
const binding = {
  profile: 'profile',
  groupId: 'work',
  origin: 'https://example.com',
  hookId: 'reader',
};
beforeEach(() => {
  mockAvailable = true;
  mockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-state-test-'));
});
afterEach(() => fs.rmSync(mockRoot, { recursive: true, force: true }));
it('restores disk state and isolates hook, website, profile and group', () => {
  hookPanelState(binding, 'save', {
    id: 'progress',
    value: { query: 'chapter', position: 5 },
  });
  expect(hookPanelState({ ...binding }, 'load', { id: 'progress' })).toEqual({
    query: 'chapter',
    position: 5,
  });
  for (const patch of [
    { profile: 'other' },
    { groupId: 'other' },
    { origin: 'https://other.com' },
    { hookId: 'other' },
  ])
    expect(
      hookPanelState({ ...binding, ...patch }, 'load', { id: 'progress' }),
    ).toBeNull();
  hookPanelState(binding, 'clear', { id: 'progress' });
  expect(hookPanelState(binding, 'load', { id: 'progress' })).toBeNull();
});
it('enforces ids, byte limits, ten states and secure storage without changing prior values', () => {
  expect(() => panelStateRequest({ id: '../escape', value: {} })).toThrow();
  expect(() =>
    panelStateRequest({ id: 'state', value: '🙂'.repeat(9000) }),
  ).toThrow('32 KB');
  for (let i = 0; i < 10; i++)
    hookPanelState(binding, 'save', { id: 's' + i, value: i });
  expect(() =>
    hookPanelState(binding, 'save', { id: 'eleven', value: 11 }),
  ).toThrow('ten');
  expect(hookPanelState(binding, 'load', { id: 's0' })).toBe(0);
  mockAvailable = false;
  expect(() =>
    hookPanelState(binding, 'save', { id: 's0', value: 99 }),
  ).toThrow('unavailable');
  mockAvailable = true;
  expect(hookPanelState(binding, 'load', { id: 's0' })).toBe(0);
});
it('treats prototype-like state names as ordinary JSON keys', () => {
  expect(hookPanelState(binding, 'load', { id: 'constructor' })).toBeNull();
  hookPanelState(binding, 'save', {
    id: '__proto__',
    value: { name: 'ordinary' },
  });
  expect(hookPanelState(binding, 'load', { id: '__proto__' })).toEqual({
    name: 'ordinary',
  });
  expect(({} as any).name).toBeUndefined();
});
