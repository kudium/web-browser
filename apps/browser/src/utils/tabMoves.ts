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
          favorite: target?.favorite || false,
          pinned: target ? target.pinned : true,
        }
      : item
  );
}
