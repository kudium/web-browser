import type { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import type { IApp } from '../types';
import type { AIWorkspaceTool } from '../browser/ai';
import type { AIAccessMode } from '../browser/aiPermissions';
import type { BrowserPreferences } from '../browser/preferences';
import { aiGroupId, aiGroups, scopedAITabs } from '../browser/aiGroups';
import { loginProfileKey } from '../utils/groups';
import {
  WORKSPACE_MANIFEST_FILE,
  WorkspaceDiff,
  WorkspaceManifest,
  describeWorkspaceDiff,
  diffWorkspaceManifest,
  validateWorkspaceManifest,
  workspaceDiffEmpty,
  workspaceOrigin,
  workspaceURLsEqual,
} from '../browser/workspaceManifest';
import { linkedProjectFolder } from './developerProject';
import { projectScripts } from './projectScripts';
import { getSiteSettings, updateSiteSettings } from './siteSettings';
import {
  getBrowserPreferences,
  updateBrowserPreferences,
  validatePreferences,
} from './preferences';
import { showBrowserDialog } from './dialogs';
import {
  readWorkspaceManifest,
  workspaceManifestPath,
  writeWorkspaceManifest,
} from './workspaceManifest';

/** Preferences an agent may neither read nor write: accounts, network plumbing, consent. */
export const AI_PREFERENCES_HIDDEN: (keyof BrowserPreferences)[] = [
  'cloudSync',
  'advanced',
  'usageDiagnosticsConsentVersion',
  'shareUsageDiagnostics',
  'setupCompleted',
  'personalDataAutofillPositions',
  'personalDataAutofillPopupPositions',
  'extensionToolbarOrder',
];

export interface AIWorkspaceContext {
  host: BrowserWindow;
  signal: AbortSignal;
  name: AIWorkspaceTool;
  args: Record<string, unknown>;
  /** Tabs the controller may see (unlocked, not being removed). */
  tabs: () => IApp[];
  /** The group's tab the call was addressed to, if any. */
  tab?: IApp;
  groupId: string | null;
  mode: AIAccessMode;
  check: () => void;
  /** Opens a URL in the group of `sourceTabId` through the ordinary new_tab tool. */
  openTab: (url: string, sourceTabId: string) => Promise<{ tabId?: string }>;
  /** Creates a group with its first website through the ordinary create_group tool. */
  createGroup: (
    name: string,
    url: string,
    display?: 'folder' | 'stack'
  ) => Promise<{ groupId: string; tabId: string }>;
  selectGroup: (groupId: string) => void;
  updateGroup?: (changes: { id: string; changes: Partial<IApp> }[]) => Promise<void>;
  /** Links the folder to the group of `sourceTabId` (the Developer panel's own path). */
  linkFolder: (sourceTabId: string, folder: string) => Promise<void>;
  chooseAccess: (mode: AIAccessMode) => void;
  beforeAIChange?: () => void;
  /** Native folder imports commit group edits and new tabs in one workspace save. */
  applyGroupTabs?: (manifest: WorkspaceManifest, diff: WorkspaceDiff) => Promise<string[]>;
  /** Runs the nested tab and group tools under the setup approval so they do not prompt again. */
  withApproval: <T>(run: () => Promise<T>) => Promise<T>;
}

export { workspaceFromBrowser } from './workspaceBrowserState';
import { workspaceFromBrowser } from './workspaceBrowserState';

function sameFolder(a: string, b: string) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return a === b;
  }
}

function groupLinkedTo(tabs: IApp[], folder: string) {
  return aiGroups(tabs).find((group) => {
    const linked = linkedProjectFolder(group.id);
    return linked !== undefined && sameFolder(linked, folder);
  });
}

async function review(
  context: AIWorkspaceContext,
  message: string,
  detail: string,
  button: string,
  technicalDetail?: string
) {
  const answer = await showBrowserDialog(context.host, {
    type: 'question',
    signal: context.signal,
    title: 'Workspace configuration',
    message,
    detail,
    ...(technicalDetail ? { technicalDetail, technicalDetailLabel: 'Review manifest' } : {}),
    buttons: ['Cancel', button],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  context.check();
  return answer.response === 1;
}

interface ApplyOutcome {
  openedTabIds: string[];
  scripts: { added: number; changed: number };
  siteSettings: number;
  notes: string[];
}

/** Group fields shared by native project imports and AI configuration tools. */
export function workspaceGroupPatch(
  source: IApp,
  manifest: WorkspaceManifest,
  diff: WorkspaceDiff
): Partial<IApp> {
  const changed = (field: string) =>
    diff.group.some((line) => line.startsWith(`${field}:`));
  const changes: Partial<IApp> = {};
  if (!manifest.group) return changes;
  if (changed('name'))
    Object.assign(changes, {
      sessionName: manifest.group.name,
      sessionNameCustom: true,
      sessionNameGenerated: false,
    });
  if (changed('slug')) changes.sessionSlug = manifest.group.slug;
  if (changed('display') && manifest.group.display)
    changes.groupDisplay = manifest.group.display;
  if (
    changed('sessionMode') &&
    (manifest.group.sessionMode === 'separate' ||
      (manifest.group.sessionMode === 'collection' && source.folderId))
  )
    changes.sessionMode = manifest.group.sessionMode;
  return changes;
}

/** Apply the reviewed, non-AI part of a manifest to a group. Nothing is removed. */
export async function applyWorkspace(
  context: AIWorkspaceContext,
  groupId: string,
  manifest: WorkspaceManifest,
  diff: WorkspaceDiff,
  folder: string | undefined
): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = { openedTabIds: [], scripts: { added: 0, changed: 0 }, siteSettings: 0, notes: [] };
  const members = () => context.tabs().filter((tab) => !tab.archived && aiGroupId(tab) === groupId);
  const source = () => {
    const tab = members()[0];
    if (!tab) throw new Error('Group is no longer available.');
    return tab;
  };
  if (context.applyGroupTabs) {
    outcome.openedTabIds = await context.applyGroupTabs(manifest, diff);
    context.check();
  } else {
    if (diff.group.length && manifest.group) {
      // Only the fields the review listed change; the diff is the contract.
      const changes = workspaceGroupPatch(source(), manifest, diff);
      if (!context.updateGroup) outcome.notes.push('Group settings are unavailable in this window.');
      else await context.updateGroup(members().map((tab) => ({ id: tab.id, changes })));
      context.check();
    }
    for (const tab of diff.tabs.open) {
      const opened = await context.openTab(tab.url, source().id);
      context.check();
      if (typeof opened.tabId === 'string') {
        outcome.openedTabIds.push(opened.tabId);
        if (tab.pinned && context.updateGroup) await context.updateGroup([{ id: opened.tabId, changes: { tabPinned: true } }]);
      }
    }
    if (diff.tabs.pin.length && context.updateGroup) {
      const pins = diff.tabs.pin
        .map((tab) => members().find((entry) => workspaceURLsEqual(entry.url, tab.url)))
        .filter((entry): entry is IApp => !!entry)
        .map((entry) => ({ id: entry.id, changes: { tabPinned: true } as Partial<IApp> }));
      if (pins.length) await context.updateGroup(pins);
      context.check();
    }
  }
  if (diff.scripts.add.length || diff.scripts.change.length) {
    if (!folder) outcome.notes.push('Scripts were not registered: link a project folder first.');
    else {
      const existing = () => projectScripts(groupId, folder, { action: 'list' });
      diff.scripts.add.forEach((script) => {
        projectScripts(groupId, folder, { action: 'save', name: script.name, command: script.command, scope: 'project' });
        outcome.scripts.added += 1;
      });
      diff.scripts.change.forEach(({ previous, next }) => {
        const saved = existing().find(
          (script) => script.scope === 'project' && (script.command === previous.command || script.name === previous.name)
        );
        projectScripts(groupId, folder, {
          action: 'save',
          ...(saved ? { id: saved.id } : {}),
          name: next.name,
          command: next.command,
          scope: 'project',
        });
        outcome.scripts.changed += 1;
      });
    }
  }
  if (diff.siteSettings.length) {
    const profile = loginProfileKey(source());
    Object.entries(manifest.siteSettings || {}).forEach(([site, permissions]) => {
      const origin = workspaceOrigin(site);
      if (!origin) return;
      const current = getSiteSettings(profile, origin).permissions;
      const next = { ...current };
      let changed = false;
      Object.entries(permissions).forEach(([permission, value]) => {
        if ((current[permission] || 'ask') !== value) {
          next[permission] = value;
          changed = true;
          outcome.siteSettings += 1;
        }
      });
      if (changed) updateSiteSettings(profile, origin, { permissions: next });
    });
  }
  if (diff.terminals.length) outcome.notes.push('Terminals open on demand from project_terminal; the manifest only names them.');
  return outcome;
}

/** The `ai` block widens what the agent may do, so it gets its own confirmation. */
export async function applyAIBlock(
  context: AIWorkspaceContext,
  groupId: string,
  manifest: WorkspaceManifest,
  diff: WorkspaceDiff
): Promise<boolean> {
  if (!diff.ai.length || !manifest.ai) return false;
  const approved = await review(
    context,
    'Change AI access for this group?',
    `${diff.ai.join('\n')}\n\nA trusted group lets the agent act without hard-floor reviews; the access mode applies to this browser. Shell commands after reading other websites still review.`,
    'Change AI access'
  );
  if (!approved) return false;
  context.beforeAIChange?.();
  if (manifest.ai.trusted !== undefined && context.updateGroup) {
    const members = context.tabs().filter((tab) => !tab.archived && aiGroupId(tab) === groupId);
    await context.updateGroup(members.map((tab) => ({ id: tab.id, changes: { aiTrusted: manifest.ai!.trusted } })));
    context.check();
  }
  if (manifest.ai.mode !== undefined) context.chooseAccess(manifest.ai.mode);
  return true;
}

function writeManifestIfAllowed(folder: string | undefined, manifest: WorkspaceManifest, notes: string[]) {
  if (!folder) return undefined;
  if (!getBrowserPreferences().writeBrowserInstructions) {
    notes.push(`${WORKSPACE_MANIFEST_FILE} was not written: "Keep browser context in linked projects" is off.`);
    return undefined;
  }
  try {
    writeWorkspaceManifest(folder, manifest);
    return workspaceManifestPath(folder);
  } catch (error) {
    notes.push(`${WORKSPACE_MANIFEST_FILE} could not be written: ${(error as Error).message}`);
    return undefined;
  }
}

function manifestArgument(value: unknown): WorkspaceManifest | undefined {
  if (value === undefined) return undefined;
  if (JSON.stringify(value).length > 256 * 1024) throw new Error('manifest is larger than 256 KB.');
  return validateWorkspaceManifest(value);
}

function summary(diff: WorkspaceDiff) {
  return {
    group: diff.group,
    tabsToOpen: diff.tabs.open.map((tab) => tab.url),
    scriptsAdded: diff.scripts.add.map((script) => script.id),
    scriptsChanged: diff.scripts.change.map(({ next }) => next.id),
    siteSettings: diff.siteSettings,
    ai: diff.ai,
  };
}

export async function aiWorkspaceTool(context: AIWorkspaceContext): Promise<unknown> {
  const { name, args } = context;
  context.check();
  if (name === 'get_preferences') {
    const preferences = { ...getBrowserPreferences() } as Partial<BrowserPreferences>;
    AI_PREFERENCES_HIDDEN.forEach((key) => {
      delete preferences[key];
    });
    return { preferences, hidden: AI_PREFERENCES_HIDDEN };
  }
  if (name === 'set_preferences') {
    const patch = args.preferences;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('preferences must be an object.');
    const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 400) : '';
    if (!reason) throw new Error('Give the reason the user asked for this change.');
    const blocked = Object.keys(patch).filter((key) => (AI_PREFERENCES_HIDDEN as string[]).includes(key));
    if (blocked.length) throw new Error(`These preferences cannot be changed by an agent: ${blocked.join(', ')}.`);
    const validated = validatePreferences(patch as Partial<BrowserPreferences>);
    const current = getBrowserPreferences();
    const lines = Object.entries(validated)
      .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key as keyof BrowserPreferences]))
      .map(([key, value]) => {
        const show = (entry: unknown) => {
          const text = JSON.stringify(entry) ?? 'undefined';
          return text.length > 160 ? `${text.slice(0, 157)}…` : text;
        };
        return `${key}: ${show(current[key as keyof BrowserPreferences])} → ${show(value)}`;
      });
    if (!lines.length) return { changed: false, keys: [] };
    const approved = await review(
      context,
      'Change browser preferences?',
      `${reason}\n\n${lines.join('\n')}`,
      'Apply changes'
    );
    if (!approved) throw new Error('User declined the preference change. Do not retry this action.');
    updateBrowserPreferences(validated);
    return { changed: true, keys: lines.map((line) => line.slice(0, line.indexOf(':'))) };
  }
  if (name === 'setup_project') {
    if (typeof args.folder !== 'string' || !path.isAbsolute(args.folder) || args.folder.includes('\0'))
      throw new Error('folder must be an absolute path.');
    let folder: string;
    try {
      folder = await fs.promises.realpath(args.folder);
      if (!(await fs.promises.stat(folder)).isDirectory()) throw new Error('not a directory');
    } catch {
      throw new Error('Choose an existing project folder.');
    }
    context.check();
    const file = readWorkspaceManifest(folder);
    const provided = manifestArgument(args.manifest);
    const manifest: WorkspaceManifest = provided || file || { version: 1 };
    const groupName = manifest.group?.name || path.basename(folder);
    const existing = groupLinkedTo(context.tabs(), folder);
    const current = existing ? workspaceFromBrowser(context.tabs(), existing.id, folder, file) : undefined;
    const diff = diffWorkspaceManifest(current, manifest);
    if (!existing && !diff.tabs.open.length)
      throw new Error('Add at least one tabs[].url to the manifest: a new group needs a first website.');
    const writes = getBrowserPreferences().writeBrowserInstructions;
    const approved = await review(
      context,
      `Set up project “${groupName}”?`,
      `${folder}\n\n${existing ? `Reuse the linked group “${existing.name}”.` : `Create the group “${groupName}” and link this folder.`}\n\n${describeWorkspaceDiff(diff, { includeAI: true })}${
        writes
          ? `\n\nWrites ${WORKSPACE_MANIFEST_FILE}, a one-line AGENTS.md reference and a .mcp.json entry holding only the bridge command (no token).`
          : ''
      }`,
      existing ? 'Apply' : 'Set up project',
      JSON.stringify(manifest, null, 2)
    );
    if (!approved) throw new Error('User declined the project setup. Do not retry this action.');
    return context.withApproval(async () => {
      let groupId: string;
      let sourceTabId: string;
      let opened: string[] = [];
      if (existing) {
        groupId = existing.id;
        context.selectGroup(groupId);
        const member = context.tabs().find((tab) => !tab.archived && aiGroupId(tab) === groupId);
        if (!member) throw new Error('Group is no longer available.');
        sourceTabId = member.id;
      } else {
        const [first, ...rest] = diff.tabs.open;
        const created = await context.createGroup(groupName, first.url, manifest.group?.display);
        context.check();
        groupId = created.groupId;
        sourceTabId = created.tabId;
        opened = [created.tabId];
        if (first.pinned && context.updateGroup) await context.updateGroup([{ id: created.tabId, changes: { tabPinned: true } }]);
        diff.tabs.open = rest;
        diff.group = [];
      }
      await context.linkFolder(sourceTabId, folder);
      context.check();
      const outcome = await applyWorkspace(context, groupId, manifest, diff, folder);
      const written = writeManifestIfAllowed(
        folder,
        { ...manifest, group: { ...(manifest.group || {}), name: groupName } },
        outcome.notes
      );
      const aiApplied = await applyAIBlock(context, groupId, manifest, diff);
      return {
        groupId,
        tabIds: [...opened, ...outcome.openedTabIds],
        folder,
        ...(written ? { path: written } : {}),
        scripts: outcome.scripts,
        siteSettings: outcome.siteSettings,
        aiApplied,
        notes: outcome.notes,
        next: 'Call list_tabs to see the group, then get_project for its scripts and terminals.',
      };
    });
  }
  // get_workspace_config and apply_workspace_config address a group.
  const { tab } = context;
  if (!tab || context.groupId === null && !tab)
    throw new Error('Choose a group tab (tabId from list_tabs).');
  const groupId = aiGroupId(tab);
  const folder = linkedProjectFolder(groupId);
  let file: WorkspaceManifest | undefined;
  let fileError: string | undefined;
  try {
    file = folder ? readWorkspaceManifest(folder) : undefined;
  } catch (error) {
    fileError = (error as Error).message;
  }
  const current = workspaceFromBrowser(context.tabs(), groupId, folder, file);
  if (name === 'get_workspace_config') {
    return {
      groupId,
      linked: !!folder,
      source: file ? 'file' : 'browser',
      ...(folder ? { path: workspaceManifestPath(folder) } : {}),
      ...(fileError ? { fileError } : {}),
      manifest: file || current,
      ...(file ? { browser: current } : {}),
    };
  }
  const manifest = manifestArgument(args.manifest);
  if (!manifest) throw new Error('manifest is required.');
  const diff = diffWorkspaceManifest(current, manifest);
  const willWrite = !!folder && getBrowserPreferences().writeBrowserInstructions;
  if (workspaceDiffEmpty(diff) && !willWrite) return { applied: false, changes: summary(diff) };
  const approved = await review(
    context,
    `Apply workspace configuration to “${current.group?.name || 'this group'}”?`,
    `${describeWorkspaceDiff(diff, { includeAI: true })}${willWrite ? `\n\nWrites ${WORKSPACE_MANIFEST_FILE} in ${folder}.` : ''}`,
    'Apply',
    JSON.stringify(manifest, null, 2)
  );
  if (!approved) throw new Error('User declined the workspace change. Do not retry this action.');
  return context.withApproval(async () => {
    const outcome = await applyWorkspace(context, groupId, manifest, diff, folder);
    const written = writeManifestIfAllowed(
      folder,
      { ...manifest, group: { ...(current.group || { name: 'Group' }), ...(manifest.group || {}) } },
      outcome.notes
    );
    const aiApplied = await applyAIBlock(context, groupId, manifest, diff);
    return {
      applied: true,
      changes: summary(diff),
      tabIds: outcome.openedTabIds,
      scripts: outcome.scripts,
      siteSettings: outcome.siteSettings,
      aiApplied,
      ...(written ? { path: written } : {}),
      notes: outcome.notes,
    };
  });
}
