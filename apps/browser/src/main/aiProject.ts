import type { BrowserWindow } from 'electron';
import {
  aiDeveloperProjectAccess,
  aiDeveloperProjectInfo,
} from './siteDeveloperLibrary';
import { projectFiles, validFilesRequest } from './projectFiles';
import {
  projectScripts,
  savedProjectScript,
  validScriptRequest,
} from './projectScripts';

import type { AIProjectTool } from '../browser/ai';
import type { AIAccessMode } from '../browser/aiPermissions';

export function requiresAIProjectApproval(
  mode: AIAccessMode,
  execution: boolean,
  read: boolean
) {
  return execution || (mode !== 'full' && !(read && mode === 'standard'));
}

export async function aiProjectTool(options: {
  host: BrowserWindow;
  sourceId: string;
  name: AIProjectTool;
  args: Record<string, unknown>;
  signal: AbortSignal;
  check: () => void;
  review: (
    message: string,
    detail: string,
    execution: boolean,
    read: boolean,
    technicalDetail?: string
  ) => Promise<void>;
}) {
  const { host, sourceId, name, args, signal, review } = options;
  options.check();
  if (name === 'get_project') {
    const project = await aiDeveloperProjectInfo(host, sourceId);
    options.check();
    if (!project)
      return {
        linked: false,
        next: 'Ask the user to link a folder in this group’s Developer settings.',
      };
    const workspace = project.available
      ? aiDeveloperProjectAccess(host, sourceId)
      : undefined;
    workspace?.check();
    if (workspace && workspace.folder !== project.path)
      throw new Error('Project folder changed. Read project settings again.');
    return {
      linked: true,
      name: project.name,
      path: project.path,
      repository: project.repository,
      available: project.available,
      ...(workspace
        ? {
            scripts: projectScripts(workspace.group, workspace.folder, {
              action: 'list',
            }).map(({ id, name: scriptName, scope }) => ({
              id,
              name: scriptName,
              scope,
            })),
            terminals: workspace.terminals.request(workspace.group, {
              action: 'list',
            }).tabs,
          }
        : {}),
      capabilities: ['project_files', 'project_scripts', 'project_terminal'],
      terminalSandboxed: false,
    };
  }
  const access = aiDeveloperProjectAccess(host, sourceId);
  const check = () => {
    signal.throwIfAborted();
    options.check();
    access.check();
  };
  const stopOnAbort = (tab: string) => {
    const stop = () => {
      try {
        access.terminals.request(access.group, { action: 'close', tab });
      } catch {
        /* Group revocation/unlink also stops its terminals. */
      }
    };
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
  };
  check();
  if (name === 'project_files') {
    const request = args.fileRequest;
    if (
      !validFilesRequest(request) ||
      ![
        'list',
        'preview',
        'save',
        'create-file',
        'create-folder',
        'rename',
        'duplicate',
        'trash',
      ].includes(request.action)
    )
      throw new Error('Choose a supported project file operation.');
    const read = ['list', 'preview'].includes(request.action);
    await review(
      `${read ? 'Read' : 'Update'} project ${
        request.action === 'list' ? 'folder' : 'file'
      }?`,
      `${access.folder}\n${request.path || '.'}\nAction: ${request.action}${
        'name' in request ? `\nName: ${request.name}` : ''
      }${
        request.action === 'save'
          ? `\nReplace contents (${request.text.length} characters).`
          : ''
      }`,
      false,
      read,
      request.action === 'save' ? request.text : undefined
    );
    check();
    const result = await projectFiles(access.folder, request, check);
    check();
    return result;
  }
  if (name === 'project_scripts') {
    const request = args.scriptRequest;
    if (
      !validScriptRequest(request) ||
      (request.action === 'save' && request.scope !== 'project')
    )
      throw new Error('AI can save scripts only in this project.');
    const script =
      request.action === 'run' ||
      request.action === 'delete' ||
      (request.action === 'save' && request.id)
        ? savedProjectScript(access.group, access.folder, request.id!)
        : undefined;
    if (script && request.action !== 'run' && script.scope !== 'project')
      throw new Error('AI cannot modify shared scripts from a project.');
    let scriptDetail = 'List available action scripts';
    if (script) scriptDetail = `${script.name}\n${script.command}`;
    else if (request.action === 'save')
      scriptDetail = `${request.name}\n${request.command}`;
    await review(
      request.action === 'run'
        ? 'Run project action script?'
        : `${
            request.action === 'list' ? 'Read' : 'Update'
          } project action scripts?`,
      `${access.folder}\n${scriptDetail}`,
      request.action === 'run',
      request.action === 'list'
    );
    check();
    if (
      script &&
      JSON.stringify(
        savedProjectScript(access.group, access.folder, script.id)
      ) !== JSON.stringify(script)
    )
      throw new Error('Script changed during approval. Review it again.');
    if (request.action === 'run' && script) {
      const terminal = access.terminals.runCommand(
        access.group,
        script.name,
        script.command
      );
      stopOnAbort(terminal.selected);
      return {
        terminal,
        next: 'Use project_terminal read with this terminal ID to inspect output. Starting a command does not mean it succeeded.',
      };
    }
    return { scripts: projectScripts(access.group, access.folder, request) };
  }
  const action = args.terminalAction;
  if (!['list', 'read', 'run', 'stop'].includes(String(action)))
    throw new Error('Choose a terminal operation.');
  if (action === 'run') {
    const { command } = args;
    if (
      typeof command !== 'string' ||
      !command.trim() ||
      command.length > 4096 ||
      Array.from(command).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
      )
    )
      throw new Error('Provide a single command, up to 4096 characters.');
    await review(
      'Run command in project terminal?',
      `${access.folder}\n\n${command}`,
      true,
      false
    );
    check();
    const terminal = access.terminals.runCommand(
      access.group,
      'AI command',
      command
    );
    stopOnAbort(terminal.selected);
    return {
      terminal,
      next: 'Read terminal output to verify results. Commands may still be running.',
    };
  }
  await review(
    action === 'stop' ? 'Stop project terminal?' : 'Read project terminal?',
    `${access.folder}\n${String(args.terminalId || 'Terminal list')}`,
    false,
    action !== 'stop'
  );
  check();
  const state = access.terminals.request(access.group, { action: 'list' });
  if (action === 'list') return { tabs: state.tabs, selected: state.selected };
  if (
    typeof args.terminalId !== 'string' ||
    !state.tabs.some((tab) => tab.id === args.terminalId)
  )
    throw new Error('Choose a terminal ID from this project.');
  if (action === 'stop')
    return access.terminals.request(access.group, {
      action: 'close',
      tab: args.terminalId,
    });
  const output = access.terminals.request(access.group, {
    action: 'read',
    tab: args.terminalId,
  });
  return {
    ...output,
    data: output.data.slice(-24000),
    truncated: output.data.length > 24000,
  };
}
