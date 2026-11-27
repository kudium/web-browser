/**
 * `kudium.workspace.json`: one declarative configuration document per group,
 * kept in the linked project folder. The browser exports it from its state,
 * an agent can author it, and `apply_workspace_config` / `setup_project`
 * apply it after one native diff review. Secrets never live here: a script
 * that needs one references a Personal Data record by name instead.
 */
import { aiOrigin } from './aiTaint';

export const WORKSPACE_MANIFEST_FILE = 'kudium.workspace.json';
export const WORKSPACE_MANIFEST_VERSION = 1;
export const WORKSPACE_MANIFEST_MAX_BYTES = 256 * 1024;

export const WORKSPACE_PERMISSIONS = [
  'geolocation',
  'notifications',
  'camera',
  'microphone',
  'display-capture',
  'clipboard-read',
  'fullscreen',
  'midi',
] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];
export type WorkspacePermissionChoice = 'ask' | 'allow' | 'block';

export interface WorkspaceGroup {
  name: string;
  /** The `@slug` agents use in references; informational when generated. */
  slug?: string;
  display?: 'folder' | 'stack';
  sessionMode?: 'separate' | 'collection';
}
export interface WorkspaceTab {
  url: string;
  title?: string;
  pinned?: boolean;
}
export interface WorkspaceScript {
  /** Stable id inside the file (`dev-web`); the browser keeps its own ids. */
  id: string;
  name: string;
  command: string;
  /** Reserved: shortcuts are not bound by the browser yet. */
  shortcut?: string;
}
export interface WorkspaceTerminal {
  name: string;
  cwd?: string;
}
export interface WorkspaceAI {
  mode?: 'ask' | 'standard' | 'full';
  trusted?: boolean;
  /** Named sessions an agent can refer to; each lists the tab URLs it covers. */
  sessions?: Record<string, { tabs: string[]; description?: string }>;
}
export interface WorkspaceManifest {
  version: typeof WORKSPACE_MANIFEST_VERSION;
  group?: WorkspaceGroup;
  project?: { path?: string; editor?: string };
  tabs?: WorkspaceTab[];
  scripts?: WorkspaceScript[];
  terminals?: WorkspaceTerminal[];
  siteSettings?: Record<string, Partial<Record<WorkspacePermission, WorkspacePermissionChoice>>>;
  /** Skill files or folders inside the project (`.kudium/skills/qa`). */
  skills?: string[];
  ai?: WorkspaceAI;
}

const TOP_LEVEL = ['version', 'group', 'project', 'tabs', 'scripts', 'terminals', 'siteSettings', 'skills', 'ai'];
const SECRET_KEY = /(password|passwd|secret|token|api[-_]?key|credential|private[-_]?key)/i;
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(message: string): never {
  throw new Error(`Invalid workspace manifest: ${message}`);
}
function record(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${where} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], where: string) {
  Object.keys(value).forEach((key) => {
    if (SECRET_KEY.test(key)) fail(`${where}.${key} looks like a secret; reference a Personal Data record by name instead.`);
    if (!allowed.includes(key)) fail(`${where} has an unsupported key "${key}".`);
  });
}
function text(value: unknown, where: string, max: number, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || (required && !value.trim())) fail(`${where} must be ${required ? 'a non-empty' : 'a'} string.`);
  if (value.length > max) fail(`${where} is longer than ${max} characters.`);
  if (CONTROL.test(value)) fail(`${where} contains control characters.`);
  return value;
}
function relativePath(value: unknown, where: string): string {
  const path = text(value, where, 1024)!.replace(/\\/g, '/');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.split('/').some((part) => part === '..'))
    fail(`${where} must stay inside the project folder.`);
  return path;
}
function choice<T extends string>(value: unknown, options: readonly T[], where: string, required = false): T | undefined {
  if (value === undefined && !required) return undefined;
  if (!options.includes(value as T)) fail(`${where} must be one of ${options.join(', ')}.`);
  return value as T;
}
function list(value: unknown, where: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${where} must be a list.`);
  if (value.length > max) fail(`${where} has more than ${max} entries.`);
  return value;
}

export function workspaceURL(value: unknown, where = 'tabs[].url'): string {
  const raw = text(value, where, 2048)!;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail(`${where} must be an absolute http(s) URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    fail(`${where} must be an http(s) URL without credentials.`);
  return url.href;
}

/** Normalise an origin key (`localhost:5173`, `https://app.test`) to an origin. */
export function workspaceOrigin(key: string): string | undefined {
  const candidate = /^[a-z]+:\/\//i.test(key) ? key : `http://${key}`;
  return aiOrigin(candidate);
}

/** Strict validation: unknown keys, secrets and absolute paths are rejected. */
export function validateWorkspaceManifest(value: unknown): WorkspaceManifest {
  const root = record(value, 'manifest');
  keys(root, TOP_LEVEL, 'manifest');
  if (root.version !== WORKSPACE_MANIFEST_VERSION) fail(`version must be ${WORKSPACE_MANIFEST_VERSION}.`);
  const manifest: WorkspaceManifest = { version: WORKSPACE_MANIFEST_VERSION };
  if (root.group !== undefined) {
    const group = record(root.group, 'group');
    keys(group, ['name', 'slug', 'display', 'sessionMode'], 'group');
    manifest.group = {
      name: text(group.name, 'group.name', 100)!.trim(),
      ...(group.slug !== undefined ? { slug: text(group.slug, 'group.slug', 100)! } : {}),
      ...(group.display !== undefined ? { display: choice(group.display, ['folder', 'stack'], 'group.display') } : {}),
      ...(group.sessionMode !== undefined
        ? { sessionMode: choice(group.sessionMode, ['separate', 'collection'], 'group.sessionMode') }
        : {}),
    };
  }
  if (root.project !== undefined) {
    const project = record(root.project, 'project');
    keys(project, ['path', 'editor'], 'project');
    manifest.project = {
      ...(project.path !== undefined ? { path: relativePath(project.path, 'project.path') } : {}),
      ...(project.editor !== undefined ? { editor: text(project.editor, 'project.editor', 60)! } : {}),
    };
  }
  if (root.tabs !== undefined) {
    manifest.tabs = list(root.tabs, 'tabs', 64).map((entry, index) => {
      const tab = record(entry, `tabs[${index}]`);
      keys(tab, ['url', 'title', 'pinned'], `tabs[${index}]`);
      if (tab.pinned !== undefined && typeof tab.pinned !== 'boolean') fail(`tabs[${index}].pinned must be boolean.`);
      return {
        url: workspaceURL(tab.url, `tabs[${index}].url`),
        ...(tab.title !== undefined ? { title: text(tab.title, `tabs[${index}].title`, 200)! } : {}),
        ...(tab.pinned !== undefined ? { pinned: tab.pinned as boolean } : {}),
      };
    });
  }
  if (root.scripts !== undefined) {
    const seen = new Set<string>();
    manifest.scripts = list(root.scripts, 'scripts', 64).map((entry, index) => {
      const script = record(entry, `scripts[${index}]`);
      keys(script, ['id', 'name', 'command', 'shortcut'], `scripts[${index}]`);
      const id = text(script.id, `scripts[${index}].id`, 100)!;
      if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(id)) fail(`scripts[${index}].id must be a short slug.`);
      if (seen.has(id)) fail(`scripts has a duplicate id "${id}".`);
      seen.add(id);
      return {
        id,
        name: text(script.name, `scripts[${index}].name`, 60)!.trim(),
        command: text(script.command, `scripts[${index}].command`, 4096)!.trim(),
        ...(script.shortcut !== undefined ? { shortcut: text(script.shortcut, `scripts[${index}].shortcut`, 40)! } : {}),
      };
    });
  }
  if (root.terminals !== undefined) {
    manifest.terminals = list(root.terminals, 'terminals', 16).map((entry, index) => {
      const terminal = record(entry, `terminals[${index}]`);
      keys(terminal, ['name', 'cwd'], `terminals[${index}]`);
      return {
        name: text(terminal.name, `terminals[${index}].name`, 60)!,
        ...(terminal.cwd !== undefined ? { cwd: relativePath(terminal.cwd, `terminals[${index}].cwd`) } : {}),
      };
    });
  }
  if (root.siteSettings !== undefined) {
    const sites = record(root.siteSettings, 'siteSettings');
    if (Object.keys(sites).length > 64) fail('siteSettings has more than 64 sites.');
    manifest.siteSettings = Object.fromEntries(
      Object.entries(sites).map(([site, entry]) => {
        text(site, 'siteSettings key', 253);
        if (!workspaceOrigin(site)) fail(`siteSettings "${site}" is not a website origin.`);
        const permissions = record(entry, `siteSettings["${site}"]`);
        keys(permissions, [...WORKSPACE_PERMISSIONS], `siteSettings["${site}"]`);
        return [
          site,
          Object.fromEntries(
            Object.entries(permissions).map(([permission, value]) => [
              permission,
              choice(value, ['ask', 'allow', 'block'], `siteSettings["${site}"].${permission}`, true)!,
            ])
          ),
        ];
      })
    );
  }
  if (root.skills !== undefined)
    manifest.skills = list(root.skills, 'skills', 20).map((entry, index) => relativePath(entry, `skills[${index}]`));
  if (root.ai !== undefined) {
    const ai = record(root.ai, 'ai');
    keys(ai, ['mode', 'trusted', 'sessions'], 'ai');
    if (ai.trusted !== undefined && typeof ai.trusted !== 'boolean') fail('ai.trusted must be boolean.');
    manifest.ai = {
      ...(ai.mode !== undefined ? { mode: choice(ai.mode, ['ask', 'standard', 'full'], 'ai.mode') } : {}),
      ...(ai.trusted !== undefined ? { trusted: ai.trusted as boolean } : {}),
    };
    if (ai.sessions !== undefined) {
      const sessions = record(ai.sessions, 'ai.sessions');
      if (Object.keys(sessions).length > 32) fail('ai.sessions has more than 32 entries.');
      manifest.ai.sessions = Object.fromEntries(
        Object.entries(sessions).map(([name, entry]) => {
          text(name, 'ai.sessions key', 60);
          const session = record(entry, `ai.sessions["${name}"]`);
          keys(session, ['tabs', 'description'], `ai.sessions["${name}"]`);
          return [
            name,
            {
              tabs: list(session.tabs, `ai.sessions["${name}"].tabs`, 64).map((url, index) =>
                workspaceURL(url, `ai.sessions["${name}"].tabs[${index}]`)
              ),
              ...(session.description !== undefined
                ? { description: text(session.description, `ai.sessions["${name}"].description`, 400)! }
                : {}),
            },
          ];
        })
      );
    }
  }
  return manifest;
}

/** Origins the group owns for the taint rule: its manifest tabs. */
export function workspaceOwnOrigins(manifest: WorkspaceManifest | undefined): string[] {
  if (!manifest) return [];
  const origins = new Set<string>();
  (manifest.tabs || []).forEach((tab) => {
    const origin = aiOrigin(tab.url);
    if (origin) origins.add(origin);
  });
  Object.keys(manifest.siteSettings || {}).forEach((site) => {
    const origin = workspaceOrigin(site);
    if (origin) origins.add(origin);
  });
  return [...origins];
}

export interface WorkspaceBrowserState {
  group: WorkspaceGroup;
  tabs: WorkspaceTab[];
  scripts: { name: string; command: string }[];
  siteSettings: Record<string, Partial<Record<WorkspacePermission, WorkspacePermissionChoice>>>;
  editor?: string;
  trusted?: boolean;
  /** Keys the browser does not model (skills, terminals, sessions) are kept from the file. */
  file?: WorkspaceManifest;
}

export function workspaceScriptId(name: string, used = new Set<string>()) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'script';
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

/** The effective manifest: the browser's state, carrying over file-only keys. */
export function manifestFromBrowserState(state: WorkspaceBrowserState): WorkspaceManifest {
  const used = new Set<string>();
  const fileScripts = state.file?.scripts || [];
  const manifest: WorkspaceManifest = {
    version: WORKSPACE_MANIFEST_VERSION,
    group: { ...state.group },
    project: { path: '.', ...(state.editor ? { editor: state.editor } : {}), ...(state.file?.project || {}) },
    tabs: state.tabs.map((tab) => ({
      url: tab.url,
      ...(tab.title ? { title: tab.title } : {}),
      ...(tab.pinned ? { pinned: true } : {}),
    })),
    scripts: state.scripts.map((script) => {
      const existing = fileScripts.find((entry) => entry.command === script.command);
      if (existing) {
        used.add(existing.id);
        return { ...existing, name: script.name };
      }
      return { id: workspaceScriptId(script.name, used), name: script.name, command: script.command };
    }),
  };
  if (state.file?.terminals) manifest.terminals = state.file.terminals;
  if (Object.keys(state.siteSettings).length) manifest.siteSettings = state.siteSettings;
  if (state.file?.skills) manifest.skills = state.file.skills;
  const ai: WorkspaceAI = { ...(state.file?.ai || {}) };
  if (state.trusted !== undefined) ai.trusted = state.trusted;
  if (Object.keys(ai).length) manifest.ai = ai;
  return manifest;
}

export interface WorkspaceDiff {
  group: string[];
  project: string[];
  tabs: { open: WorkspaceTab[]; pin: WorkspaceTab[] };
  scripts: { add: WorkspaceScript[]; change: { previous: WorkspaceScript; next: WorkspaceScript }[] };
  siteSettings: string[];
  terminals: string[];
  skills: string[];
  /** Widens what the agent may do; confirmed separately. */
  ai: string[];
}

const sameURL = (a: string, b: string) => {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = '';
    right.hash = '';
    return left.href.replace(/\/$/, '') === right.href.replace(/\/$/, '');
  } catch {
    return a === b;
  }
};

/** What applying `next` over `current` changes. Nothing is ever removed. */
export function diffWorkspaceManifest(
  current: WorkspaceManifest | undefined,
  next: WorkspaceManifest
): WorkspaceDiff {
  const diff: WorkspaceDiff = {
    group: [],
    project: [],
    tabs: { open: [], pin: [] },
    scripts: { add: [], change: [] },
    siteSettings: [],
    terminals: [],
    skills: [],
    ai: [],
  };
  const before = current || { version: WORKSPACE_MANIFEST_VERSION };
  if (next.group) {
    (['name', 'display', 'sessionMode'] as const).forEach((field) => {
      if (next.group![field] !== undefined && next.group![field] !== before.group?.[field])
        diff.group.push(`${field}: ${before.group?.[field] ?? '(unset)'} → ${next.group![field]}`);
    });
  }
  if (next.project?.editor && next.project.editor !== before.project?.editor)
    diff.project.push(`editor: ${before.project?.editor ?? '(unset)'} → ${next.project.editor}`);
  (next.tabs || []).forEach((tab) => {
    const open = (before.tabs || []).find((entry) => sameURL(entry.url, tab.url));
    if (!open) diff.tabs.open.push(tab);
    else if (tab.pinned && !open.pinned) diff.tabs.pin.push(tab);
  });
  (next.scripts || []).forEach((script) => {
    const existing = (before.scripts || []).find(
      (entry) => entry.id === script.id || entry.command === script.command
    );
    if (!existing) diff.scripts.add.push(script);
    else if (existing.command !== script.command || existing.name !== script.name)
      diff.scripts.change.push({ previous: existing, next: script });
  });
  Object.entries(next.siteSettings || {}).forEach(([site, permissions]) => {
    Object.entries(permissions).forEach(([permission, value]) => {
      const previous = before.siteSettings?.[site]?.[permission as WorkspacePermission] ?? 'ask';
      if (previous !== value) diff.siteSettings.push(`${site} ${permission}: ${previous} → ${value}`);
    });
  });
  (next.terminals || []).forEach((terminal) => {
    if (!(before.terminals || []).some((entry) => entry.name === terminal.name))
      diff.terminals.push(`${terminal.name}${terminal.cwd ? ` (${terminal.cwd})` : ''}`);
  });
  (next.skills || []).forEach((skill) => {
    if (!(before.skills || []).includes(skill)) diff.skills.push(skill);
  });
  if (next.ai) {
    if (next.ai.mode !== undefined && next.ai.mode !== before.ai?.mode)
      diff.ai.push(`access mode: ${before.ai?.mode ?? '(unchanged)'} → ${next.ai.mode}`);
    if (next.ai.trusted !== undefined && next.ai.trusted !== (before.ai?.trusted ?? false))
      diff.ai.push(`trusted group: ${before.ai?.trusted ?? false} → ${next.ai.trusted}`);
  }
  return diff;
}

export function workspaceDiffEmpty(diff: WorkspaceDiff) {
  return (
    !diff.group.length &&
    !diff.project.length &&
    !diff.tabs.open.length &&
    !diff.tabs.pin.length &&
    !diff.scripts.add.length &&
    !diff.scripts.change.length &&
    !diff.siteSettings.length &&
    !diff.terminals.length &&
    !diff.skills.length &&
    !diff.ai.length
  );
}

/** The native review text: every change the user is about to approve. */
export function describeWorkspaceDiff(diff: WorkspaceDiff, options: { includeAI?: boolean } = {}): string {
  const sections: string[] = [];
  if (diff.group.length) sections.push(`Group\n${diff.group.map((line) => `  ${line}`).join('\n')}`);
  if (diff.project.length) sections.push(`Project\n${diff.project.map((line) => `  ${line}`).join('\n')}`);
  if (diff.tabs.open.length)
    sections.push(`Tabs to open\n${diff.tabs.open.map((tab) => `  ${tab.url}${tab.pinned ? ' (pinned)' : ''}`).join('\n')}`);
  if (diff.tabs.pin.length) sections.push(`Tabs to pin\n${diff.tabs.pin.map((tab) => `  ${tab.url}`).join('\n')}`);
  if (diff.scripts.add.length || diff.scripts.change.length)
    sections.push(
      `Shell commands that become runnable scripts\n${[
        ...diff.scripts.add.map((script) => `  + ${script.name}: ${script.command}`),
        ...diff.scripts.change.map(
          ({ previous, next }) => `  ~ ${next.name}: ${previous.command}\n    → ${next.command}`
        ),
      ].join('\n')}`
    );
  if (diff.siteSettings.length)
    sections.push(`Site permissions\n${diff.siteSettings.map((line) => `  ${line}`).join('\n')}`);
  if (diff.terminals.length) sections.push(`Terminals\n${diff.terminals.map((line) => `  ${line}`).join('\n')}`);
  if (diff.skills.length) sections.push(`Skills\n${diff.skills.map((line) => `  ${line}`).join('\n')}`);
  if (options.includeAI && diff.ai.length)
    sections.push(`AI access (confirmed separately)\n${diff.ai.map((line) => `  ${line}`).join('\n')}`);
  return sections.join('\n\n') || 'No changes.';
}
