export type ProjectAction =
  | 'choose-folder'
  | 'get'
  | 'link'
  | 'unlink'
  | 'terminal'
  | 'editor'
  | 'repository'
  | 'folder';
export interface DeveloperProject {
  name: string;
  path: string;
  repository?: string;
  available: boolean;
  breadcrumbs?: { name: string; path: string }[];
}
export interface ProjectEditor {
  id: string;
  name: string;
}
export interface ProjectEditors {
  editors: ProjectEditor[];
  preferred?: string;
}
export type ProjectTerminalRequest =
  | {
      action: 'open' | 'attach' | 'restart';
      tab?: string;
      cols: number;
      rows: number;
    }
  | { action: 'write'; tab?: string; data: string }
  | { action: 'resize'; tab?: string; cols: number; rows: number }
  | { action: 'close' | 'remove' | 'clear'; tab?: string }
  | { action: 'list' | 'show' }
  | { action: 'read'; tab: string }
  | { action: 'create'; cwd?: string }
  | { action: 'select'; tab: string }
  | { action: 'rename'; tab: string; name: string }
  | { action: 'preferences'; open?: boolean; height?: number };
export interface ProjectCommandReceipt {
  id: string;
  status: 'running' | 'completed' | 'interrupted';
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
}
export interface ProjectTerminalTab {
  id: string;
  name: string;
  running: boolean;
  restored: boolean;
  command?: ProjectCommandReceipt;
}
export interface ProjectTerminalState {
  command?: ProjectCommandReceipt;
  data: string;
  running: boolean;
  sequence: number;
  tabs: ProjectTerminalTab[];
  selected: string;
  open: boolean;
  height: number;
}
export interface ProjectTerminalEvent {
  group: string;
  tab?: string;
  data?: string;
  exitCode?: number;
  stopped?: boolean;
  error?: string;
  sequence: number;
}
export function projectErrorMessage(reason: unknown) {
  return String(reason)
    .replace(
      /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
      ''
    )
    .replace(/^Error: /, '');
}

export interface ProjectScript {
  id: string;
  name: string;
  command: string;
  scope: 'project' | 'global';
}
export type ProjectScriptRequest =
  | { action: 'list' }
  | {
      action: 'save';
      id?: string;
      name: string;
      command: string;
      scope: 'project' | 'global';
    }
  | { action: 'delete'; id: string }
  | { action: 'run'; id: string; cwd?: string };
export interface ProjectScriptResult {
  scripts: ProjectScript[];
  terminal?: ProjectTerminalState;
}

export type ProjectFilesRequest =
  | {
      action: 'list' | 'preview' | 'open-tab' | 'drag';
      path: string;
      hidden?: boolean;
    }
  | {
      action: 'editor' | 'reveal' | 'trash' | 'terminal' | 'terminal-tab';
      path: string;
    }
  | {
      action: 'create-file' | 'create-folder' | 'rename' | 'duplicate';
      path: string;
      name: string;
    }
  | { action: 'save'; path: string; text: string; version: string };
export interface ProjectFileEntry {
  name: string;
  path: string;
  kind: 'folder' | 'file' | 'link' | 'other';
}
export interface ProjectFilesResult {
  path: string;
  terminal?: ProjectTerminalState;
  url?: string;
  entries?: ProjectFileEntry[];
  truncated?: boolean;
  file?: {
    name: string;
    path: string;
    size: number;
    imageURL?: string;
    media?: { type: string; url: string };
    text?: string;
    version?: string;
    notice?: string;
  };
}
