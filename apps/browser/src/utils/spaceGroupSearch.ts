import type { IApp } from '../types';

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
const key = (tab: IApp) =>
  JSON.stringify([tab.spaceId || 'default', tab.sessionId || 'legacy']);

const matches = (value: string, query: string) =>
  normalize(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => normalize(value).includes(term));

export function searchSpaceGroupTabs(
  group: IApp,
  tabs: IApp[],
  folders: { id: string; name: string }[],
  query: string
): IApp[] {
  const name = `${group.sessionName || group.name} ${group.sessionSlug || ''} ${
    folders.find((folder) => folder.id === group.folderId)?.name || ''
  }`;
  if (matches(name, query)) return tabs;
  return tabs.filter((tab) =>
    matches(`${name} ${tab.customName || tab.name} ${tab.url}`, query)
  );
}

/** Match sidebar metadata only; callers exclude locked tab details. */
export function filterSpaceGroups(
  groups: IApp[],
  folders: { id: string; name: string }[],
  query: string,
  tabs: IApp[] = []
): IApp[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return groups;
  const names = new Map(folders.map((folder) => [folder.id, folder.name]));
  const byGroup = new Map<string, IApp[]>();
  tabs.forEach((tab) => {
    if (tab.archived) return;
    const groupKey = key(tab);
    const groupTabs = byGroup.get(groupKey) || [];
    groupTabs.push(tab);
    byGroup.set(groupKey, groupTabs);
  });
  return groups.filter((group) => {
    const name = normalize(
      `${group.sessionName || group.name} ${group.sessionSlug || ''} ${
        names.get(group.folderId || '') || ''
      }`
    );
    return (
      terms.every((term) => name.includes(term)) ||
      (byGroup.get(key(group)) || []).some((tab) =>
        matches(`${name} ${tab.customName || tab.name} ${tab.url}`, query)
      )
    );
  });
}
