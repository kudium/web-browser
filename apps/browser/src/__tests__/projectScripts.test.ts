/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  projectScripts,
  importProjectScripts,
  onProjectScriptsChanged,
  savedProjectScript,
  validScriptRequest,
} from '../main/projectScripts';

let mockRoot: string;
jest.mock('electron', () => ({ app: { getPath: () => mockRoot } }));
beforeEach(() => {
  mockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-scripts-'));
});
afterEach(() => fs.rmSync(mockRoot, { recursive: true, force: true }));
it('persists project commands separately by group and folder while making globals available everywhere', () => {
  const local = projectScripts('one', '/code/a', {
    action: 'save',
    name: 'Dev',
    command: 'npm run dev',
    scope: 'project',
  })[0];
  expect(projectScripts('two', '/code/a', { action: 'list' })).toEqual([]);
  expect(projectScripts('one', '/code/b', { action: 'list' })).toEqual([]);
  expect(savedProjectScript('one', '/code/a', local.id).command).toBe(
    'npm run dev'
  );
  expect(() => savedProjectScript('two', '/code/a', local.id)).toThrow(
    'no longer available'
  );
  const global = projectScripts('one', '/code/a', {
    action: 'save',
    name: 'Install',
    command: 'npm install',
    scope: 'global',
  }).find((script) => script.scope === 'global')!;
  expect(savedProjectScript('two', '/code/b', global.id).name).toBe('Install');
  projectScripts('two', '/code/b', {
    action: 'save',
    id: global.id,
    name: 'Install clean',
    command: 'npm ci',
    scope: 'global',
  });
  expect(savedProjectScript('one', '/code/a', global.id).command).toBe(
    'npm ci'
  );
  projectScripts('two', '/code/b', { action: 'delete', id: global.id });
  expect(projectScripts('one', '/code/a', { action: 'list' })).toEqual([local]);
  if (process.platform !== 'win32') {
    expect(
      fs.statSync(path.join(mockRoot, 'developer-scripts.json')).mode % 0o1000
    ).toBe(0o600);
  }
});
it('moves an edited command between global and project scope without changing its identity', () => {
  const saved = projectScripts('one', '/code/a', {
    action: 'save',
    name: 'Test',
    command: 'npm test',
    scope: 'global',
  })[0];
  projectScripts('one', '/code/a', {
    action: 'save',
    id: saved.id,
    name: 'Tests',
    command: 'npm run test',
    scope: 'project',
  });
  expect(projectScripts('two', '/code/b', { action: 'list' })).toEqual([]);
  expect(savedProjectScript('one', '/code/a', saved.id).scope).toBe('project');
});
it('rejects malformed commands and refuses to run invalid saved data', () => {
  expect(
    validScriptRequest({
      action: 'save',
      name: 'Dev',
      command: 'npm run dev',
      scope: 'global',
    })
  ).toBe(true);
  ['', 'a\rb', 'a\nb', 'a\x00b', 'x'.repeat(4097)].forEach((command) => {
    expect(
      validScriptRequest({
        action: 'save',
        name: 'Dev',
        command,
        scope: 'project',
      })
    ).toBe(false);
  });
  expect(validScriptRequest({ action: 'run', id: {} })).toBe(false);
  expect(validScriptRequest({ action: 'exec', command: 'echo hi' })).toBe(
    false
  );
  fs.writeFileSync(
    path.join(mockRoot, 'developer-scripts.json'),
    JSON.stringify({
      global: [
        { id: 'bad', name: 'Invalid', command: '\x1b[2J', scope: 'global' },
      ],
      projects: {},
    })
  );
  expect(() => savedProjectScript('one', '/code/a', 'bad')).toThrow(
    'no longer available'
  );
});

it('notifies after persisted saves and deletions, but not reads or rejected writes', () => {
  const changed = jest.fn();
  const stop = onProjectScriptsChanged(changed);
  try {
    const saved = projectScripts('one', '/code/a', {
      action: 'save',
      name: 'Dev',
      command: 'npm run dev',
      scope: 'project',
    })[0];
    expect(changed).toHaveBeenCalledTimes(1);
    projectScripts('one', '/code/a', { action: 'list' });
    expect(changed).toHaveBeenCalledTimes(1);
    projectScripts('one', '/code/a', { action: 'delete', id: saved.id });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(() =>
      projectScripts('one', '/code/a', { action: 'delete', id: saved.id })
    ).toThrow();
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    stop();
  }
});

it('imports selected commands atomically, skips duplicates and never overwrites saved scripts', () => {
  const candidate = {
    id: 'a'.repeat(64),
    name: 'Test',
    command: 'cargo test',
    source: 'Cargo.toml',
    kind: 'standard' as const,
  };
  const first = importProjectScripts('one', '/code/a', [candidate, candidate]);
  expect(first.imported).toBe(1);
  const again = importProjectScripts('one', '/code/a', [candidate]);
  expect(again.imported).toBe(0);
  expect(again.scripts).toEqual(first.scripts);
  expect(() =>
    importProjectScripts('one', '/code/a', [
      { ...candidate, name: 'Valid', command: 'cargo build' },
      { ...candidate, command: 'bad\ncommand' },
    ])
  ).toThrow('invalid');
  expect(projectScripts('one', '/code/a', { action: 'list' })).toEqual(
    first.scripts
  );
  const many = Array.from({ length: 64 }, (_, index) => ({
    ...candidate,
    name: `Task ${index}`,
    command: `echo ${index}`,
  }));
  expect(() => importProjectScripts('one', '/code/a', many)).toThrow('64');
  expect(projectScripts('one', '/code/a', { action: 'list' })).toEqual(
    first.scripts
  );
});
