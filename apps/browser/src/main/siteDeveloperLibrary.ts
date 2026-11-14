import {
  app,
  BrowserWindow,
  ipcMain,
  WebContents,
  IpcMainInvokeEvent,
} from 'electron';
import { fileURLToPath } from 'url';
import { discoverProjectScripts } from './projectScriptDiscovery';
import { registerSidebarDrop } from './sidebarDrop';
import { transferGroup } from './groupTransfer';
import type { IApp } from '../types';
import type { SiteDeveloperPageSummary } from '../browser/siteDeveloper';
import { groupTabs, loginProfileKey } from '../utils/groups';
import {
  getSiteSettings,
  siteOrigin,
  onSiteSettingsChanged,
} from './siteSettings';
import { developerState, onDeveloperStateChanged } from './siteDeveloper';
import { isGroupLocked, getGroupLocks } from './groupLocks';
import { aiGroupId, aiGroups } from '../browser/aiGroups';
import {
  projectAction,
  linkedProjectFolder,
  onProjectChanged,
} from './developerProject';
import { installedEditors, chooseProjectEditor } from './projectEditors';
import {
  ProjectTerminals,
  sharedProjectTerminals,
  validTerminalRequest,
} from './projectTerminal';
import { projectFiles, validFilesRequest } from './projectFiles';
import {
  projectScripts,
  importProjectScripts,
  onProjectScriptsChanged,
  savedProjectScript,
  validScriptRequest,
} from './projectScripts';
import type {
  DeveloperProject,
  ProjectAction,
} from '../browser/developerProject';

export function developerPageSummaries(
  tabs: IApp[],
  source: IApp,
  contents: (id: string) => WebContents | undefined
): SiteDeveloperPageSummary[] {
  if (isGroupLocked(source))
    throw new Error('Unlock this group to manage its hooks.');
  return groupTabs(tabs, source).map((tab) => {
    const candidate = contents(tab.id);
    const page = candidate && !candidate.isDestroyed() ? candidate : undefined;
    const url = page?.getURL() || tab.url;
    const origin = siteOrigin(url);
    const config = origin
      ? getSiteSettings(loginProfileKey(tab), origin).developer
      : undefined;
    const execution = page && origin ? developerState(page, origin) : undefined;
    return {
      id: tab.id,
      name: tab.customName || tab.name,
      url,
      origin,
      hooks: config
        ? [
            ...(config.actions?.length ||
            [config.before, config.after, config.css].some((code) =>
              code.trim()
            )
              ? [
                  {
                    status: execution?.hookStatuses?.[''] || 'waiting',
                    id: '',
                    name: config.name || 'Default hook',
                    path: '/*',
                    enabled: config.enabled && config.defaultEnabled !== false,
                  },
                ]
              : []),
            ...(config.hooks || []).map((hook) => ({
              status: execution?.hookStatuses?.[hook.id] || 'waiting',
              id: hook.id,
              name: hook.name || 'Untitled hook',
              path: hook.path,
              enabled: config.enabled && hook.enabled,
            })),
          ]
        : [],
      hasHooks:
        !!config &&
        (!!config.actions?.length ||
          !!config.hooks?.length ||
          [
            config.before,
            config.after,
            config.css,
            ...(config.hooks || []).flatMap((hook) => [
              hook.before,
              hook.after,
              hook.css,
            ]),
          ].some((code) => !!code.trim())),
      enabled: config?.enabled || false,
      status: execution?.status || 'waiting',
    };
  });
}
const libraries = new Map<number, (id: string) => SiteDeveloperPageSummary[]>();
const projects = new Map<
  number,
  (
    id: string,
    action: ProjectAction,
    editorId?: string,
    folderPath?: string
  ) => Promise<DeveloperProject | null>
>();
const transfers = new Map<
  number,
  (
    action: unknown,
    id: unknown,
    filePath?: string
  ) => ReturnType<typeof transferGroup>
>();
const projectHosts = new Map<
  number,
  {
    host: BrowserWindow;
    terminals: ProjectTerminals;
    validateGroup: (group: string) => string;
    groupForSource: (id: string) => string;
  }
>();
export function registerSiteDeveloperLibrary(
  host: BrowserWindow,
  tabs: () => IApp[],
  contents: (id: string) => WebContents | undefined
) {
  if (!libraries.size)
    ipcMain.handle('group-transfer', (event, action: unknown, id: unknown) => {
      const handler = transfers.get(event.sender.id);
      if (!handler || event.senderFrame !== event.sender.mainFrame)
        throw new Error('Untrusted group transfer.');
      return handler(action, id);
    });
  const offDrop = registerSidebarDrop(host, tabs, (space, file) =>
    transfers.get(host.webContents.id)!('import', space, file)
  );
  let transferring = false;
  transfers.set(host.webContents.id, async (action, id, filePath) => {
    if (transferring)
      throw new Error('Finish the current group transfer first.');
    transferring = true;
    try {
      return await transferGroup(host, tabs, action, id, filePath);
    } finally {
      transferring = false;
    }
  });
  if (!projects.size) {
    const trusted = (event: IpcMainInvokeEvent) => {
      const owner = projectHosts.get(event.sender.id);
      if (!owner || event.senderFrame !== event.sender.mainFrame)
        throw new Error('Untrusted project request.');
      return owner;
    };
    ipcMain.handle(
      'site-developer-files',
      async (event, id: unknown, request: unknown) => {
        const owner = trusted(event);
        if (
          typeof id !== 'string' ||
          !id ||
          id.length > 1024 ||
          !validFilesRequest(request)
        )
          throw new Error('Invalid file request.');
        const group = owner.groupForSource(id);
        const folder = owner.validateGroup(group);
        const ensureAccess = () => {
          if (
            owner.host.isDestroyed() ||
            owner.groupForSource(id) !== group ||
            owner.validateGroup(group) !== folder
          )
            throw new Error('This project changed. Reopen Files.');
        };
        const result = await projectFiles(folder, request, ensureAccess);
        if (request.action === 'drag') {
          if (!result.url) throw new Error('Could not drag this file.');
          const file = fileURLToPath(result.url);
          const icon = await app.getFileIcon(file, { size: 'normal' });
          // Revalidate the file and project after the asynchronous icon lookup.
          const checked = await projectFiles(folder, request, ensureAccess);
          if (checked.url !== result.url)
            throw new Error('This file changed. Refresh the folder.');
          ensureAccess();
          event.sender.startDrag({ file, icon });
          return { path: result.path };
        }
        if (request.action === 'terminal-tab') {
          ensureAccess();
          return {
            ...result,
            terminal: owner.terminals.request(group, {
              action: 'create',
              cwd: result.path,
            }),
          };
        }
        return result;
      }
    );
    ipcMain.handle(
      'site-developer-scripts',
      (event, id: unknown, request: unknown) => {
        const owner = trusted(event);
        if (
          typeof id !== 'string' ||
          !id ||
          id.length > 1024 ||
          !validScriptRequest(request)
        )
          throw new Error('Invalid script request.');
        const group = owner.groupForSource(id);
        const folder = owner.validateGroup(group);
        if (request.action === 'discover' || request.action === 'import') {
          return (async () => {
            const ensureAccess = () => {
              if (
                owner.host.isDestroyed() ||
                owner.groupForSource(id) !== group ||
                owner.validateGroup(group) !== folder
              )
                throw new Error('This project changed. Reopen Scripts.');
            };
            const found = await discoverProjectScripts(folder, ensureAccess);
            ensureAccess();
            const saved = projectScripts(group, folder, { action: 'list' });
            if (request.action === 'discover')
              return {
                scripts: saved,
                ...found,
                candidates: found.candidates.map((candidate) => ({
                  ...candidate,
                  saved: saved.some(
                    (script) =>
                      script.scope === 'project' &&
                      script.command === candidate.command
                  ),
                })),
              };
            const selected = new Set(request.ids);
            const candidates = found.candidates.filter((candidate) =>
              selected.has(candidate.id)
            );
            if (candidates.length !== selected.size)
              throw new Error('Project tasks changed. Scan the project again.');
            return importProjectScripts(group, folder, candidates);
          })();
        }
        if (request.action === 'run') {
          const script = savedProjectScript(group, folder, request.id);
          const terminal = owner.terminals.runCommand(
            group,
            script.name,
            script.command,
            request.cwd
          );
          return {
            scripts: projectScripts(group, folder, { action: 'list' }),
            terminal,
          };
        }
        return { scripts: projectScripts(group, folder, request) };
      }
    );
    ipcMain.handle('site-developer-editors', (event, choose: unknown) => {
      const owner = trusted(event);
      if (choose !== undefined && choose !== true)
        throw new Error('Invalid editor request.');
      return choose ? chooseProjectEditor(owner.host) : installedEditors();
    });
    ipcMain.handle(
      'site-developer-terminal',
      (event, group: unknown, request: unknown) => {
        const owner = trusted(event);
        if (
          typeof group !== 'string' ||
          group.length > 1024 ||
          !validTerminalRequest(request)
        )
          throw new Error('Invalid terminal request.');
        owner.validateGroup(group);
        return owner.terminals.request(group, request);
      }
    );
    ipcMain.handle(
      'site-developer-project',
      (
        event,
        id: unknown,
        action: unknown,
        editorId: unknown,
        folderPath: unknown
      ) => {
        const handler = projects.get(event.sender.id);
        if (!handler || event.senderFrame !== event.sender.mainFrame)
          throw new Error('Untrusted project request.');
        if (
          typeof id !== 'string' ||
          !id ||
          id.length > 1024 ||
          typeof action !== 'string' ||
          ![
            'choose-folder',
            'get',
            'link',
            'unlink',
            'terminal',
            'editor',
            'repository',
            'folder',
          ].includes(action)
        )
          throw new Error('Choose a project action.');
        if (
          editorId !== undefined &&
          (typeof editorId !== 'string' || editorId.length > 4096)
        )
          throw new Error('Invalid editor.');
        if (
          folderPath !== undefined &&
          (!['folder', 'link'].includes(action as string) ||
            typeof folderPath !== 'string' ||
            folderPath.length > 4096)
        )
          throw new Error('Invalid folder breadcrumb.');
        return handler(
          id,
          action as ProjectAction,
          editorId as string | undefined,
          folderPath as string | undefined
        );
      }
    );
  }
  if (!libraries.size)
    ipcMain.handle('site-developer-pages', (event, id: unknown) => {
      const library = libraries.get(event.sender.id);
      if (!library || event.senderFrame !== event.sender.mainFrame)
        throw new Error('Untrusted developer library request.');
      if (typeof id !== 'string' || !id || id.length > 1024)
        throw new Error('Choose a group.');
      return library(id);
    });
  const hostId = host.webContents.id;
  const validateGroup = (group: string) => {
    const source = tabs().find(
      (tab) => !tab.archived && aiGroupId(tab) === group
    );
    if (!source) throw new Error('This group is no longer available.');
    if (isGroupLocked(source))
      throw new Error('Unlock this group to use its terminal.');
    const folder = linkedProjectFolder(group);
    if (!folder) throw new Error('Link a project folder first.');
    return folder;
  };
  const terminals = sharedProjectTerminals(host, (group) => {
    const folder = linkedProjectFolder(group);
    if (!folder) throw new Error('Link a project folder first.');
    return folder;
  });
  const groupForSource = (id: string) => {
    const source = tabs().find((tab) => tab.id === id && !tab.archived);
    if (!source) throw new Error('This group is no longer available.');
    return aiGroupId(source);
  };
  projectHosts.set(hostId, { host, terminals, validateGroup, groupForSource });
  const audit = () => {
    tabs().forEach((tab) => {
      if (isGroupLocked(tab)) terminals.stopGroup(aiGroupId(tab));
    });
    terminals.prune(new Set(tabs().map(aiGroupId)));
  };
  const offLocks = getGroupLocks().subscribe(audit);
  const terminalAudit = setInterval(audit, 2000);
  terminalAudit.unref();
  let chosenFolder: string | undefined;
  projects.set(hostId, async (id, action, editorId, folderPath) => {
    if (action === 'choose-folder') {
      const selection = await projectAction(host, '', action, () => {
        if (host.isDestroyed()) throw new Error('Window closed.');
      });
      chosenFolder = selection?.path;
      return selection;
    }
    if (action === 'link' && folderPath !== undefined) {
      if (folderPath !== chosenFolder)
        throw new Error('Choose the project folder again.');
      chosenFolder = undefined;
    }
    const synchronizedSource = async (
      attempt = 0
    ): Promise<IApp | undefined> => {
      const source = tabs().find((tab) => tab.id === id && !tab.archived);
      if (source || attempt >= 10 || host.isDestroyed()) return source;
      // Imports can open settings before their renderer layout sync arrives.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
      });
      return synchronizedSource(attempt + 1);
    };
    const source = await synchronizedSource();
    if (!source) throw new Error('This group is no longer available.');
    const key = aiGroupId(source);
    const result = await projectAction(
      host,
      key,
      action,
      () => {
        const current = tabs().find((tab) => tab.id === id && !tab.archived);
        if (host.isDestroyed() || !current || aiGroupId(current) !== key)
          throw new Error('This group is no longer available.');
        if (isGroupLocked(current))
          throw new Error('Unlock this group to use its project.');
      },
      editorId,
      folderPath,
      aiGroups(tabs()).find((group) => group.id === key)
    );
    if (action === 'link' || action === 'unlink') terminals.prune();
    return result;
  });
  libraries.set(hostId, (id) => {
    const items = tabs();
    const source = items.find((tab) => tab.id === id && !tab.archived);
    if (!source) throw new Error('This group is no longer available.');
    return developerPageSummaries(items, source, contents);
  });
  const offScripts = onProjectScriptsChanged(() => {
    if (!host.isDestroyed())
      host.webContents.send('site-developer-library-changed');
  });
  const offProjects = onProjectChanged((key) => {
    if (
      !host.isDestroyed() &&
      tabs().some((tab) => !tab.archived && aiGroupId(tab) === key)
    )
      host.webContents.send('site-developer-library-changed');
  });
  const offRuntime = onDeveloperStateChanged?.((page) => {
    if (!host.isDestroyed() && tabs().some((tab) => contents(tab.id) === page))
      host.webContents.send('site-developer-library-changed');
  });
  const offChanges = onSiteSettingsChanged((profile) => {
    if (
      !host.isDestroyed() &&
      tabs().some((tab) => !tab.archived && loginProfileKey(tab) === profile)
    )
      host.webContents.send('site-developer-library-changed');
  });
  return () => {
    offDrop();
    offProjects();
    offScripts();
    offChanges();
    offRuntime?.();
    libraries.delete(hostId);
    transfers.delete(hostId);
    if (!transfers.size) ipcMain.removeHandler('group-transfer');
    projects.delete(hostId);
    projectHosts.delete(hostId);
    offLocks();
    clearInterval(terminalAudit);
    audit();
    terminals.detachHost(host);
    if (!projects.size)
      [
        'site-developer-project',
        'site-developer-editors',
        'site-developer-terminal',
        'site-developer-scripts',
        'site-developer-files',
      ].forEach((channel) => ipcMain.removeHandler(channel));
    if (!libraries.size) ipcMain.removeHandler('site-developer-pages');
  };
}

/** Reuse the Developer panel's group/folder authority for in-app AI tools. */
export function aiDeveloperProjectAccess(
  host: BrowserWindow,
  sourceId: string
) {
  const owner = projectHosts.get(host.webContents.id);
  const project = projects.get(host.webContents.id);
  if (!owner || !project) throw new Error('Developer project is unavailable.');
  const group = owner.groupForSource(sourceId);
  const folder = owner.validateGroup(group);
  const check = () => {
    if (
      host.isDestroyed() ||
      owner.groupForSource(sourceId) !== group ||
      owner.validateGroup(group) !== folder
    )
      throw new Error('Project or group access changed.');
  };
  return {
    group,
    folder,
    check,
    terminals: owner.terminals,
    project: () => project(sourceId, 'get'),
  };
}

export function aiDeveloperProjectInfo(host: BrowserWindow, sourceId: string) {
  const project = projects.get(host.webContents.id);
  if (!project) throw new Error('Developer project is unavailable.');
  return project(sourceId, 'get');
}
