import fs from 'fs';
import path from 'path';
import { BrowserWindow, ipcMain } from 'electron';
import type { IApp } from '../types';
import type { DeveloperProject } from '../browser/developerProject';
import { aiGroupId, aiGroups } from '../browser/aiGroups';
import { isGroupLocked } from './groupLocks';
import { showBrowserDialog } from './dialogs';
import { projectAction } from './developerProject';

const handlers = new Map<
  number,
  (id: string, folder: string) => Promise<DeveloperProject | null>
>();

export function registerProjectFolderDrop(
  host: BrowserWindow,
  tabs: () => IApp[],
  onLinked: () => void,
  link?: (id: string, folder: string) => Promise<DeveloperProject | null>
) {
  if (!handlers.size)
    ipcMain.handle(
      'project-folder-drop',
      (event, id: unknown, folder: unknown) => {
        const handler = handlers.get(event.sender.id);
        if (!handler || event.senderFrame !== event.sender.mainFrame)
          throw new Error('Untrusted project folder drop.');
        if (
          typeof id !== 'string' ||
          !id ||
          id.length > 1024 ||
          typeof folder !== 'string' ||
          !path.isAbsolute(folder) ||
          folder.length > 32768 ||
          folder.includes('\0')
        )
          throw new Error('Drop a local project folder.');
        return handler(id, folder);
      }
    );
  const hostId = host.webContents.id;
  handlers.set(hostId, async (id, folder) => {
    const source = tabs().find((tab) => tab.id === id && !tab.archived);
    if (!source) throw new Error('This group is no longer available.');
    const key = aiGroupId(source);
    const ensureAccess = () => {
      const current = tabs().find((tab) => tab.id === id && !tab.archived);
      if (host.isDestroyed() || !current || aiGroupId(current) !== key)
        throw new Error('This group is no longer available.');
      if (isGroupLocked(current))
        throw new Error('Unlock this group to use its project.');
    };
    ensureAccess();
    const real = await fs.promises.realpath(folder);
    if (!(await fs.promises.stat(real)).isDirectory())
      throw new Error('Drop a folder to link a project.');
    ensureAccess();
    const answer = await showBrowserDialog(host, {
      message: `Link “${path.basename(real)}” to this group?`,
      detail: `${source.sessionName || source.name}\n${real}\n\nThis changes the group's linked project folder. Existing project files are kept.`,
      buttons: ['Cancel', 'Link folder'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    ensureAccess();
    if (answer.response !== 1) return null;
    const project = link ? await link(id, real) : await projectAction(
      host,
      key,
      'link',
      ensureAccess,
      undefined,
      real,
      aiGroups(tabs()).find((group) => group.id === key)
    );
    if (project) onLinked();
    return project;
  });
  return () => {
    handlers.delete(hostId);
    if (!handlers.size) ipcMain.removeHandler('project-folder-drop');
  };
}
