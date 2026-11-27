import { IApp } from '../types';

/** Undefined session IDs intentionally preserve the original default partition. */
export const loginProfileKey = (tab: IApp) =>
  tab.sessionProfileId || tab.sessionId || 'legacy';
export const groupKey = (tab: IApp) => tab.sessionId || 'legacy';
/** A disposable session: fresh in-memory storage that never touches the user's cookies. */
export const DISPOSABLE_PROFILE_PREFIX = 'disposable:';
export const isDisposableProfile = (profile: string) => profile.startsWith(DISPOSABLE_PROFILE_PREFIX);
/** Electron partition for a login profile; disposable profiles are not persisted. */
export const profilePartition = (profile: string) =>
  isDisposableProfile(profile) ? `kudiumbrowser-${profile}` : `persist:kudiumbrowser-${profile}`;
export function isGroupHomeTab(tab: IApp): boolean {
  if (!tab.sessionHomeURL) return false;
  try {
    return new URL(tab.url).href === new URL(tab.sessionHomeURL).href;
  } catch {
    return false;
  }
}
/** The home tab leads the strip, followed by pinned tabs and regular tabs. */
export function compareGroupTabs(a: IApp, b: IApp): number {
  return (
    Number(isGroupHomeTab(b)) - Number(isGroupHomeTab(a)) ||
    Number(Boolean(b.tabPinned)) - Number(Boolean(a.tabPinned))
  );
}
export function groupTabs(tabs: IApp[], selected: IApp) {
  return tabs
    .filter(
      (tab) =>
        !tab.archived &&
        groupKey(tab) === groupKey(selected) &&
        (tab.spaceId || 'default') === (selected.spaceId || 'default')
    )
    .sort(compareGroupTabs);
}
export function tabGroups(tabs: IApp[], spaceId: string) {
  const favorites = new Set(
    tabs.filter((tab) => tab.favorite && !tab.archived).map(groupKey)
  );
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    const key = groupKey(tab);
    if (
      tab.archived ||
      (tab.spaceId || 'default') !== spaceId ||
      favorites.has(key) ||
      seen.has(key)
    )
      return false;
    seen.add(key);
    return true;
  });
}

/** Allocate a readable name without repeating generated suffixes. */
export function newGroupName(
  tabs: IApp[],
  name: string,
  custom = false
): string {
  const base = custom
    ? name
    : name.replace(
        /(?: · (?:New (?:session|group)|Separate account|(?:Session|Group) \d+)| \(new session\))+$/g,
        ''
      );
  const used = new Set(tabs.map((tab) => tab.sessionName || tab.name));
  if (!used.has(base)) return base;
  let number = 2;
  while (used.has(`${base} · Group ${number}`)) number += 1;
  return `${base} · Group ${number}`;
}

/** Only migrate known generated names; retain names explicitly edited by users. */
export function migrateGroupNames(tabs: IApp[]): IApp[] {
  const renamed = new Map<string, string>();
  const protectedSessions = new Set(
    tabs.filter((tab) => tab.sessionNameCustom || tab.customName).map(groupKey)
  );
  let next = tabs;
  tabs.forEach((tab) => {
    if (protectedSessions.has(groupKey(tab)) || !tab.sessionName) return;
    const base = tab.sessionName.replace(
      /(?: · (?:New session|Separate account)| \(new session\))+$/g,
      ''
    );
    if (base !== tab.name || base === tab.sessionName) return;
    const key = groupKey(tab);
    if (!renamed.has(key)) renamed.set(key, newGroupName(next, base));
    next = next.map((entry) =>
      groupKey(entry) === key && !entry.sessionNameCustom
        ? {
            ...entry,
            sessionName: renamed.get(key),
            sessionNameGenerated: true,
          }
        : entry
    );
  });
  return next;
}

/** Personal Data follows the group across spaces and shared login changes. */
export const personalDataScope = (tab: IApp) => `group:${groupKey(tab)}`;
