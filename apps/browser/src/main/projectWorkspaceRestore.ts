import { linkedProjectFolder } from './developerProject';
import { projectTerminalDefinitions } from './projectTerminal';
import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import type { IApp } from '../types';
import type { AIAccessMode } from '../browser/aiPermissions';
import { aiGroupId, aiGroups } from '../browser/aiGroups';
import {
  describeWorkspaceDiff,
  diffWorkspaceManifest,
  workspaceURLsEqual,
  WorkspaceManifest,
  workspaceDiffEmpty,
} from '../browser/workspaceManifest';
import {
  readWorkspaceManifest,
  serializeWorkspaceManifest,
} from './workspaceManifest';
import { workspaceFromBrowser } from './workspaceBrowserState';
import {
  applyWorkspace,
  applyAIBlock,
  workspaceGroupPatch,
  AIWorkspaceContext,
} from './aiWorkspace';
import { showBrowserDialog } from './dialogs';

export type WorkspaceMutation = (
  changes: { id: string; changes: Partial<IApp> }[],
  additions?: IApp[]
) => Promise<void>;

/** Import the file before linking can update it. Saved commands are never executed. */
export async function restoreProjectWorkspace(
  host: BrowserWindow,
  sourceId: string,
  folder: string,
  tabs: () => IApp[],
  update: WorkspaceMutation,
  checkAccess: () => void,
  access: {
    mode(): AIAccessMode;
    change(mode: AIAccessMode): void;
    assertChange(): void;
  }
) {
  const manifest = readWorkspaceManifest(folder);
  if (!manifest) return undefined;
  const original = serializeWorkspaceManifest(manifest);
  const source = tabs().find((tab) => tab.id === sourceId && !tab.archived);
  if (!source) throw new Error('This group is no longer available.');
  const groupId = aiGroupId(source);
  const check = () => {
    checkAccess();
    if (
      serializeWorkspaceManifest(
        readWorkspaceManifest(folder) || { version: 1 }
      ) !== original
    )
      throw new Error(
        'The project configuration changed. Link the folder again to review it.'
      );
  };
  const current = workspaceFromBrowser(tabs(), groupId, folder, manifest);
  current.skills = [];
  current.terminals =
    linkedProjectFolder(groupId) === folder
      ? projectTerminalDefinitions(groupId) || []
      : [];
  const remaining = current.terminals.map((terminal) => terminal.name);
  let addedTerminals = 0;
  for (const terminal of manifest.terminals || []) {
    const index = remaining.indexOf(terminal.name);
    if (index >= 0) remaining.splice(index, 1);
    else addedTerminals += 1;
  }
  if (current.terminals.length + addedTerminals > 8)
    throw new Error(
      'A group can have up to eight terminals. Close unused terminal tabs or reduce the project terminal definitions before linking.'
    );
  current.ai = { ...current.ai, mode: access.mode() };
  const diff = diffWorkspaceManifest(current, manifest);
  const signal = new AbortController();
  const closed = () => signal.abort();
  host.once('closed', closed);
  try {
    if (!workspaceDiffEmpty(diff)) {
      const answer = await showBrowserDialog(host, {
        type: 'question',
        signal: signal.signal,
        title: 'Project configuration',
        message: `Restore “${manifest.group?.name || current.group?.name || 'Project'}”?`,
        detail: `Restore this folder's saved setup into the selected group. Existing tabs are kept. Running terminals keep their current directories. Scripts are saved without running them.\n\n${describeWorkspaceDiff(diff, { includeAI: true })}`,
        technicalDetail: original,
        technicalDetailLabel: 'Review manifest',
        buttons: ['Cancel', 'Restore project'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      check();
      if (answer.response !== 1)
        throw new Error(
          'Project restore cancelled. The folder was not linked.'
        );
    }
    check();
    const context: AIWorkspaceContext = {
      host,
      signal: signal.signal,
      name: 'apply_workspace_config',
      args: {},
      tabs,
      tab: source,
      groupId,
      mode: access.mode(),
      check,
      openTab: async () => {
        throw new Error('Use the shared workspace import.');
      },
      createGroup: async () => {
        throw new Error('Select a group before linking.');
      },
      selectGroup: () => {},
      linkFolder: async () => {},
      updateGroup: (changes) => update(changes),
      chooseAccess: access.change,
      beforeAIChange: access.assertChange,
      withApproval: async (run) => run(),
      applyGroupTabs: async (next, changes) => {
        const members = tabs().filter(
          (tab) => !tab.archived && aiGroupId(tab) === groupId
        );
        const representative = members[0];
        if (!representative)
          throw new Error('This group is no longer available.');
        const patch = workspaceGroupPatch(representative, next, changes);
        const patches = members.map((tab) => ({
          id: tab.id,
          changes: {
            ...patch,
            ...(changes.tabs.pin.some((pin) =>
              workspaceURLsEqual(pin.url, tab.url)
            )
              ? { tabPinned: true }
              : {}),
          },
        }));
        const additions = changes.tabs.open.map((tab): IApp => ({
          ...representative,
          ...patch,
          id: randomUUID(),
          url: tab.url,
          name: tab.title || new URL(tab.url).hostname,
          customName: tab.title,
          icon: '',
          pinned: true,
          tabPinned: tab.pinned === true,
          tabDefaultURL: undefined,
          restorationId: undefined,
          openerTabId: undefined,
          customIconImage: undefined,
          customIconEmoji: undefined,
        }));
        if (
          Object.keys(patch).length ||
          changes.tabs.pin.length ||
          additions.length
        )
          await update(patches, additions);
        return additions.map((tab) => tab.id);
      },
    };
    await applyAIBlock(context, groupId, manifest, diff);
    await applyWorkspace(context, groupId, manifest, diff, folder);
    const group = aiGroups(tabs()).find((entry) => entry.id === groupId);
    return group ? { name: group.name, slug: group.slug } : undefined;
  } finally {
    host.removeListener('closed', closed);
  }
}
