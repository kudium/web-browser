export type ProjectAction =
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
export interface ProjectTerminalTab {
  id: string;
  name: string;
  running: boolean;
  restored: boolean;
}
export interface ProjectTerminalState {
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
  | { action: 'delete' | 'run'; id: string };
export interface ProjectScriptResult {
  scripts: ProjectScript[];
  terminal?: ProjectTerminalState;
}

export type ProjectFilesRequest =
  | { action: 'list' | 'preview'; path: string; hidden?: boolean }
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
  entries?: ProjectFileEntry[];
  truncated?: boolean;
  file?: {
    name: string;
    path: string;
    size: number;
    text?: string;
    version?: string;
    notice?: string;
  };
}
