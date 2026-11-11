/* eslint-disable no-useless-constructor, no-empty-function, global-require */
import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { IPty } from 'node-pty';
import type {
  ProjectTerminalRequest,
  ProjectTerminalState,
  ProjectCommandReceipt,
} from '../browser/developerProject';
import { writePrivateFile } from './privateFile';

type Session = {
  cwd?: string;
  id: string;
  name: string;
  folder: string;
  data: string;
  running: boolean;
  sequence: number;
  restored: boolean;
  pty?: IPty;
  command?: ProjectCommandReceipt;
  commandText?: string;
};
type Workspace = {
  folder: string;
  open: boolean;
  height: number;
  selected: string;
  tabs: Session[];
};
const MAX_OUTPUT = 128 * 1024;
export class ProjectTerminals {
  private groups = new Map<string, Workspace>();

  private hosts = new Set<BrowserWindow>();

  private timer?: ReturnType<typeof setTimeout>;

  private loaded = false;

  constructor(
    host: BrowserWindow,
    private folderFor: (group: string) => string,
    private filename?: string
  ) {
    this.attachHost(host);
  }

  attachHost(host: BrowserWindow) {
    this.hosts.add(host);
  }

  detachHost(host: BrowserWindow) {
    this.hosts.delete(host);
    this.persist();
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.filename) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      if (!Array.isArray(saved)) throw new Error('Invalid terminal settings');
      saved.slice(0, 256).forEach(([group, value]: [string, Workspace]) => {
        if (
          typeof group !== 'string' ||
          !value ||
          typeof value.folder !== 'string' ||
          !Array.isArray(value.tabs)
        )
          return;
        const tabs = value.tabs
          .slice(0, 8)
          .filter(
            (tab) =>
              tab &&
              typeof tab.id === 'string' &&
              typeof tab.name === 'string' &&
              typeof tab.data === 'string'
          )
          .map((tab) => ({
            id: tab.id.slice(0, 100),
            name: tab.name.slice(0, 60),
            data: tab.data.slice(-MAX_OUTPUT),
            folder: value.folder,
            cwd: typeof tab.cwd === 'string' ? tab.cwd : undefined,
            running: false,
            restored: true,
            sequence: 0,
            command:
              tab.command &&
              typeof tab.command.id === 'string' &&
              tab.command.id.length > 0 &&
              tab.command.id.length <= 100 &&
              Number.isFinite(tab.command.startedAt) &&
              ['running', 'completed', 'interrupted'].includes(
                tab.command.status
              )
                ? {
                    id: tab.command.id,
                    startedAt: tab.command.startedAt,
                    finishedAt: Number.isFinite(tab.command.finishedAt)
                      ? tab.command.finishedAt
                      : undefined,
                    status:
                      tab.command.status === 'running'
                        ? ('interrupted' as const)
                        : tab.command.status,
                    exitCode:
                      tab.command.status === 'completed' &&
                      Number.isInteger(tab.command.exitCode)
                        ? tab.command.exitCode
                        : undefined,
                  }
                : undefined,
          }));
        this.groups.set(group, {
          folder: value.folder,
          tabs,
          open: value.open === true,
          height: Number.isFinite(value.height)
            ? Math.max(96, Math.min(2000, value.height))
            : 220,
          selected: tabs.some((tab) => tab.id === value.selected)
            ? value.selected
            : tabs[0]?.id || '',
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') {
        this.loaded = false;
        throw new Error('Could not restore terminal settings.');
      }
    }
  }

  private save() {
    if (!this.filename || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.persist();
    }, 500);
    this.timer.unref();
  }

  private persist() {
    try {
      this.flush();
    } catch {
      this.groups.forEach((workspace, group) =>
        workspace.tabs.forEach((tab) =>
          this.emit(group, tab, {
            error:
              'Could not save terminal settings. Check available disk space.',
          })
        )
      );
    }
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.filename || !this.loaded) return;
    writePrivateFile(
      this.filename,
      JSON.stringify(
        [...this.groups].map(([group, workspace]) => [
          group,
          {
            ...workspace,
            tabs: workspace.tabs.map(({ pty, commandText, ...tab }) => tab),
          },
        ])
      )
    );
  }

  private emit(group: string, session: Session, event: object) {
    this.hosts.forEach((host) => {
      if (!host.isDestroyed())
        host.webContents.send('site-developer-terminal-data', {
          group,
          tab: session.id,
          sequence: session.sequence,
          ...event,
        });
    });
  }

  private stop(group: string, session: Session) {
    const { pty } = session;
    session.pty = undefined;
    session.running = false;
    if (session.command?.status === 'running') {
      session.command.status = 'interrupted';
      session.command.finishedAt = Date.now();
    }
    session.sequence += 1;
    session.data = `${session.data}\r\nTerminal stopped.\r\n`.slice(
      -MAX_OUTPUT
    );
    this.emit(group, session, { stopped: true });
    try {
      pty?.kill();
    } catch {
      /* Already exited. */
    }
    this.save();
  }

  stopGroup(group: string) {
    this.groups.get(group)?.tabs.forEach((tab) => {
      if (tab.running) this.stop(group, tab);
    });
  }

  invalidate(group: string) {
    const workspace = this.groups.get(group);
    workspace?.tabs.forEach((tab) => {
      if (tab.running) this.stop(group, tab);
    });
    this.groups.delete(group);
    this.save();
  }

  prune(present?: Set<string>) {
    this.groups.forEach((workspace, group) => {
      try {
        if (
          (present && !present.has(group)) ||
          this.folderFor(group) !== workspace.folder
        )
          this.invalidate(group);
      } catch {
        this.invalidate(group);
      }
    });
  }

  dispose() {
    this.groups.forEach((workspace, group) =>
      workspace.tabs.forEach((tab) => {
        if (tab.running) this.stop(group, tab);
      })
    );
    this.persist();
  }

  private start(group: string, session: Session, cols: number, rows: number) {
    const count = [...this.groups.values()].reduce(
      (total, value) => total + value.tabs.filter((tab) => tab.running).length,
      0
    );
    if (count >= 32)
      throw new Error('Stop an unused terminal before opening another.');
    const shellPath =
      process.platform === 'win32'
        ? path.join(
            process.env.SystemRoot || 'C:\\Windows',
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe'
          )
        : process.env.SHELL || '/bin/sh';
    if (
      process.platform !== 'win32' &&
      (!path.isAbsolute(shellPath) || !fs.existsSync(shellPath))
    )
      throw new Error('Your login shell is unavailable.');
    const env: Record<string, string | undefined> = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    let cwd = session.folder;
    if (session.cwd) {
      const root = fs.realpathSync(session.folder);
      cwd = fs.realpathSync(session.cwd);
      const relative = path.relative(root, cwd);
      if (
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative) ||
        !fs.statSync(cwd).isDirectory()
      )
        throw new Error('Choose a folder inside the linked project.');
    }
    let shellArgs = process.platform === 'win32' ? ['-NoLogo'] : ['-l'];
    if (session.commandText !== undefined)
      shellArgs =
        process.platform === 'win32'
          ? ['-NoLogo', '-NonInteractive', '-Command', session.commandText]
          : ['-l', '-c', session.commandText];
    const pty = (require('node-pty') as typeof import('node-pty')).spawn(
      shellPath,
      shellArgs,
      { cwd, cols, rows, name: 'xterm-256color', env }
    );
    session.pty = pty;
    session.commandText = undefined;
    session.running = true;
    session.restored = false;
    pty.onData((data) => {
      if (session.pty !== pty) return;
      try {
        if (this.folderFor(group) !== session.folder) {
          this.invalidate(group);
          return;
        }
      } catch {
        this.invalidate(group);
        return;
      }
      session.data = (session.data + data).slice(-MAX_OUTPUT);
      session.sequence += 1;
      this.emit(group, session, { data });
      this.save();
    });
    pty.onExit(({ exitCode }) => {
      if (session.pty !== pty) return;
      session.running = false;
      session.pty = undefined;
      if (session.command?.status === 'running') {
        session.command.status = 'completed';
        session.command.exitCode = exitCode;
        session.command.finishedAt = Date.now();
      }
      session.sequence += 1;
      session.data =
        `${session.data}\r\nProcess exited (${exitCode}).\r\n`.slice(
          -MAX_OUTPUT
        );
      this.emit(group, session, { exitCode });
      this.save();
    });
  }

  runCommand(
    group: string,
    name: string,
    command: string,
    directory?: string
  ): ProjectTerminalState {
    this.request(group, { action: 'list' });
    const workspace = this.groups.get(group)!;
    if (workspace.tabs.length >= 8)
      throw new Error('Each group can have up to eight terminals.');
    let cwd: string | undefined;
    if (directory !== undefined) {
      if (path.isAbsolute(directory))
        throw new Error('Choose a folder inside the project.');
      const root = fs.realpathSync(workspace.folder);
      cwd = fs.realpathSync(path.resolve(root, directory));
      const relative = path.relative(root, cwd);
      if (
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative) ||
        !fs.statSync(cwd).isDirectory()
      )
        throw new Error('Choose a folder inside the project.');
    }
    const session: Session = {
      id: randomUUID(),
      cwd,
      name: name.slice(0, 60),
      folder: workspace.folder,
      data: '',
      running: false,
      sequence: 0,
      restored: false,
      command: { id: randomUUID(), status: 'running', startedAt: Date.now() },
      commandText: command,
    };
    workspace.tabs.push(session);
    workspace.selected = session.id;
    workspace.open = true;
    try {
      this.start(group, session, 80, 24);
    } catch (error) {
      workspace.tabs.pop();
      workspace.selected = workspace.tabs.at(-1)?.id || '';
      throw error;
    }
    this.save();
    return this.request(group, { action: 'list' });
  }

  request(
    group: string,
    request: ProjectTerminalRequest
  ): ProjectTerminalState {
    const folder = this.folderFor(group);
    this.load();
    let workspace = this.groups.get(group);
    if (workspace && workspace.folder !== folder) {
      this.invalidate(group);
      workspace = undefined;
    }
    if (!workspace) {
      workspace = { folder, open: false, height: 220, selected: '', tabs: [] };
      this.groups.set(group, workspace);
    }
    const create = () => {
      if (workspace!.tabs.length >= 8)
        throw new Error('Each group can have up to eight terminals.');
      const usedNames = new Set(workspace!.tabs.map((tab) => tab.name));
      let number = 1;
      while (usedNames.has(`Shell ${number}`)) number += 1;
      const session: Session = {
        id: randomUUID(),
        name: `Shell ${number}`,
        folder,
        data: '',
        running: false,
        restored: false,
        sequence: 0,
      };
      workspace!.tabs.push(session);
      workspace!.selected = session.id;
      return session;
    };
    if (request.action === 'show') {
      workspace.open = true;
      if (!workspace.tabs.length) create();
    }
    if (request.action === 'create') {
      let cwd: string | undefined;
      if (request.cwd !== undefined) {
        if (path.isAbsolute(request.cwd))
          throw new Error('Choose a folder inside the linked project.');
        const root = fs.realpathSync(folder);
        cwd = fs.realpathSync(path.resolve(root, request.cwd));
        const relative = path.relative(root, cwd);
        if (
          relative === '..' ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative) ||
          !fs.statSync(cwd).isDirectory()
        )
          throw new Error('Choose a folder inside the linked project.');
      }
      const session = create();
      session.cwd = cwd;
      if (cwd && path.basename(cwd))
        session.name =
          Array.from(path.basename(cwd))
            .map((char) =>
              char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char
            )
            .join('')
            .trim()
            .slice(0, 60) || session.name;
      workspace.open = true;
      this.start(group, session, 80, 24);
    }
    if (request.action === 'preferences') {
      if (request.open !== undefined) workspace.open = request.open;
      if (request.height !== undefined) workspace.height = request.height;
    }
    let session = workspace.tabs.find(
      (tab) =>
        tab.id ===
        ('tab' in request
          ? request.tab || workspace!.selected
          : workspace!.selected)
    );
    if (
      request.action === 'open' &&
      !session &&
      !('tab' in request && request.tab)
    )
      session = create();
    if (
      [
        'open',
        'attach',
        'restart',
        'write',
        'close',
        'remove',
        'clear',
        'select',
        'rename',
      ].includes(request.action) &&
      !session
    )
      throw new Error('Choose a terminal tab.');
    if (session) {
      if (request.action === 'select') workspace.selected = session.id;
      if (request.action === 'rename') session.name = request.name.trim();
      if (request.action === 'close') this.stop(group, session);
      if (request.action === 'remove') {
        if (session.running) this.stop(group, session);
        const index = workspace.tabs.indexOf(session);
        workspace.tabs.splice(index, 1);
        if (workspace.selected === session.id)
          workspace.selected =
            workspace.tabs[Math.min(index, workspace.tabs.length - 1)]?.id ||
            '';
      }
      if (request.action === 'restart') {
        if (session.running) this.stop(group, session);
        session.data = '';
        this.start(group, session, request.cols, request.rows);
      }
      if (
        !session.running &&
        (request.action === 'open' ||
          (request.action === 'attach' && !session.restored && !session.data))
      )
        this.start(group, session, request.cols, request.rows);
      if (request.action === 'write') {
        if (!session.pty) this.start(group, session, 80, 24);
        if (!session.pty) throw new Error('Could not open a terminal shell.');
        session.pty.write(request.data);
      }
      if (request.action === 'clear') {
        session.data = '';
        session.sequence += 1;
        this.emit(group, session, { data: '\x1b[2J\x1b[3J\x1b[H' });
      }
      if (
        ['resize', 'open', 'attach'].includes(request.action) &&
        'cols' in request
      )
        session.pty?.resize(request.cols, request.rows);
    }
    if (!['write', 'resize', 'list', 'attach'].includes(request.action))
      this.save();
    if (
      ['preferences', 'rename', 'select', 'remove', 'show', 'create'].includes(
        request.action
      )
    ) {
      try {
        this.flush();
      } catch {
        throw new Error(
          'Could not save terminal settings. Check available disk space.'
        );
      }
    }
    return {
      ...(session?.command ? { command: { ...session.command } } : {}),
      data: ['open', 'attach', 'restart', 'read'].includes(request.action)
        ? session?.data || ''
        : '',
      running: session?.running || false,
      sequence: session?.sequence || 0,
      tabs: workspace.tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        running: tab.running,
        restored: tab.restored,
        ...(tab.command ? { command: { ...tab.command } } : {}),
      })),
      selected: workspace.selected,
      open: workspace.open,
      height: workspace.height,
    };
  }
}

let shared: ProjectTerminals | undefined;
export function sharedProjectTerminals(
  host: BrowserWindow,
  folderFor: (group: string) => string
) {
  if (!shared) {
    shared = new ProjectTerminals(
      host,
      folderFor,
      path.join(app.getPath('userData'), 'developer-terminals.json')
    );
    app.on('before-quit', () => shared?.dispose());
  } else shared.attachHost(host);
  return shared;
}

export function validTerminalRequest(
  value: unknown
): value is ProjectTerminalRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as ProjectTerminalRequest;
  if (
    'tab' in request &&
    request.tab !== undefined &&
    (typeof request.tab !== 'string' ||
      !request.tab ||
      request.tab.length > 100)
  )
    return false;
  if (request.action === 'create')
    return (
      request.cwd === undefined ||
      (typeof request.cwd === 'string' &&
        request.cwd.length <= 4096 &&
        !request.cwd.includes('\0'))
    );
  if (
    ['list', 'show', 'create', 'close', 'remove', 'clear'].includes(
      request.action
    )
  )
    return true;
  if (request.action === 'select' || request.action === 'read')
    return typeof request.tab === 'string';
  if (request.action === 'rename')
    return (
      typeof request.tab === 'string' &&
      typeof request.name === 'string' &&
      !!request.name.trim() &&
      request.name.length <= 60 &&
      !Array.from(request.name).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
      )
    );
  if (request.action === 'preferences')
    return (
      (request.open === undefined || typeof request.open === 'boolean') &&
      (request.height === undefined ||
        (Number.isFinite(request.height) &&
          request.height >= 96 &&
          request.height <= 2000))
    );
  if (request.action === 'write')
    return typeof request.data === 'string' && request.data.length <= 64 * 1024;
  if (
    request.action === 'open' ||
    request.action === 'attach' ||
    request.action === 'restart' ||
    request.action === 'resize'
  )
    return (
      Number.isInteger(request.cols) &&
      Number.isInteger(request.rows) &&
      request.cols >= 2 &&
      request.cols <= 500 &&
      request.rows >= 1 &&
      request.rows <= 200
    );
  return false;
}
