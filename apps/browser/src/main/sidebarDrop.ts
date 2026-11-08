import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { BrowserWindow, ipcMain } from 'electron';
import type { IApp } from '../types';
import type {
  SidebarDropResult,
  DroppedGroupDraft,
  CreatedDroppedGroup,
} from '../browser/sidebarDrop';
import { aiGroups, aiGroupId, groupSlug } from '../browser/aiGroups';
import { linkProjectFolder } from './developerProject';
import type { GroupTransferResult } from '../browser/groupTransfer';

export async function inspectSidebarPath(filePath: string) {
  if (
    !path.isAbsolute(filePath) ||
    filePath.length > 32768 ||
    filePath.includes('\0')
  )
    throw new Error('Drop a local file or folder.');
  const real = await fs.promises.realpath(filePath);
  const stat = await fs.promises.stat(real);
  if (!stat.isFile() && !stat.isDirectory())
    throw new Error('Drop a regular file or project folder.');
  if (stat.isFile() && /\.json$/i.test(real)) {
    if (/\.kudiumbrowser-group\.json$/i.test(real))
      return { kind: 'import' as const, file: real };
    if (stat.size <= 8 * 1024 * 1024) {
      try {
        const data = JSON.parse(await fs.promises.readFile(real, 'utf8'));
        if (data?.format === 'kudiumbrowser-group')
          return { kind: 'import' as const, file: real };
      } catch {
        /* Ordinary JSON files can start a project too. */
      }
    }
  }
  const folder = stat.isDirectory() ? real : path.dirname(real);
  return {
    kind: 'project' as const,
    folder,
    name: path.basename(folder),
    fileName: stat.isFile() ? path.basename(real) : undefined,
  };
}
const handlers = new Map<
  number,
  {
    inspect: (file: string, space: string) => Promise<SidebarDropResult>;
    create: (draft: DroppedGroupDraft) => Promise<CreatedDroppedGroup>;
  }
>();
export function registerSidebarDrop(
  host: BrowserWindow,
  tabs: () => IApp[],
  importFile: (
    space: string,
    file: string
  ) => Promise<GroupTransferResult | null>
) {
  const hostId = host.webContents.id;
  if (!handlers.size) {
    ipcMain.handle('sidebar-drop', (event, file: unknown, space: unknown) => {
      const handler = handlers.get(event.sender.id);
      if (!handler || event.senderFrame !== event.sender.mainFrame)
        throw new Error('Untrusted sidebar drop.');
      if (
        typeof file !== 'string' ||
        typeof space !== 'string' ||
        !space ||
        space.length > 200
      )
        throw new Error('Drop a file into a space.');
      return handler.inspect(file, space);
    });
    ipcMain.handle('sidebar-drop-create', (event, draft: DroppedGroupDraft) => {
      const handler = handlers.get(event.sender.id);
      if (!handler || event.senderFrame !== event.sender.mainFrame)
        throw new Error('Untrusted group creation.');
      return handler.create(draft);
    });
  }
  let pending: { token: string; folder: string; space: string } | undefined;
  handlers.set(hostId, {
    inspect: async (file, space) => {
      pending = undefined;
      const result = await inspectSidebarPath(file);
      if (host.isDestroyed()) throw new Error('Browser closed.');
      if (result.kind === 'import') {
        const imported = await importFile(space, result.file);
        if (imported?.tabs.length) {
          if (host.isDestroyed()) throw new Error('Browser closed.');
          const first = imported.tabs[0];
          linkProjectFolder(aiGroupId(first), path.dirname(result.file), {
            name: first.sessionName || first.name,
            slug:
              first.sessionSlug || groupSlug(first.sessionName || first.name),
          });
        }
        return { kind: 'import', imported };
      }
      pending = { token: randomUUID(), folder: result.folder, space };
      const used = new Set(aiGroups(tabs()).map((group) => group.slug));
      const base = groupSlug(result.name);
      let slug = base;
      let index = 2;
      while (used.has(slug)) {
        slug = `${base.slice(0, 55)}-${index}`;
        index += 1;
      }
      return {
        kind: 'project',
        token: pending.token,
        folder: result.folder,
        name: result.name,
        slug,
        fileName: result.fileName,
      };
    },
    create: async (draft) => {
      if (!pending || !draft || draft.token !== pending.token)
        throw new Error('Drop the project again to create its group.');
      if (
        typeof draft.name !== 'string' ||
        !draft.name.trim() ||
        draft.name.length > 200
      )
        throw new Error('Enter a group name (up to 200 characters).');
      if (
        typeof draft.slug !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) ||
        draft.slug.length > 60
      )
        throw new Error(
          'Use lowercase letters, numbers and hyphens for the AI reference.'
        );
      if (aiGroups(tabs()).some((group) => group.slug === draft.slug))
        throw new Error('That AI reference is already used.');
      const current = pending;
      const folder = await fs.promises.realpath(current.folder);
      if (!(await fs.promises.stat(folder)).isDirectory())
        throw new Error('The project folder is unavailable.');
      if (host.isDestroyed() || current !== pending)
        throw new Error('Drop the project again.');
      const tab: IApp = {
        id: randomUUID(),
        sessionId: randomUUID(),
        name: draft.name.trim(),
        sessionName: draft.name.trim(),
        sessionNameCustom: true,
        sessionSlug: draft.slug,
        url: 'about:blank',
        icon: '',
        spaceId: current.space,
        pinned: true,
      };
      linkProjectFolder(aiGroupId(tab), folder, {
        name: tab.name,
        slug: draft.slug,
      });
      pending = undefined;
      return { tab };
    },
  });
  return () => {
    pending = undefined;
    handlers.delete(hostId);
    if (!handlers.size) {
      ipcMain.removeHandler('sidebar-drop');
      ipcMain.removeHandler('sidebar-drop-create');
    }
  };
}
