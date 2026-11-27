import { IApp } from '../types';
import { groupKey, newGroupName } from './groups';

export type SidebarSection = 'favorites' | 'pinned' | 'regular';

export function moveGroupToSection(
  apps: IApp[],
  sourceId: string,
  section: SidebarSection,
  spaceId: string
): IApp[] {
  const source = apps.find((item) => item.id === sourceId);
  if (!source) return apps;
  return apps.map((item) =>
    groupKey(item) === groupKey(source) &&
    (item.spaceId || 'default') === (source.spaceId || 'default')
      ? {
          ...item,
          favorite: section === 'favorites',
          pinned: section !== 'regular',
          spaceId,
          folderId: undefined,
          sessionMode: 'separate',
        }
      : item
  );
}

export function reorderTabs(
  apps: IApp[],
  sourceId: string,
  targetId: string,
  groups = false
): IApp[] {
  const source = apps.find((item) => item.id === sourceId);
  const target = apps.find((item) => item.id === targetId);
  if (!source || !target || sourceId === targetId) return apps;
  const moving = apps.filter((item) =>
    groups
      ? groupKey(item) === groupKey(source) &&
        (item.spaceId || 'default') === (source.spaceId || 'default')
      : item.id === sourceId
  );
  if (moving.includes(target)) return apps;
  const rest = apps.filter((item) => !moving.includes(item));
  const index = rest.findIndex((item) => item.id === targetId);
  rest.splice(index, 0, ...moving);
  return rest.map((item, position) => ({ ...item, position: position + 1 }));
}

export function moveTab(
  apps: IApp[],
  sourceId: string,
  url: string,
  target?: IApp,
  spaceId?: string
): IApp[] {
  const source = apps.find((item) => item.id === sourceId);
  if (!source) return apps;
  return apps.map((item) =>
    item.id === sourceId
      ? {
          ...item,
          url,
          sessionId: target ? target.sessionId : crypto.randomUUID(),
          sessionProfileId: target?.sessionProfileId,
          groupDisplay: target?.groupDisplay || 'folder',
          sessionMode: target?.sessionMode || 'separate',
          sessionName: target
            ? target.sessionName || target.name
            : newGroupName(
                apps,
                item.sessionName || item.name,
                item.sessionNameCustom
              ),
          sessionNameCustom: target ? target.sessionNameCustom : false,
          sessionNameGenerated: target ? target.sessionNameGenerated : true,
          spaceId: target ? target.spaceId : spaceId || item.spaceId,
          folderId: target?.folderId,
          sessionIconEmoji: target?.sessionIconEmoji,
          sessionIconImage: target?.sessionIconImage,
          sessionHomeURL: target?.sessionHomeURL,
          browserEmail: target?.browserEmail,
          browserEmails: target?.browserEmails,
          favorite: target?.favorite || false,
          pinned: target ? target.pinned : true,
        }
      : item
  );
}

/** Duplicate open tabs without sharing the original group's login session. */
export function duplicateGroup(apps: IApp[], sourceId: string): IApp[] {
  const source = apps.find((tab) => tab.id === sourceId && !tab.archived);
  if (!source) return apps;
  const members = apps.filter(
    (tab) =>
      !tab.archived &&
      groupKey(tab) === groupKey(source) &&
      (tab.spaceId || 'default') === (source.spaceId || 'default'),
  );
  const sessionId = crypto.randomUUID();
  const named = members.find((tab) => tab.sessionName) || source;
  const sessionName = newGroupName(
    apps,
    named.sessionName || named.name,
    named.sessionNameCustom,
  );
  const ids = new Map(members.map((tab) => [tab.id, crypto.randomUUID()]));
  const copies = members.map((tab): IApp => ({
    ...tab,
    id: ids.get(tab.id)!,
    sessionId,
    sessionName,
    sessionProfileId: undefined,
    browserEmail: undefined,
    browserEmails: undefined,
    protectionGroupId: undefined,
    extensionInstallTarget: undefined,
    restorationId: undefined,
    sessionSlug: undefined,
    sessionMode: 'separate',
    sessionNameCustom: false,
    sessionNameGenerated: true,
    openerTabId: tab.openerTabId ? ids.get(tab.openerTabId) : undefined,
    archived: false,
    archivedAt: undefined,
    tags: tab.tags ? [...tab.tags] : undefined,
  }));
  const last = apps.indexOf(members[members.length - 1]);
  return [...apps.slice(0, last + 1), ...copies, ...apps.slice(last + 1)].map(
    (tab, index) => ({ ...tab, position: index + 1 }),
  );
}
