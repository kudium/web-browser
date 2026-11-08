import {
  defaultShortcuts,
  matchShortcut,
  validateShortcuts,
  bindingFromInput,
  exportShortcuts,
  importShortcuts,
} from '../browser/shortcuts';
import { moveGroupToFolder, removeGroupFolder } from '../utils/sessionFolders';
import { IApp } from '../types';

it('matches shifted brackets, respects exact modifiers and platform-specific Mod', () => {
  expect(
    matchShortcut(
      { key: '{', code: 'BracketLeft', meta: true, shift: true },
      defaultShortcuts,
      true
    )
  ).toBe('back');
  expect(
    matchShortcut(
      { key: '}', code: 'BracketRight', meta: true, shift: true },
      defaultShortcuts,
      true
    )
  ).toBe('forward');
  expect(
    matchShortcut({ key: '[', control: true }, defaultShortcuts, false)
  ).toBe('back');
  expect(
    matchShortcut({ key: '[', control: true }, defaultShortcuts, true)
  ).toBeUndefined();
  expect(
    matchShortcut({ key: 'r', meta: true, alt: true }, defaultShortcuts, true)
  ).toBeUndefined();
  expect(matchShortcut({ key: 'r' }, defaultShortcuts, true)).toBeUndefined();
  expect(
    bindingFromInput({ key: 'Tab', control: true, shift: true }, true)
  ).toBe('Control+Shift+Tab');
});
it('rejects conflicting, reserved, malformed and duplicate-modifier shortcuts', () => {
  expect(validateShortcuts(defaultShortcuts)).toEqual(defaultShortcuts);
  expect(validateShortcuts(defaultShortcuts, false)).toEqual(defaultShortcuts);
  expect(() =>
    validateShortcuts({ ...defaultShortcuts, back: ['Mod+KeyR'] })
  ).toThrow('already assigned');
  expect(() =>
    validateShortcuts({ ...defaultShortcuts, back: ['Mod+KeyQ'] })
  ).toThrow('reserved');
  expect(() =>
    validateShortcuts({ ...defaultShortcuts, back: ['KeyB'] })
  ).toThrow('Use Command');
  expect(() =>
    validateShortcuts({ ...defaultShortcuts, back: ['Mod+Meta+KeyB'] })
  ).toThrow('Duplicate modifier');
  const saved = validateShortcuts({
    ...defaultShortcuts,
    back: ['Alt+KeyB'],
    forward: [],
  });
  expect(matchShortcut({ key: 'b', alt: true }, saved, true)).toBe('back');
  expect(matchShortcut({ key: ']', meta: true }, saved, true)).toBeUndefined();
});
it('moves whole groups from their source space while preserving cookie partitions', () => {
  const apps = [
    {
      id: 'one',
      sessionId: 'account',
      spaceId: 'work',
      folderId: 'old',
      favorite: true,
    },
    { id: 'two', sessionId: 'account', spaceId: 'work', archived: true },
    {
      id: 'other-space',
      sessionId: 'account',
      spaceId: 'other',
      folderId: 'old',
    },
    { id: 'other-account', sessionId: 'separate', spaceId: 'work' },
  ].map((item) => ({
    name: item.id,
    url: 'https://example.com',
    icon: '',
    ...item,
  })) as IApp[];
  const moved = moveGroupToFolder(apps, apps[0], 'personal', 'folder');
  expect(
    moved
      .slice(0, 2)
      .map((item) => [
        item.spaceId,
        item.folderId,
        item.sessionId,
        item.favorite,
      ])
  ).toEqual([
    ['personal', 'folder', 'account', false],
    ['personal', 'folder', 'account', false],
  ]);
  expect(moved[2]).toBe(apps[2]);
  expect(moved[3]).toBe(apps[3]);
  const removed = removeGroupFolder(moved, 'personal', 'folder');
  expect(removed.length).toBe(apps.length);
  expect(removed[0].folderId).toBeUndefined();
  expect(removed[2].folderId).toBe('old');
});

it('round trips complete portable snapshots and rejects damaged or conflicting imports', () => {
  const custom = { ...defaultShortcuts, back: ['Alt+KeyB'], forward: [] };
  const file = exportShortcuts(custom);
  expect(importShortcuts(file)).toEqual(custom);
  expect(importShortcuts(file, false)).toEqual(custom);
  const document = JSON.parse(file);
  expect(() => importShortcuts('{')).toThrow('valid');
  expect(() => importShortcuts(' '.repeat(65537))).toThrow('too large');
  expect(() =>
    importShortcuts(JSON.stringify({ ...document, version: 2 }))
  ).toThrow('Unsupported');
  delete document.bindings.back;
  expect(() => importShortcuts(JSON.stringify(document))).toThrow(
    'missing actions'
  );
  document.bindings.back = ['Mod+KeyR'];
  expect(() => importShortcuts(JSON.stringify(document))).toThrow(
    'already assigned'
  );
  document.bindings.back = ['Mod+KeyQ'];
  expect(() => importShortcuts(JSON.stringify(document))).toThrow('reserved');
  document.bindings.back = [];
  document.bindings.unknown = [];
  expect(() => importShortcuts(JSON.stringify(document))).toThrow('Invalid');
  expect(defaultShortcuts.back).toEqual([
    'Mod+BracketLeft',
    'Mod+Shift+BracketLeft',
  ]);
});
