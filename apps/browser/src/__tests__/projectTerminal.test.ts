/** @jest-environment node */
import { spawn } from 'node-pty';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ProjectTerminals,
  validTerminalRequest,
} from '../main/projectTerminal';

jest.mock('node-pty', () => ({ spawn: jest.fn() }));
const send = jest.fn();
const host = { isDestroyed: () => false, webContents: { send } } as any;
let data: (value: string) => void;
let exit: (value: { exitCode: number }) => void;
const pty = {
  write: jest.fn(),
  resize: jest.fn(),
  kill: jest.fn(),
  onData: jest.fn((callback) => {
    data = callback;
  }),
  onExit: jest.fn((callback) => {
    exit = callback;
  }),
};
beforeEach(() => {
  jest.clearAllMocks();
  (spawn as jest.Mock).mockReturnValue(pty);
});
it('starts in the linked folder, keeps a group session, streams bounded output and forwards input and size', () => {
  const folder = process.cwd();
  const terminals = new ProjectTerminals(host, () => folder);
  terminals.request('group', { action: 'open', cols: 80, rows: 24 });
  expect(spawn).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Array),
    expect.objectContaining({ cwd: folder, cols: 80, rows: 24 })
  );
  data('hello');
  expect(send).toHaveBeenCalledWith('site-developer-terminal-data', {
    group: 'group',
    tab: expect.any(String),
    data: 'hello',
    sequence: 1,
  });
  expect(
    terminals.request('group', { action: 'open', cols: 80, rows: 24 })
  ).toMatchObject({ data: 'hello', running: true });
  expect(spawn).toHaveBeenCalledTimes(1);
  terminals.request('group', { action: 'write', data: '\x03' });
  expect(pty.write).toHaveBeenCalledWith('\x03');
  terminals.request('group', { action: 'resize', cols: 40, rows: 12 });
  expect(pty.resize).toHaveBeenCalledWith(40, 12);
  data('x'.repeat(200000));
  expect(
    terminals.request('group', { action: 'open', cols: 40, rows: 12 }).data
      .length
  ).toBe(128 * 1024);
  exit({ exitCode: 2 });
  expect(send).toHaveBeenLastCalledWith(
    'site-developer-terminal-data',
    expect.objectContaining({ exitCode: 2 })
  );
  terminals.dispose();
});
it('terminates the session when access is revoked or the project changes', () => {
  let folder = process.cwd();
  let locked = false;
  const terminals = new ProjectTerminals(host, () => {
    if (locked) throw new Error('Locked');
    return folder;
  });
  terminals.request('group', { action: 'open', cols: 80, rows: 24 });
  locked = true;
  terminals.prune();
  expect(pty.kill).toHaveBeenCalledTimes(1);
  expect(() =>
    terminals.request('group', { action: 'write', data: 'pwd\r' })
  ).toThrow('Locked');
  locked = false;
  terminals.request('group', { action: 'open', cols: 80, rows: 24 });
  folder = '/other';
  terminals.prune();
  expect(pty.kill).toHaveBeenCalledTimes(2);
  terminals.dispose();
});
it('rejects malformed sizes, oversized input and arbitrary actions', () => {
  expect(validTerminalRequest({ action: 'open', cols: 0, rows: 10 })).toBe(
    false
  );
  expect(validTerminalRequest({ action: 'resize', cols: 50.5, rows: 10 })).toBe(
    false
  );
  expect(
    validTerminalRequest({ action: 'write', data: 'x'.repeat(65537) })
  ).toBe(false);
  expect(validTerminalRequest({ action: 'exec', command: 'pwd' })).toBe(false);
  expect(validTerminalRequest({ action: 'write', data: '\x03' })).toBe(true);
});

it('keeps independent renamed tabs and processes across selection, hiding and host reconnection', () => {
  const manager = new ProjectTerminals(host, () => process.cwd());
  const first = manager.request('one', { action: 'open', cols: 80, rows: 24 });
  const firstId = first.selected;
  const firstData = data;
  const second = manager.request('one', { action: 'create' });
  const secondId = second.selected;
  firstData('first output');
  data('second output');
  manager.request('one', { action: 'rename', tab: firstId, name: 'Server' });
  manager.request('one', { action: 'select', tab: firstId });
  manager.request('one', { action: 'preferences', open: false, height: 310 });
  manager.request('two', { action: 'create' });
  manager.detachHost(host);
  expect(pty.kill).not.toHaveBeenCalled();
  manager.attachHost(host);
  const restored = manager.request('one', {
    action: 'attach',
    tab: firstId,
    cols: 80,
    rows: 24,
  });
  expect(restored).toMatchObject({
    data: 'first output',
    open: false,
    height: 310,
    selected: firstId,
  });
  expect(restored.tabs.map((tab) => tab.name)).toEqual(['Server', 'Shell 2']);
  expect(
    manager.request('one', {
      action: 'attach',
      tab: secondId,
      cols: 80,
      rows: 24,
    }).data
  ).toBe('second output');
  expect(spawn).toHaveBeenCalledTimes(3);
  manager.request('one', { action: 'remove', tab: firstId });
  expect(pty.kill).toHaveBeenCalledTimes(1);
  expect(manager.request('one', { action: 'list' }).tabs).toHaveLength(1);
  const replacement = manager.request('one', { action: 'create' });
  expect(new Set(replacement.tabs.map((tab) => tab.name)).size).toBe(2);
  manager.dispose();
});
it('restores group visibility, size, tab names, selection and output after app restart without rerunning commands', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-test-'));
  const filename = path.join(directory, 'terminals.json');
  try {
    const manager = new ProjectTerminals(host, () => process.cwd(), filename);
    const first = manager.request('group', { action: 'create' });
    data('saved output');
    manager.request('group', {
      action: 'rename',
      tab: first.selected,
      name: 'Dev server',
    });
    manager.request('group', {
      action: 'preferences',
      open: true,
      height: 280,
    });
    manager.dispose();
    const next = new ProjectTerminals(host, () => process.cwd(), filename);
    const restored = next.request('group', { action: 'list' });
    expect(restored).toMatchObject({
      open: true,
      height: 280,
      selected: first.selected,
      tabs: [{ name: 'Dev server', restored: true, running: false }],
    });
    expect(
      next.request('group', {
        action: 'attach',
        tab: first.selected,
        cols: 80,
        rows: 24,
      }).data
    ).toContain('saved output');
    expect(spawn).toHaveBeenCalledTimes(1);
    next.request('group', {
      action: 'restart',
      tab: first.selected,
      cols: 80,
      rows: 24,
    });
    expect(spawn).toHaveBeenCalledTimes(2);
    next.request('group', { action: 'preferences', open: false });
    next.dispose();
    const hidden = new ProjectTerminals(host, () => process.cwd(), filename);
    expect(hidden.request('group', { action: 'list' }).open).toBe(false);
    hidden.dispose();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
it('validates rename, tab identity and persisted panel preferences', () => {
  expect(
    validTerminalRequest({ action: 'rename', tab: 'id', name: 'Server' })
  ).toBe(true);
  expect(
    validTerminalRequest({ action: 'rename', tab: 'id', name: '  ' })
  ).toBe(false);
  expect(
    validTerminalRequest({ action: 'rename', tab: 'id', name: 'a\nb' })
  ).toBe(false);
  expect(validTerminalRequest({ action: 'select', tab: {} })).toBe(false);
  expect(
    validTerminalRequest({ action: 'preferences', height: Infinity })
  ).toBe(false);
  expect(validTerminalRequest({ action: 'preferences', open: 'yes' })).toBe(
    false
  );
});
it('keeps stopped tabs stopped on attach and preserves settings when locking a group', () => {
  const manager = new ProjectTerminals(host, () => process.cwd());
  const created = manager.request('group', { action: 'create' });
  manager.request('group', { action: 'preferences', height: 260, open: true });
  manager.stopGroup('group');
  const attached = manager.request('group', {
    action: 'attach',
    tab: created.selected,
    cols: 80,
    rows: 24,
  });
  expect(attached).toMatchObject({ running: false, height: 260, open: true });
  expect(spawn).toHaveBeenCalledTimes(1);
  manager.prune(new Set());
  expect(manager.request('group', { action: 'list' }).tabs).toHaveLength(0);
  manager.dispose();
});
it('runs a saved command in a new named terminal without writing into an existing running session', () => {
  const manager = new ProjectTerminals(host, () => process.cwd());
  const original = manager.request('group', { action: 'create' });
  const result = manager.runCommand('group', 'Dev server', 'npm run dev');
  expect(result.tabs).toHaveLength(2);
  expect(result.selected).not.toBe(original.selected);
  expect(result.tabs[1].name).toBe('Dev server');
  expect(result.open).toBe(true);
  expect(pty.write).toHaveBeenCalledWith('npm run dev\r');
  manager.dispose();
});

it('creates a new shell in a selected project subfolder and keeps streaming from it', () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-cwd-'))
  );
  const child = path.join(root, 'src');
  fs.mkdirSync(child);
  const terminals = new ProjectTerminals(host, () => root);
  try {
    const first = terminals.request('group', { action: 'create' });
    const next = terminals.request('group', { action: 'create', cwd: 'src' });
    expect(next.tabs).toHaveLength(2);
    expect(next.selected).not.toBe(first.selected);
    expect(next.tabs.find((tab) => tab.id === next.selected)?.name).toBe('src');
    expect(spawn).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: child })
    );
    data('still running');
    expect(
      terminals.request('group', {
        action: 'attach',
        tab: next.selected,
        cols: 80,
        rows: 24,
      }).data
    ).toBe('still running');
    expect(terminals.request('group', { action: 'list' }).running).toBe(true);
    terminals.request('group', {
      action: 'restart',
      tab: next.selected,
      cols: 80,
      rows: 24,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: child })
    );
  } finally {
    terminals.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('rejects terminal working directories outside the project, including symlinks', () => {
  const fixture = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-boundary-'))
  );
  const root = path.join(fixture, 'project');
  fs.mkdirSync(root);
  fs.symlinkSync(fixture, path.join(root, 'escape'));
  const terminals = new ProjectTerminals(host, () => root);
  try {
    ['..', 'escape', fixture].forEach((cwd) => {
      expect(() =>
        terminals.request('group', { action: 'create', cwd })
      ).toThrow('inside the linked project');
    });
    expect(spawn).not.toHaveBeenCalled();
    expect(validTerminalRequest({ action: 'create', cwd: '\0' })).toBe(false);
    expect(validTerminalRequest({ action: 'create', cwd: 'src' })).toBe(true);
  } finally {
    terminals.dispose();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

it('reads a stopped terminal output without restarting its shell', () => {
  const terminals = new ProjectTerminals(host, () => process.cwd());
  const state = terminals.request('group', {
    action: 'open',
    cols: 80,
    rows: 24,
  });
  data('finished output');
  exit({ exitCode: 0 });
  expect(validTerminalRequest({ action: 'read', tab: state.selected })).toBe(
    true
  );
  expect(
    terminals.request('group', { action: 'read', tab: state.selected })
  ).toMatchObject({
    data: expect.stringContaining('finished output'),
    running: false,
  });
  expect(spawn).toHaveBeenCalledTimes(1);
  terminals.dispose();
});

it('opens a fresh shell over stopped output without replaying previous commands', () => {
  const terminals = new ProjectTerminals(host, () => process.cwd());
  const state = terminals.request('group', { action: 'create' });
  data('previous command output');
  exit({ exitCode: 0 });
  const opened = terminals.request('group', {
    action: 'open',
    tab: state.selected,
    cols: 100,
    rows: 30,
  });
  expect(opened.running).toBe(true);
  expect(opened.data).toContain('previous command output');
  expect(spawn).toHaveBeenCalledTimes(2);
  expect(pty.write).not.toHaveBeenCalled();
  terminals.dispose();
});

it('reconnects on input after a shell stops and forwards only the new input', () => {
  const terminals = new ProjectTerminals(host, () => process.cwd());
  const state = terminals.request('group', { action: 'create' });
  terminals.request('group', { action: 'close', tab: state.selected });
  const resumed = terminals.request('group', {
    action: 'write',
    tab: state.selected,
    data: '\x03',
  });
  expect(resumed.running).toBe(true);
  expect(spawn).toHaveBeenCalledTimes(2);
  expect(pty.write).toHaveBeenCalledWith('\x03');
  terminals.dispose();
});
