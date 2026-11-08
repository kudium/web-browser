/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { updateBrowserProjectContext } from '../main/browserProjectContext';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-context-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
const read = (name: string) => fs.readFileSync(path.join(root, name), 'utf8');
it('creates an idempotent guide and cleans up after unlinking', () => {
  updateBrowserProjectContext(root, 'group-id', {
    name: 'Website',
    slug: 'website',
  });
  expect(read('AGENTS.md')).toContain('[BROWSER.md](BROWSER.md)');
  expect(read('BROWSER.md')).not.toContain('group-id');
  expect(read('BROWSER.md')).toContain('"slug":"website"');
  expect(read('BROWSER.md')).toContain('kudiumbrowser://guide');
  expect(read('BROWSER.md')).toContain('list_groups');
  expect(read('BROWSER.md')).toContain(
    'do not request permission already granted'
  );
  const guide = read('BROWSER.md');
  updateBrowserProjectContext(root, 'group-id', {
    name: 'Website',
    slug: 'website',
  });
  expect(read('BROWSER.md')).toBe(guide);
  updateBrowserProjectContext(root, 'group-id', null);
  expect(fs.existsSync(path.join(root, 'BROWSER.md'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
});
it('preserves user instructions and other groups, while always creating AGENTS.md', () => {
  fs.writeFileSync(path.join(root, 'AGENT.md'), '# Project rules\nUse bun.\n');
  fs.writeFileSync(
    path.join(root, 'BROWSER.md'),
    '# My browser notes\nKeep these notes.\n'
  );
  updateBrowserProjectContext(root, 'one', { name: 'First', slug: 'first' });
  updateBrowserProjectContext(root, 'two', { name: 'Second', slug: 'second' });
  expect(read('AGENTS.md')).toContain('[BROWSER.md](BROWSER.md)');
  expect(read('AGENT.md')).toBe('# Project rules\nUse bun.\n');
  updateBrowserProjectContext(root, 'one', {
    name: 'Renamed',
    slug: 'renamed',
  });
  expect(read('BROWSER.md')).not.toContain('"name":"First"');
  expect(read('BROWSER.md')).toContain('"name":"Renamed"');
  updateBrowserProjectContext(root, 'one', null);
  expect(read('BROWSER.md')).toContain('"slug":"second"');
  expect(read('AGENTS.md')).toContain('[BROWSER.md](BROWSER.md)');
  updateBrowserProjectContext(root, 'two', null);
  expect(read('BROWSER.md').trim()).toBe(
    '# My browser notes\nKeep these notes.'
  );
  expect(read('AGENT.md').trim()).toBe('# Project rules\nUse bun.');
});
it('refuses symlinks and broken markers before modifying documents', () => {
  const external = path.join(root, 'external.md');
  fs.writeFileSync(external, 'Keep me');
  fs.symlinkSync(external, path.join(root, 'AGENTS.md'));
  expect(() =>
    updateBrowserProjectContext(root, 'id', {
      name: 'Project',
      slug: 'project',
    })
  ).toThrow('regular file');
  expect(fs.readFileSync(external, 'utf8')).toBe('Keep me');
  expect(fs.existsSync(path.join(root, 'BROWSER.md'))).toBe(false);
  fs.unlinkSync(path.join(root, 'AGENTS.md'));
  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    '<!-- kudium:browser-reference:start -->\nUser changes'
  );
  expect(() =>
    updateBrowserProjectContext(root, 'id', {
      name: 'Project',
      slug: 'project',
    })
  ).toThrow('markers');
  expect(fs.existsSync(path.join(root, 'BROWSER.md'))).toBe(false);
});

it('migrates a previously managed singular reference to AGENTS.md', () => {
  fs.writeFileSync(
    path.join(root, 'AGENT.md'),
    '# User rules\n\n<!-- kudium:browser-reference:start -->\nOld browser reference\n<!-- kudium:browser-reference:end -->\n'
  );
  updateBrowserProjectContext(root, 'one', {
    name: 'Project',
    slug: 'project',
  });
  expect(read('AGENTS.md')).toContain('[BROWSER.md](BROWSER.md)');
  expect(read('AGENT.md').trim()).toBe('# User rules');
});

it('migrates repeated legacy guides into one shared guide without exposed IDs', () => {
  updateBrowserProjectContext(root, 'one', {
    name: 'Website',
    slug: 'website',
  });
  updateBrowserProjectContext(root, 'two', { name: 'Other', slug: 'other' });
  const guide = read('BROWSER.md');
  expect(guide.match(/## Kudium Browser/g)).toHaveLength(1);
  expect(guide).not.toContain('"id"');
  updateBrowserProjectContext(root, 'two', { name: 'Other', slug: 'other' });
  expect(read('BROWSER.md')).toBe(guide);
});

it('only writes name and reference from runtime group objects', () => {
  updateBrowserProjectContext(root, 'internal-id', {
    name: 'Video to edit',
    slug: 'video-to-edit',
    id: 'internal-id',
    tabs: [{ id: 'page-id', icon: '', url: 'https://facebook.com/' }],
  } as any);
  const guide = read('BROWSER.md');
  expect(guide).toContain('"slug":"video-to-edit"');
  expect(guide).not.toContain('internal-id');
  expect(guide).not.toContain('page-id');
  expect(guide).not.toContain('"tabs"');
});
