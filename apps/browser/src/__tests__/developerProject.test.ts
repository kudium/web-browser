/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { dialog, shell } from 'electron';
import { projectAction, repositoryURL } from '../main/developerProject';

let mockRoot: string;
let mockInstructions = true;
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({ writeBrowserInstructions: mockInstructions }),
}));
jest.mock('electron', () => ({
  app: { getPath: () => mockRoot },
  dialog: { showOpenDialog: jest.fn() },
  shell: {
    openPath: jest.fn().mockResolvedValue(''),
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
}));
beforeEach(() => {
  mockInstructions = true;
  mockRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-project-test-')
  );
});
afterEach(() => {
  fs.rmSync(mockRoot, { recursive: true, force: true });
  jest.clearAllMocks();
});
it('links only the selected group, persists the folder, reads its remote and unlinks without deleting files', async () => {
  const folder = path.join(mockRoot, 'Project with spaces');
  fs.mkdirSync(folder);
  execFileSync('git', ['init', folder]);
  execFileSync('git', [
    '-C',
    folder,
    'remote',
    'add',
    'origin',
    'git@github.com:example/project.git',
  ]);
  (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
    canceled: false,
    filePaths: [folder],
  });
  const host = {} as any;
  const access = jest.fn();
  const linked = await projectAction(host, 'group-a', 'link', access);
  expect(linked).toMatchObject({
    name: 'Project with spaces',
    available: true,
    repository: 'https://github.com/example/project',
  });
  expect(await projectAction(host, 'group-a', 'get', access)).toEqual(linked);
  expect(await projectAction(host, 'group-b', 'get', access)).toBeNull();
  await projectAction(host, 'group-a', 'repository', access);
  expect(shell.openExternal).toHaveBeenCalledWith(
    'https://github.com/example/project'
  );
  await projectAction(host, 'group-a', 'folder', access);
  expect(shell.openPath).toHaveBeenCalledWith(fs.realpathSync(folder));
  (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
    canceled: true,
    filePaths: [],
  });
  expect(await projectAction(host, 'group-a', 'link', access)).toEqual(linked);
  fs.renameSync(folder, `${folder}-moved`);
  expect(await projectAction(host, 'group-a', 'get', access)).toMatchObject({
    available: false,
  });
  await expect(
    projectAction(host, 'group-a', 'terminal', access)
  ).rejects.toThrow('unavailable');
  expect(await projectAction(host, 'group-a', 'unlink', access)).toBeNull();
  expect(fs.existsSync(`${folder}-moved`)).toBe(true);
});
it('rejects access changes while the folder chooser is open', async () => {
  const access = jest
    .fn()
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw new Error('Locked');
    });
  (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
    canceled: false,
    filePaths: [mockRoot],
  });
  await expect(
    projectAction({} as any, 'group', 'link', access)
  ).rejects.toThrow('Locked');
  expect(fs.existsSync(path.join(mockRoot, 'developer-projects.json'))).toBe(
    false
  );
});
it('normalizes SSH and HTTPS remotes and strips credentials, rejecting executable URLs', () => {
  expect(repositoryURL('ssh://git@github.com/example/project.git')).toBe(
    'https://github.com/example/project'
  );
  expect(
    repositoryURL('https://user:secret@example.com/team/project.git')
  ).toBe('https://example.com/team/project');
  expect(repositoryURL('ext::run-command')).toBeUndefined();
  expect(repositoryURL('file:///tmp/repo')).toBeUndefined();
  // eslint-disable-next-line no-script-url
  expect(repositoryURL('javascript:alert(1)')).toBeUndefined();
});
it('provides home-relative clickable breadcrumbs and only opens real project ancestors', async () => {
  const parent = path.join(mockRoot, 'workspace');
  const folder = path.join(parent, 'example');
  fs.mkdirSync(folder, { recursive: true });
  (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
    canceled: false,
    filePaths: [folder],
  });
  const project = await projectAction({} as any, 'group', 'link', () => {});
  expect(project?.breadcrumbs?.map((crumb) => crumb.name)).toEqual([
    '~',
    'workspace',
    'example',
  ]);
  await projectAction(
    {} as any,
    'group',
    'folder',
    () => {},
    undefined,
    fs.realpathSync(parent)
  );
  expect(shell.openPath).toHaveBeenCalledWith(fs.realpathSync(parent));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-project-'));
  try {
    await expect(
      projectAction({} as any, 'group', 'folder', () => {}, undefined, outside)
    ).rejects.toThrow('breadcrumb');
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

it('moves the browser context when relinking to another folder', async () => {
  const first = path.join(mockRoot, 'first');
  const second = path.join(mockRoot, 'second');
  fs.mkdirSync(first);
  fs.mkdirSync(second);
  const picker = dialog.showOpenDialog as jest.Mock;
  picker.mockResolvedValue({ canceled: false, filePaths: [first] });
  await projectAction(
    {} as any,
    'group',
    'link',
    () => {},
    undefined,
    undefined,
    { name: 'Website', slug: 'website' }
  );
  expect(fs.readFileSync(path.join(first, 'BROWSER.md'), 'utf8')).toContain(
    '"slug":"website"'
  );
  picker.mockResolvedValue({ canceled: false, filePaths: [second] });
  await projectAction(
    {} as any,
    'group',
    'link',
    () => {},
    undefined,
    undefined,
    { name: 'Website', slug: 'website' }
  );
  expect(fs.existsSync(path.join(first, 'BROWSER.md'))).toBe(false);
  expect(fs.existsSync(path.join(first, 'AGENTS.md'))).toBe(false);
  expect(fs.existsSync(path.join(second, 'BROWSER.md'))).toBe(true);
  await projectAction({} as any, 'group', 'unlink', () => {});
  expect(fs.existsSync(path.join(second, 'BROWSER.md'))).toBe(false);
});

it('links a project without writing instructions when disabled', async () => {
  mockInstructions = false;
  const folder = path.join(mockRoot, 'No instructions');
  fs.mkdirSync(folder);
  await projectAction({} as any, 'group', 'link', () => {}, undefined, folder, {
    name: 'Project',
    slug: 'project',
  });
  expect(fs.existsSync(path.join(folder, 'BROWSER.md'))).toBe(false);
  expect(fs.existsSync(path.join(folder, 'AGENTS.md'))).toBe(false);
});

it('retains the saved project when optional instruction refresh is denied', async () => {
  const folder = path.join(mockRoot, 'Downloads');
  fs.mkdirSync(folder);
  const group = { name: 'Website', slug: 'website' };
  await projectAction({} as any, 'group', 'link', () => {}, undefined, folder, group);
  const original = fs.readFileSync;
  const denied = jest.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => {
    if (String(file) === path.join(fs.realpathSync(folder), 'BROWSER.md'))
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    return (original as any)(file, ...args);
  });
  try {
    const project = await projectAction({} as any, 'group', 'get', () => {}, undefined, undefined, group);
    expect(project).toMatchObject({ path: fs.realpathSync(folder), available: true, instructionsNotice: expect.stringContaining('folder access is blocked') });
    expect(project?.instructionsNotice).not.toContain('EPERM');
    expect(dialog.showOpenDialog).not.toHaveBeenCalled();
  } finally {
    denied.mockRestore();
  }
});
