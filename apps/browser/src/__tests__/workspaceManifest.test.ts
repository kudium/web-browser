/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  describeWorkspaceDiff,
  diffWorkspaceManifest,
  manifestFromBrowserState,
  validateWorkspaceManifest,
  workspaceDiffEmpty,
  workspaceOwnOrigins,
  workspaceOrigin,
} from '../browser/workspaceManifest';
import {
  cachedWorkspaceManifest,
  loadWorkspaceSkills,
  readWorkspaceManifest,
  serializeWorkspaceManifest,
  writeWorkspaceManifest,
} from '../main/workspaceManifest';

const full = {
  version: 1,
  group: { name: 'Delight', display: 'folder', sessionMode: 'separate' },
  project: { path: '.', editor: 'cursor' },
  tabs: [
    { url: 'http://localhost:5173', pinned: true, title: 'Web' },
    { url: 'http://localhost:8000/docs', title: 'API docs' },
  ],
  scripts: [
    { id: 'dev-web', name: 'Web dev server', command: 'cd web && pnpm dev', shortcut: 'cmd+shift+1' },
    { id: 'dev-api', name: 'API dev server', command: 'make run-local' },
  ],
  terminals: [{ name: 'shell', cwd: '.' }],
  siteSettings: { 'localhost:5173': { notifications: 'allow' } },
  skills: ['.kudium/skills/qa'],
  ai: { mode: 'full', trusted: true, sessions: { qa: { tabs: ['http://localhost:5173/'], description: 'QA pass' } } },
};

it('accepts the spec example and normalises URLs', () => {
  const manifest = validateWorkspaceManifest(full);
  expect(manifest.tabs![0].url).toBe('http://localhost:5173/');
  expect(manifest.scripts![0]).toEqual(full.scripts[0]);
  expect(manifest.ai).toEqual(full.ai);
  expect(workspaceOwnOrigins(manifest).sort()).toEqual(['http://localhost:5173', 'http://localhost:8000']);
  expect(workspaceOrigin('app.test')).toBe('http://app.test');
  expect(workspaceOrigin('https://app.test:8443/x')).toBe('https://app.test:8443');
});

it('rejects unknown keys, secrets, escapes, bad URLs and non-slug ids', () => {
  expect(() => validateWorkspaceManifest({ version: 2 })).toThrow('version must be 1');
  expect(() => validateWorkspaceManifest({ version: 1, hooks: {} })).toThrow('unsupported key "hooks"');
  expect(() => validateWorkspaceManifest({ version: 1, project: { apiToken: 'x' } })).toThrow('secret');
  expect(() => validateWorkspaceManifest({ version: 1, project: { nope: 'x' } })).toThrow('unsupported key "nope"');
  expect(() => validateWorkspaceManifest({ version: 1, siteSettings: { 'a.test': { password: 'allow' } } })).toThrow(
    'secret'
  );
  expect(() => validateWorkspaceManifest({ version: 1, skills: ['../other'] })).toThrow('inside the project folder');
  expect(() => validateWorkspaceManifest({ version: 1, project: { path: '/etc' } })).toThrow('inside the project folder');
  expect(() => validateWorkspaceManifest({ version: 1, tabs: [{ url: 'file:///etc/passwd' }] })).toThrow('http(s)');
  expect(() => validateWorkspaceManifest({ version: 1, tabs: [{ url: 'http://u:p@host/' }] })).toThrow('credentials');
  expect(() => validateWorkspaceManifest({ version: 1, scripts: [{ id: 'a b', name: 'x', command: 'y' }] })).toThrow('slug');
  expect(() =>
    validateWorkspaceManifest({ version: 1, scripts: [{ id: 'a', name: 'x', command: 'y' }, { id: 'a', name: 'z', command: 'w' }] })
  ).toThrow('duplicate');
  expect(() => validateWorkspaceManifest({ version: 1, ai: { mode: 'root' } })).toThrow('ai.mode');
  expect(() => validateWorkspaceManifest({ version: 1, group: { name: 'x\u0007' } })).toThrow('control');
});

it('generates the effective manifest from browser state and keeps file-only keys', () => {
  const manifest = manifestFromBrowserState({
    group: { name: 'Delight', slug: 'delight', display: 'folder', sessionMode: 'separate' },
    tabs: [{ url: 'http://localhost:5173/', title: 'Web', pinned: true }, { url: 'https://docs.test/', title: 'Docs' }],
    scripts: [{ name: 'Web dev server', command: 'cd web && pnpm dev' }, { name: 'Tests', command: 'npm test' }],
    siteSettings: { 'http://localhost:5173': { notifications: 'allow' } },
    trusted: true,
    file: validateWorkspaceManifest(full),
  });
  expect(manifest.scripts).toEqual([
    { id: 'dev-web', name: 'Web dev server', command: 'cd web && pnpm dev', shortcut: 'cmd+shift+1' },
    { id: 'tests', name: 'Tests', command: 'npm test' },
  ]);
  expect(manifest.tabs).toEqual([{ url: 'http://localhost:5173/', title: 'Web', pinned: true }, { url: 'https://docs.test/', title: 'Docs' }]);
  expect(manifest.skills).toEqual(['.kudium/skills/qa']);
  expect(manifest.terminals).toEqual([{ name: 'shell', cwd: '.' }]);
  expect(manifest.ai).toEqual({ ...full.ai, trusted: true });
  expect(manifest.project).toEqual({ path: '.', editor: 'cursor' });
  expect(() => validateWorkspaceManifest(manifest)).not.toThrow();
});

it('diffs only additions and changes, and keeps the ai block apart', () => {
  const current = validateWorkspaceManifest({
    version: 1,
    group: { name: 'Delight', display: 'stack' },
    tabs: [{ url: 'http://localhost:5173/#top' }],
    scripts: [{ id: 'dev-web', name: 'Web', command: 'pnpm dev' }],
    siteSettings: { 'localhost:5173': { notifications: 'allow' } },
  });
  const next = validateWorkspaceManifest({
    version: 1,
    group: { name: 'Delight', display: 'folder' },
    tabs: [{ url: 'http://localhost:5173', pinned: true }, { url: 'http://localhost:8000/docs' }],
    scripts: [
      { id: 'dev-web', name: 'Web dev server', command: 'cd web && pnpm dev' },
      { id: 'test', name: 'Tests', command: 'npm test' },
    ],
    siteSettings: { 'localhost:5173': { notifications: 'allow', camera: 'block' } },
    ai: { trusted: true },
  });
  const diff = diffWorkspaceManifest(current, next);
  expect(diff.group).toEqual(['display: stack → folder']);
  expect(diff.tabs.open.map((tab) => tab.url)).toEqual(['http://localhost:8000/docs']);
  expect(diff.tabs.pin.map((tab) => tab.url)).toEqual(['http://localhost:5173/']);
  expect(diff.scripts.add.map((script) => script.id)).toEqual(['test']);
  expect(diff.scripts.change.map(({ next: script }) => script.command)).toEqual(['cd web && pnpm dev']);
  expect(diff.siteSettings).toEqual(['localhost:5173 camera: ask → block']);
  expect(diff.ai).toEqual(['trusted group: false → true']);
  const text = describeWorkspaceDiff(diff, { includeAI: true });
  expect(text).toContain('Shell commands that become runnable scripts');
  expect(text).toContain('+ Tests: npm test');
  expect(text).toContain('AI access (confirmed separately)');
  expect(describeWorkspaceDiff(diff)).not.toContain('AI access');
  expect(workspaceDiffEmpty(diffWorkspaceManifest(next, next))).toBe(true);
  expect(describeWorkspaceDiff(diffWorkspaceManifest(next, next))).toBe('No changes.');
});

describe('files', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-manifest-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('round-trips with stable key order and caches by mtime', () => {
    expect(readWorkspaceManifest(root)).toBeUndefined();
    const manifest = validateWorkspaceManifest(full);
    writeWorkspaceManifest(root, manifest);
    const text = fs.readFileSync(path.join(root, 'kudium.workspace.json'), 'utf8');
    expect(text).toBe(serializeWorkspaceManifest(manifest));
    expect(Object.keys(JSON.parse(text))).toEqual(['version', 'group', 'project', 'tabs', 'scripts', 'terminals', 'siteSettings', 'skills', 'ai']);
    expect(readWorkspaceManifest(root)).toEqual(manifest);
    expect(cachedWorkspaceManifest(root)).toEqual(manifest);
    fs.writeFileSync(path.join(root, 'kudium.workspace.json'), '{"version":1,"tabs":[{"url":"http://a.test/"}]}');
    expect(cachedWorkspaceManifest(root)?.tabs).toEqual([{ url: 'http://a.test/' }]);
    fs.writeFileSync(path.join(root, 'kudium.workspace.json'), '{ broken');
    expect(cachedWorkspaceManifest(root)).toBeUndefined();
    expect(() => readWorkspaceManifest(root)).toThrow('not valid JSON');
  });

  it('refuses symlinked or oversized manifests', () => {
    fs.writeFileSync(path.join(root, 'other.json'), '{"version":1}');
    fs.symlinkSync(path.join(root, 'other.json'), path.join(root, 'kudium.workspace.json'));
    expect(() => readWorkspaceManifest(root)).toThrow('symlink');
    fs.unlinkSync(path.join(root, 'kudium.workspace.json'));
    fs.writeFileSync(path.join(root, 'kudium.workspace.json'), `{"version":1,"group":{"name":"${'x'.repeat(300 * 1024)}"}}`);
    expect(() => readWorkspaceManifest(root)).toThrow('256 KB');
  });

  it('loads manifest skills from inside the folder only', () => {
    fs.mkdirSync(path.join(root, '.kudium', 'skills', 'qa'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.kudium', 'skills', 'qa', 'SKILL.md'),
      '---\nname: Delight QA\ndescription: Smoke test the app\n---\nOpen the app and check the dashboard.\n'
    );
    fs.writeFileSync(path.join(root, 'NOTES.md'), '---\nname: Notes skill\n---\nBody\n');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-outside-'));
    fs.writeFileSync(path.join(outside, 'SKILL.md'), 'secret');
    fs.symlinkSync(outside, path.join(root, 'linked'));
    const manifest = validateWorkspaceManifest({ version: 1, skills: ['.kudium/skills/qa', 'NOTES.md', 'linked', 'missing'] });
    const { skills, problems } = loadWorkspaceSkills(root, manifest);
    expect(skills.map((skill) => [skill.id, skill.name])).toEqual([
      ['project:.kudium/skills/qa', 'Delight QA'],
      ['project:NOTES.md', 'Notes skill'],
    ]);
    expect(skills[0].instructions).toContain('check the dashboard');
    expect(problems).toEqual([expect.stringContaining('linked: outside the project folder'), expect.stringContaining('missing:')]);
    fs.rmSync(outside, { recursive: true, force: true });
  });
});
