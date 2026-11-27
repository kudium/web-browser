/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { updateBrowserProjectContext, AGENTS_REFERENCE } from '../main/browserProjectContext';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-context-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
const read = (name: string) => fs.readFileSync(path.join(root, name), 'utf8');
const exists = (name: string) => fs.existsSync(path.join(root, name));
const manifest = () => JSON.parse(read('kudium.workspace.json'));

it('writes the manifest group, a one-line AGENTS.md reference and the bridge entry, idempotently', () => {
  updateBrowserProjectContext(root, 'group-id', { name: 'Website', slug: 'website' });
  expect(manifest()).toEqual({ version: 1, group: { name: 'Website', slug: 'website' } });
  expect(read('kudium.workspace.json')).not.toContain('group-id');
  expect(read('AGENTS.md')).toContain(AGENTS_REFERENCE);
  expect(read('AGENTS.md')).not.toContain('BROWSER.md');
  expect(JSON.parse(read('.mcp.json'))).toEqual({
    mcpServers: { kudiumbrowser: { command: 'npx', args: ['-y', '@kudiumbrowser/mcp'] } },
  });
  expect(exists('BROWSER.md')).toBe(false);
  const before = [read('kudium.workspace.json'), read('AGENTS.md'), read('.mcp.json')];
  updateBrowserProjectContext(root, 'group-id', { name: 'Website', slug: 'website' });
  expect([read('kudium.workspace.json'), read('AGENTS.md'), read('.mcp.json')]).toEqual(before);
  updateBrowserProjectContext(root, 'group-id', null);
  expect(exists('kudium.workspace.json')).toBe(false);
  expect(exists('AGENTS.md')).toBe(false);
  // The MCP entry is harmless (no token) and may be the user's now; it stays.
  expect(exists('.mcp.json')).toBe(true);
});

it('keeps user-authored manifest keys and other MCP servers', () => {
  fs.writeFileSync(
    path.join(root, 'kudium.workspace.json'),
    JSON.stringify({ version: 1, tabs: [{ url: 'http://localhost:5173/' }], scripts: [{ id: 'dev', name: 'Dev', command: 'pnpm dev' }] })
  );
  fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
  updateBrowserProjectContext(root, 'one', { name: 'First', slug: 'first' });
  expect(manifest()).toEqual({
    version: 1,
    group: { name: 'First', slug: 'first' },
    tabs: [{ url: 'http://localhost:5173/' }],
    scripts: [{ id: 'dev', name: 'Dev', command: 'pnpm dev' }],
  });
  expect(Object.keys(JSON.parse(read('.mcp.json')).mcpServers)).toEqual(['other', 'kudiumbrowser']);
  updateBrowserProjectContext(root, 'one', { name: 'Renamed', slug: 'renamed' });
  expect(manifest().group).toEqual({ name: 'Renamed', slug: 'renamed' });
  updateBrowserProjectContext(root, 'one', null);
  expect(manifest()).toEqual({
    version: 1,
    tabs: [{ url: 'http://localhost:5173/' }],
    scripts: [{ id: 'dev', name: 'Dev', command: 'pnpm dev' }],
  });
});

it('never replaces an existing kudiumbrowser MCP entry or repairs invalid JSON', () => {
  fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { kudiumbrowser: { command: '/usr/bin/node', args: ['bridge'] } } }));
  fs.mkdirSync(path.join(root, '.cursor'));
  fs.writeFileSync(path.join(root, '.cursor', 'mcp.json'), '{ not json');
  updateBrowserProjectContext(root, 'one', { name: 'First', slug: 'first' });
  expect(JSON.parse(read('.mcp.json')).mcpServers.kudiumbrowser.command).toBe('/usr/bin/node');
  expect(read('.cursor/mcp.json')).toBe('{ not json');
  fs.writeFileSync(path.join(root, '.cursor', 'mcp.json'), '{}');
  updateBrowserProjectContext(root, 'one', { name: 'First', slug: 'first' });
  expect(JSON.parse(read('.cursor/mcp.json')).mcpServers.kudiumbrowser.command).toBe('npx');
});

it('migrates the old BROWSER.md blocks and keeps the user’s own notes', () => {
  fs.writeFileSync(
    path.join(root, 'BROWSER.md'),
    `# My browser notes\nKeep these notes.\n\n<!-- kudium:browser-guide:start -->\n## Kudium Browser\nold guide\n<!-- kudium:browser-guide:end -->\n\n<!-- kudium:browser-group:abc:start -->\n{"name":"Old","slug":"old"}\n<!-- kudium:browser-group:abc:end -->\n`
  );
  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    '# Rules\n\n<!-- kudium:browser-reference:start -->\nThis project is linked to Kudium Browser. Read [BROWSER.md](BROWSER.md) for browser integration and linked group context.\n<!-- kudium:browser-reference:end -->\n'
  );
  updateBrowserProjectContext(root, 'one', { name: 'First', slug: 'first' });
  expect(read('BROWSER.md').trim()).toBe('# My browser notes\nKeep these notes.');
  expect(read('AGENTS.md')).toBe(`# Rules\n\n<!-- kudium:browser-reference:start -->\n${AGENTS_REFERENCE}\n<!-- kudium:browser-reference:end -->\n`);
  expect(manifest().group).toEqual({ name: 'First', slug: 'first' });
});

it('deletes a BROWSER.md that held nothing but Kudium blocks', () => {
  fs.writeFileSync(
    path.join(root, 'BROWSER.md'),
    `<!-- kudium:browser-guide:start -->\nguide\n<!-- kudium:browser-guide:end -->\n\n<!-- kudium:browser-group:abc:start -->\n{"name":"Old","slug":"old"}\n<!-- kudium:browser-group:abc:end -->\n`
  );
  updateBrowserProjectContext(root, 'one', { name: 'First', slug: 'first' });
  expect(exists('BROWSER.md')).toBe(false);
});

it('leaves a hand-edited manifest that no longer validates alone', () => {
  fs.writeFileSync(path.join(root, 'kudium.workspace.json'), JSON.stringify({ version: 1, apiToken: 'x' }));
  updateBrowserProjectContext(root, 'one', { name: 'First', slug: 'first' });
  expect(manifest()).toEqual({ version: 1, apiToken: 'x' });
  expect(read('AGENTS.md')).toContain(AGENTS_REFERENCE);
});

it('refuses symlinks and broken markers before modifying documents', () => {
  const external = path.join(root, 'external.md');
  fs.writeFileSync(external, 'Keep me');
  fs.symlinkSync(external, path.join(root, 'AGENTS.md'));
  expect(() => updateBrowserProjectContext(root, 'id', { name: 'Project', slug: 'project' })).toThrow('regular file');
  expect(fs.readFileSync(external, 'utf8')).toBe('Keep me');
  expect(exists('kudium.workspace.json')).toBe(false);
  fs.unlinkSync(path.join(root, 'AGENTS.md'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- kudium:browser-reference:start -->\nUser changes');
  expect(() => updateBrowserProjectContext(root, 'id', { name: 'Project', slug: 'project' })).toThrow('markers');
  expect(exists('kudium.workspace.json')).toBe(false);
  expect(exists('.mcp.json')).toBe(false);
});

it('migrates a previously managed singular reference to AGENTS.md', () => {
  fs.writeFileSync(
    path.join(root, 'AGENT.md'),
    '# User rules\n\n<!-- kudium:browser-reference:start -->\nOld browser reference\n<!-- kudium:browser-reference:end -->\n'
  );
  updateBrowserProjectContext(root, 'one', { name: 'Project', slug: 'project' });
  expect(read('AGENTS.md')).toContain(AGENTS_REFERENCE);
  expect(read('AGENT.md').trim()).toBe('# User rules');
});

it('only writes name and reference from runtime group objects', () => {
  updateBrowserProjectContext(root, 'internal-id', {
    name: 'Video to edit',
    slug: 'video-to-edit',
    id: 'internal-id',
    tabs: [{ id: 'page-id', icon: '', url: 'https://facebook.com/' }],
  } as any);
  expect(manifest()).toEqual({ version: 1, group: { name: 'Video to edit', slug: 'video-to-edit' } });
});
