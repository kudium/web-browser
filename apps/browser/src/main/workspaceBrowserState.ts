import type { IApp } from '../types';
import { aiGroupId, aiGroups, scopedAITabs } from '../browser/aiGroups';
import { loginProfileKey } from '../utils/groups';
import {
  WORKSPACE_PERMISSIONS,
  WorkspaceManifest,
  WorkspacePermission,
  WorkspacePermissionChoice,
  manifestFromBrowserState,
} from '../browser/workspaceManifest';
import { projectScripts } from './projectScripts';
import { getSiteSettings, siteOrigin } from './siteSettings';

type Permissions = Partial<
  Record<WorkspacePermission, WorkspacePermissionChoice>
>;

/** The browser's current state for a group as a manifest. */
export function workspaceFromBrowser(
  tabs: IApp[],
  groupId: string,
  folder: string | undefined,
  file: WorkspaceManifest | undefined
): WorkspaceManifest {
  const group = aiGroups(tabs).find((entry) => entry.id === groupId);
  const members = scopedAITabs(tabs, groupId).filter(
    (tab) => aiGroupId(tab) === groupId
  );
  if (!group || !members.length) throw new Error('Group is unavailable.');
  const source = members[0];
  const siteSettings: Record<string, Permissions> = {};
  members.forEach((tab) => {
    const origin = siteOrigin(tab.url);
    if (!origin || siteSettings[origin]) return;
    const permissions = getSiteSettings(
      loginProfileKey(tab),
      origin
    ).permissions;
    const chosen: Permissions = {};
    WORKSPACE_PERMISSIONS.forEach((permission) => {
      const value = permissions[permission];
      if (value === 'allow' || value === 'block') chosen[permission] = value;
    });
    if (Object.keys(chosen).length) siteSettings[origin] = chosen;
  });
  return manifestFromBrowserState({
    group: {
      name: group.name,
      slug: group.slug,
      display: source.groupDisplay || 'stack',
      sessionMode: source.sessionMode || 'separate',
    },
    tabs: members
      .filter((tab) => /^https?:/.test(tab.url))
      .map((tab) => ({
        url: tab.url,
        title: tab.customName || tab.name,
        pinned: tab.tabPinned === true,
      })),
    scripts: folder
      ? projectScripts(groupId, folder, { action: 'list' })
          .filter((script) => script.scope === 'project')
          .map(({ name, command }) => ({ name, command }))
      : [],
    siteSettings,
    trusted: source.aiTrusted === true,
    file,
  });
}
