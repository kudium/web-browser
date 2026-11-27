import { app, BrowserWindow, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  DeveloperProject,
  ProjectAction,
} from '../browser/developerProject';
import {
  updateBrowserProjectContext,
  BrowserProjectGroup,
} from './browserProjectContext';
import { writePrivateFile } from './privateFile';
import { openProjectEditor } from './projectEditors';
import { openSystemTerminal } from './projectSystemTerminal';

import { getBrowserPreferences } from './preferences';

const projectListeners = new Set<(key: string) => void>();
export function onProjectChanged(listener: (key: string) => void) {
  projectListeners.add(listener);
  return () => {
    projectListeners.delete(listener);
  };
}
function notifyProjectChanged(key: string) {
  projectListeners.forEach((listener) => listener(key));
}
const run = promisify(execFile);
const filename = () =>
  path.join(app.getPath('userData'), 'developer-projects.json');
function read(): Record<string, string> {
  try {
    const value = JSON.parse(fs.readFileSync(filename(), 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value))
      return Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' && path.isAbsolute(entry[1])
        )
      );
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT')
      throw new Error('Could not read linked projects.');
  }
  return {};
}
export function linkedProjectFolder(key: string) {
  return read()[key];
}
export function linkProjectFolder(
  key: string,
  folder: string,
  group: BrowserProjectGroup
) {
  const previous = read()[key];
  const next = { ...read(), [key]: folder };
  if (getBrowserPreferences().writeBrowserInstructions)
    updateBrowserProjectContext(folder, key, group);
  if (previous && previous !== folder && fs.existsSync(previous))
    updateBrowserProjectContext(previous, key, null);
  writePrivateFile(filename(), JSON.stringify(next));
  notifyProjectChanged(key);
}
export function repositoryURL(remote: string): string | undefined {
  try {
    const value = remote.trim().replace(/^git@([^:]+):(.+)$/, 'https://$1/$2');
    const url = new URL(
      value.replace(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\//, 'https://$1/')
    );
    if (!['https:', 'http:'].includes(url.protocol)) return undefined;
    url.username = '';
    url.password = '';
    url.port = '';
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\.git\/?$/, '');
    return url.href;
  } catch {
    return undefined;
  }
}
export function projectBreadcrumbs(folder: string, home = app.getPath('home')) {
  let rootHome = home;
  try {
    rootHome = fs.realpathSync(home);
  } catch {
    /* Home may be unavailable. */
  }
  const relative = path.relative(rootHome, folder);
  const atHome =
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative));
  const root = atHome ? rootHome : path.parse(folder).root;
  const parts = path.relative(root, folder).split(path.sep).filter(Boolean);
  let current = root;
  return [
    { name: atHome ? '~' : root, path: root },
    ...parts.map((name) => {
      current = path.join(current, name);
      return { name, path: current };
    }),
  ];
}

async function describe(folder: string): Promise<DeveloperProject> {
  let available = false;
  try {
    available = (await fs.promises.stat(folder)).isDirectory();
  } catch {
    /* Folder may have moved. */
  }
  let repository: string | undefined;
  if (available) {
    try {
      const result = await run(
        'git',
        [
          '-C',
          folder,
          'config',
          '--local',
          '--no-includes',
          '--get',
          'remote.origin.url',
        ],
        { timeout: 3000, maxBuffer: 8192 }
      );
      repository = repositoryURL(result.stdout);
    } catch {
      /* Git is optional. */
    }
  }
  return {
    name: path.basename(folder),
    path: folder,
    available,
    repository,
    breadcrumbs: projectBreadcrumbs(folder),
  };
}
export async function projectAction(
  host: BrowserWindow,
  key: string,
  action: ProjectAction,
  ensureAccess: () => void,
  editorId?: string,
  folderPath?: string,
  group?: BrowserProjectGroup
): Promise<DeveloperProject | null> {
  ensureAccess();
  if (action === 'link' || action === 'choose-folder') {
    const result = folderPath
      ? { canceled: false, filePaths: [folderPath] }
      : await dialog.showOpenDialog(host, {
          title: 'Link project folder',
          buttonLabel: 'Link folder',
          properties: ['openDirectory'],
        });
    ensureAccess();
    if (!result.canceled && result.filePaths[0]) {
      const folder = await fs.promises.realpath(result.filePaths[0]);
      if (!(await fs.promises.stat(folder)).isDirectory())
        throw new Error('Choose a project folder.');
      ensureAccess();
      if (action === 'choose-folder')
        return { name: path.basename(folder), path: folder, available: true };
      linkProjectFolder(
        key,
        folder,
        group || { name: path.basename(folder), slug: '' }
      );
    }
  }
  if (action === 'choose-folder') return null;
  if (action === 'unlink') {
    const next = read();
    const previous = next[key];
    if (previous && fs.existsSync(previous))
      updateBrowserProjectContext(previous, key, null);
    delete next[key];
    writePrivateFile(filename(), JSON.stringify(next));
    notifyProjectChanged(key);
  }
  const folder = read()[key];
  if (!folder) return null;
  const project = await describe(folder);
  ensureAccess();
  if (
    action === 'get' &&
    project.available &&
    group &&
    getBrowserPreferences().writeBrowserInstructions
  ) {
    try {
      updateBrowserProjectContext(folder, key, group);
    } catch (reason) {
      const permissionDenied = ['EPERM', 'EACCES'].includes((reason as NodeJS.ErrnoException).code || '');
      project.instructionsNotice = permissionDenied
        ? 'Project linked. Kudium could not update its AI instruction files because folder access is blocked. Check folder permissions or turn off Project browser instructions in AI settings.'
        : 'Project linked. Its AI instruction files could not be updated. Check kudium.workspace.json and AGENTS.md, or turn off Project browser instructions in AI settings.';
    }
  }
  if (['get', 'link', 'unlink'].includes(action)) return project;
  if (!project.available)
    throw new Error(
      'This folder is unavailable. Choose a new folder from the project menu.'
    );
  if (action === 'folder') {
    let target = folder;
    if (folderPath !== undefined) {
      if (!path.isAbsolute(folderPath))
        throw new Error('Choose a project breadcrumb.');
      target = await fs.promises.realpath(folderPath);
      const relative = path.relative(target, folder);
      if (
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new Error('Choose a project breadcrumb.');
      ensureAccess();
    }
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  } else if (action === 'repository') {
    if (!project.repository)
      throw new Error('No web repository was found in this folder.');
    await shell.openExternal(project.repository);
  } else if (action === 'terminal') {
    await openSystemTerminal(folder);
  } else if (action === 'editor') {
    await openProjectEditor(folder, editorId);
  }
  return project;
}
