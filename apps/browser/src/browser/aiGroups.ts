import { IApp } from '../types';
import { groupKey } from '../utils/groups';

export interface AIGroup {
  id: string;
  name: string;
  slug: string;
  tabs: { id: string; name: string; slug: string; url: string; icon: string }[];
}
export const aiGroupId = (tab: IApp) =>
  JSON.stringify([groupKey(tab), tab.spaceId || 'default']);
export const groupSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '') || 'group';
const unique = (base: string, used: Set<string>) => {
  let next = base;
  let index = 2;
  while (used.has(next)) {
    const suffix = `-${index}`;
    next = `${base.slice(0, 60 - suffix.length).replace(/-$/, '')}${suffix}`;
    index += 1;
  }
  used.add(next);
  return next;
};

/**
 * Deterministic migration shared by renderer persistence and main-process
 * tools.
 */
export function assignGroupSlugs(tabs: IApp[]): IApp[] {
  const groups = new Map<string, string>();
  const used = new Set<string>();
  tabs.forEach((tab) => {
    const id = aiGroupId(tab);
    if (!groups.has(id))
      groups.set(
        id,
        unique(groupSlug(tab.sessionSlug || tab.sessionName || tab.name), used)
      );
  });
  if (tabs.every((tab) => tab.sessionSlug === groups.get(aiGroupId(tab))))
    return tabs;
  return tabs.map((tab) => ({
    ...tab,
    sessionSlug: groups.get(aiGroupId(tab)),
  }));
}

export function aiGroups(tabs: IApp[]): AIGroup[] {
  const groups = new Map<string, AIGroup>();
  assignGroupSlugs(tabs)
    .filter((tab) => !tab.archived)
    .forEach((tab) => {
      const id = aiGroupId(tab);
      if (!groups.has(id))
        groups.set(id, {
          id,
          name: tab.sessionName || tab.name,
          slug: tab.sessionSlug!,
          tabs: [],
        });
      const group = groups.get(id)!;
      const used = new Set(group.tabs.map((page) => page.slug));
      group.tabs.push({
        id: tab.id,
        name: tab.customName || tab.name,
        slug: unique(groupSlug(tab.customName || tab.name), used),
        url: tab.url,
        icon: tab.icon,
      });
    });
  return [...groups.values()];
}

export function scopedAITabs(tabs: IApp[], groupId: string | null) {
  if (groupId !== null && !aiGroups(tabs).some((group) => group.id === groupId))
    throw new Error('Selected group is unavailable. Choose an AI scope again.');
  return tabs.filter(
    (tab) => !tab.archived && (groupId === null || aiGroupId(tab) === groupId)
  );
}

export function resolveAIReference(
  tabs: IApp[],
  reference: string,
  groupId: string | null
) {
  const match = /^@?([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/.exec(reference);
  if (!match) throw new Error('Use @group or @group/page.');
  const group = aiGroups(tabs).find((entry) => entry.slug === match[1]);
  if (!group) throw new Error('Group reference not found.');
  scopedAITabs(tabs, groupId);
  if (groupId !== null && group.id !== groupId)
    throw new Error(
      'Reference is outside AI scope. Select All groups or its group first.'
    );
  const page = match[2] && group.tabs.find((entry) => entry.slug === match[2]);
  if (match[2] && !page) throw new Error('Page reference not found.');
  return {
    groupId: group.id,
    groupName: group.name,
    tabCount: group.tabs.length,
    reference: `@${group.slug}`,
    ...(page ? { tabId: page.id, title: page.name, url: page.url } : {}),
  };
}

/** Recognize human references in Markdown prose, excluding literal code samples. */
export function promptAIReferences(prompt: string): string[] {
  const prose = prompt.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  return [
    ...new Set(
      [
        ...prose.matchAll(
          /(?:^|[\s(*_["'])@([a-z0-9-]+(?:\/[a-z0-9-]+)?)(?=$|[\s.,!?;:*_)\]"'])/g
        ),
      ].map((match) => match[1])
    ),
  ];
}
