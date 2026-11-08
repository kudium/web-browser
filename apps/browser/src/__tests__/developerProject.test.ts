/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { dialog, shell } from 'electron';
import { projectAction, repositoryURL } from '../main/developerProject';

let mockRoot: string;
jest.mock('electron', () => ({
  app: { getPath: () => mockRoot },
  dialog: { showOpenDialog: jest.fn() },
  shell: {
    openPath: jest.fn().mockResolvedValue(''),
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
}));
beforeEach(() => {
  mockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-project-test-'));
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
