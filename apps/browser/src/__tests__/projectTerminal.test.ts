/** @jest-environment node */
import { spawn } from 'node-pty';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
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
it('restores portable terminal definitions without spawning or replaying commands', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'portable-terminals-')));
  fs.mkdirSync(path.join(root, 'web'));
  fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
  const terminals = new ProjectTerminals(host, () => root);
  try {
    terminals.restoreDefinitions('group', [
      { name: 'Web', cwd: 'web' },
      { name: 'Missing', cwd: 'deleted' },
      { name: 'Outside', cwd: 'outside' },
    ]);
    expect(spawn).not.toHaveBeenCalled();
    expect(terminals.definitions('group')).toEqual([
      { name: 'Web', cwd: 'web' }, { name: 'Missing', cwd: '.' }, { name: 'Outside', cwd: '.' },
    ]);
    terminals.restoreDefinitions('group', [{ name: 'Web', cwd: 'web' }]);
    const state = terminals.request('group', { action: 'list' });
    expect(state.tabs).toHaveLength(3);
    expect(state.tabs.every((tab) => tab.restored && !tab.running)).toBe(true);
    terminals.request('group', { action: 'open', tab: state.tabs[0].id, cols: 80, rows: 24 });
    expect(spawn).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.objectContaining({ cwd: path.join(root, 'web') }));
  } finally { terminals.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});
it('retains duplicate terminal names across imports and restores edited directories for stopped tabs', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'portable-terminal-names-')));
  fs.mkdirSync(path.join(root, 'web'));
  const terminals = new ProjectTerminals(host, () => root);
  try {
    const definitions = [{ name: 'Shell', cwd: '.' }, { name: 'Shell', cwd: 'web' }];
    terminals.restoreDefinitions('group', definitions);
    terminals.restoreDefinitions('group', definitions);
    expect(terminals.definitions('group')).toEqual(definitions);
    terminals.restoreDefinitions('group', [{ name: 'Shell', cwd: 'web' }, { name: 'Shell', cwd: '.' }]);
    expect(terminals.definitions('group')).toEqual([{ name: 'Shell', cwd: 'web' }, { name: 'Shell', cwd: '.' }]);
    expect(spawn).not.toHaveBeenCalled();
  } finally { terminals.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
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
  expect(pty.write).not.toHaveBeenCalled();
  expect(spawn).toHaveBeenLastCalledWith(
    expect.any(String),
    ['-l', '-i', '-c', 'npm run dev'],
    expect.any(Object)
  );
  expect(result.command?.status).toBe('running');
  data('looks successful');
  expect(
    manager.request('group', { action: 'read', tab: result.selected }).command
      ?.status
  ).toBe('running');
  exit({ exitCode: 7 });
  expect(
    manager.request('group', { action: 'read', tab: result.selected }).command
  ).toMatchObject({
    id: result.command?.id,
    status: 'completed',
    exitCode: 7,
  });
  manager.dispose();
});

it('restores unfinished commands as interrupted without replaying them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-receipt-'));
  const file = path.join(root, 'terminals.json');
  try {
    const manager = new ProjectTerminals(host, () => root, file);
    const launched = manager.runCommand('g', 'Test', 'sleep 60');
    manager.flush();
    const restored = new ProjectTerminals(host, () => root, file);
    const result = restored.request('g', {
      action: 'read',
      tab: launched.selected,
    });
    expect(result.command).toMatchObject({
      status: 'interrupted',
      id: launched.command?.id,
    });
    expect(result.command?.exitCode).toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(1);
    manager.request('g', { action: 'close', tab: launched.selected });
    expect(
      manager.request('g', { action: 'read', tab: launched.selected }).command
        ?.status
    ).toBe('interrupted');
    manager.dispose();
    restored.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

it('runs a configured command in a selected subfolder and refuses outside folders', () => {
  const fixture = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'script-cwd-'))
  );
  const root = path.join(fixture, 'project');
  const child = path.join(root, 'src');
  fs.mkdirSync(child, { recursive: true });
  const terminals = new ProjectTerminals(host, () => root);
  try {
    terminals.runCommand('group', 'Development', 'npm run dev', 'src');
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: child })
    );
    expect(() =>
      terminals.runCommand('group', 'Development', 'npm run dev', '..')
    ).toThrow();
  } finally {
    terminals.dispose();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

(fs.existsSync('/bin/zsh') ? it : it.skip)(
  'runs tools installed through interactive shell startup with a minimal app PATH',
  () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'script-path-'));
    const originalShell = process.env.SHELL;
    const terminals = new ProjectTerminals(host, () => directory);
    try {
      process.env.SHELL = '/bin/zsh';
      const bin = path.join(directory, 'bin');
      fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, 'bun'), '#!/bin/sh\nprintf bun-found', {
        mode: 0o700,
      });
      fs.writeFileSync(
        path.join(directory, '.zshrc'),
        'export PATH="$ZDOTDIR/bin:$PATH"\n'
      );
      terminals.runCommand('group', 'Bun', 'bun');
      const [shell, args] = (spawn as jest.Mock).mock.calls[0];
      const env = {
        HOME: directory,
        ZDOTDIR: directory,
        PATH: '/usr/bin:/bin',
      };
      const withoutStartup = spawnSync(shell, ['-l', '-c', 'bun'], {
        cwd: directory,
        env,
        encoding: 'utf8',
        timeout: 5000,
      });
      expect(withoutStartup.status).toBe(127);
      const result = spawnSync(shell, args, {
        cwd: directory,
        env,
        encoding: 'utf8',
        timeout: 5000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('bun-found');
    } finally {
      terminals.dispose();
      if (originalShell === undefined) delete process.env.SHELL;
      else process.env.SHELL = originalShell;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
);

it('removes inherited npm prefixes without changing the parent environment', () => {
  const keys = ['npm_config_prefix', 'NPM_CONFIG_PREFIX'];
  const original = keys.map((key) => process.env[key]);
  try {
    keys.forEach((key) => {
      process.env[key] = '/dev-app/prefix';
    });
    const terminals = new ProjectTerminals(host, () => process.cwd());
    terminals.request('group', { action: 'open', cols: 80, rows: 24 });
    const { env } = (spawn as jest.Mock).mock.calls[0][2];
    expect(env).not.toHaveProperty('npm_config_prefix');
    expect(env).not.toHaveProperty('NPM_CONFIG_PREFIX');
    expect(process.env.npm_config_prefix).toBe('/dev-app/prefix');
    expect(process.env.NPM_CONFIG_PREFIX).toBe('/dev-app/prefix');
  } finally {
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    });
  }
});

it('remembers all open tabs, selection and changed shell directories across restart', async () => {
  const fixture = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-restore-cwd-'))
  );
  const root = path.join(fixture, 'project');
  const child = path.join(root, 'one', 'nested');
  const secondDirectory = path.join(root, 'two');
  fs.mkdirSync(child, { recursive: true });
  fs.mkdirSync(secondDirectory);
  const filename = path.join(fixture, 'terminals.json');
  const probe = jest.fn(async () => child);
  const manager = new ProjectTerminals(host, () => root, filename, probe);
  let restored: ProjectTerminals | undefined;
  try {
    const first = manager.request('group', { action: 'create', cwd: 'one' });
    const firstData = data;
    const second = manager.request('group', { action: 'create', cwd: 'two' });
    manager.request('group', {
      action: 'rename',
      tab: first.selected,
      name: 'Frontend',
    });
    manager.request('group', { action: 'select', tab: first.selected });
    manager.request('group', {
      action: 'preferences',
      open: true,
      height: 300,
    });
    firstData('new shell prompt');
    const deadline = Date.now() + 3000;
    let savedDirectory: string | undefined;
    do {
      await new Promise((resolve) => setTimeout(resolve, 20));
      manager.flush();
      savedDirectory = JSON.parse(fs.readFileSync(filename, 'utf8'))[0][1]
        .tabs[0].cwd;
    } while (savedDirectory !== child && Date.now() < deadline);
    expect(savedDirectory).toBe(child);
    manager.dispose();
    restored = new ProjectTerminals(host, () => root, filename);
    const state = restored.request('group', { action: 'list' });
    expect(state).toMatchObject({
      selected: first.selected,
      open: true,
      height: 300,
    });
    expect(state.tabs.map((tab) => [tab.id, tab.name])).toEqual([
      [first.selected, 'Frontend'],
      [second.selected, 'two'],
    ]);
    restored.request('group', {
      action: 'open',
      tab: first.selected,
      cols: 80,
      rows: 24,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      expect.any(String),
      ['-l'],
      expect.objectContaining({ cwd: child })
    );
    restored.request('group', {
      action: 'open',
      tab: second.selected,
      cols: 80,
      rows: 24,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      expect.any(String),
      ['-l'],
      expect.objectContaining({ cwd: secondDirectory })
    );
  } finally {
    manager.dispose();
    restored?.dispose();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

it('coalesces output probes, bounds their rate and cancels checks when a tab stops', async () => {
  jest.useFakeTimers();
  const probe = jest.fn(async () => undefined);
  const manager = new ProjectTerminals(
    host,
    () => process.cwd(),
    undefined,
    probe
  );
  try {
    const state = manager.request('group', { action: 'create' });
    for (let index = 0; index < 100; index++) data('output');
    await jest.advanceTimersByTimeAsync(200);
    expect(probe).toHaveBeenCalledTimes(1);
    data('more output');
    await jest.advanceTimersByTimeAsync(999);
    expect(probe).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(probe).toHaveBeenCalledTimes(2);
    data('pending output');
    manager.request('group', { action: 'close', tab: state.selected });
    await jest.advanceTimersByTimeAsync(2000);
    expect(probe).toHaveBeenCalledTimes(2);
    manager.runCommand('group', 'Server', 'npm run dev');
    data('continuous command output');
    await jest.advanceTimersByTimeAsync(2000);
    expect(probe).toHaveBeenCalledTimes(2);
  } finally {
    manager.dispose();
    jest.useRealTimers();
  }
});

it('checks submitted commands even while the terminal keeps producing output', async () => {
  jest.useFakeTimers();
  const probe = jest.fn(async () => undefined);
  const manager = new ProjectTerminals(
    host,
    () => process.cwd(),
    undefined,
    probe
  );
  try {
    const state = manager.request('group', { action: 'create' });
    manager.request('group', {
      action: 'write',
      tab: state.selected,
      data: 'cd src; npm run dev\r',
    });
    for (let index = 0; index < 4; index++) {
      data('server output');
      await jest.advanceTimersByTimeAsync(50);
    }
    expect(probe).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 30; index++) {
      data('server output');
      await jest.advanceTimersByTimeAsync(50);
    }
    expect(probe).toHaveBeenCalledTimes(1);
  } finally {
    manager.dispose();
    jest.useRealTimers();
  }
});

it('does not adopt outside directories or symlinks escaping the project', async () => {
  jest.useFakeTimers();
  const root = process.cwd();
  const escaped = path.join(root, 'escape');
  const outside = path.resolve(root, '..');
  const realpath = jest
    .spyOn(fs.promises, 'realpath')
    .mockImplementation(async (directory: any) =>
      directory === escaped ? outside : directory
    );
  const stat = jest
    .spyOn(fs.promises, 'stat')
    .mockResolvedValue({ isDirectory: () => true } as any);
  const probe = jest.fn(async () => outside);
  const manager = new ProjectTerminals(host, () => root, undefined, probe);
  try {
    const state = manager.request('group', { action: 'create' });
    data('outside prompt');
    await jest.advanceTimersByTimeAsync(200);
    probe.mockResolvedValue(escaped);
    data('symlink prompt');
    await jest.advanceTimersByTimeAsync(1000);
    manager.request('group', {
      action: 'restart',
      tab: state.selected,
      cols: 80,
      rows: 24,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: root })
    );
    expect(probe).toHaveBeenCalledTimes(2);
  } finally {
    manager.dispose();
    realpath.mockRestore();
    stat.mockRestore();
    jest.useRealTimers();
  }
});

it('ignores directory results from a stopped shell', async () => {
  jest.useFakeTimers();
  let finish!: (directory: string) => void;
  const probe = jest.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      })
  );
  const manager = new ProjectTerminals(
    host,
    () => process.cwd(),
    undefined,
    probe
  );
  try {
    const state = manager.request('group', { action: 'create' });
    data('prompt');
    await jest.advanceTimersByTimeAsync(200);
    manager.request('group', { action: 'close', tab: state.selected });
    finish('/outside-the-project');
    await jest.advanceTimersByTimeAsync(1000);
    manager.request('group', {
      action: 'open',
      tab: state.selected,
      cols: 80,
      rows: 24,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: process.cwd() })
    );
  } finally {
    manager.dispose();
    jest.useRealTimers();
  }
});

it('reopens a restored tab at the project root when its saved subdirectory was deleted', () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-missing-cwd-'))
  );
  const child = path.join(root, 'child');
  fs.mkdirSync(child);
  const filename = path.join(root, 'terminals.json');
  const manager = new ProjectTerminals(host, () => root, filename);
  let restored: ProjectTerminals | undefined;
  try {
    const state = manager.request('group', { action: 'create', cwd: 'child' });
    manager.dispose();
    fs.rmdirSync(child);
    restored = new ProjectTerminals(host, () => root, filename);
    restored.request('group', {
      action: 'open',
      tab: state.selected,
      cols: 80,
      rows: 24,
    });
    expect(spawn).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: root })
    );
  } finally {
    manager.dispose();
    restored?.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
