import type { IApp } from '../types';
import {
  aiGroupId,
  aiGroups,
  scopedAITabs,
  resolveAIReference,
} from '../browser/aiGroups';
import { linkedProjectFolder } from './developerProject';
import { isGroupLocked } from './groupLocks';

/** Group-linked paths are metadata; they grant no file or terminal authority. */
function projectMetadata(tabs: IApp[], groupId: string) {
  const source = tabs.find(
    (tab) => !tab.archived && aiGroupId(tab) === groupId
  );
  if (!source) throw new Error('Group is unavailable.');
  const locked = isGroupLocked(source);
  const folder = locked ? undefined : linkedProjectFolder(groupId);
  return {
    collectionId: source.folderId || null,
    collectionName: source.collectionName || null,
    groupDisplay: source.groupDisplay || 'stack',
    sessionMode: source.sessionMode || 'separate',
    locked,
    project: folder ? { path: folder } : null,
  };
}

export function aiProjectGroups(tabs: IApp[], scope: string | null) {
  const allowed = scopedAITabs(tabs, scope);
  return aiGroups(allowed).map(({ id, name, slug, tabs: pages }) => ({
    id,
    name,
    slug,
    tabCount: pages.length,
    ...projectMetadata(allowed, id),
  }));
}

export function aiProjectReference(
  tabs: IApp[],
  reference: string,
  scope: string | null
) {
  const resolved = resolveAIReference(tabs, reference, scope);
  return { ...resolved, ...projectMetadata(tabs, resolved.groupId) };
}
