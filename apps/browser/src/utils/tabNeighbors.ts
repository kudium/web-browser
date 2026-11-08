import { IApp } from '../types';
import { groupKey, compareGroupTabs } from './groups';

export function nextGroupTab(apps: IApp[], closedId: string | undefined) {
  const closed = apps.find((tab) => tab.id === closedId);
  if (!closed) return undefined;
  const group = apps
    .filter(
      (tab) =>
        groupKey(tab) === groupKey(closed) &&
        (tab.spaceId || 'default') === (closed.spaceId || 'default')
    )
    .sort(compareGroupTabs);
  const index = group.findIndex((tab) => tab.id === closedId);
  return (
    group.slice(index + 1).find((tab) => !tab.archived) ||
    group
      .slice(0, index)
      .reverse()
      .find((tab) => !tab.archived)
  );
}

export function insertTabAfter(apps: IApp[], sourceId: string, tab: IApp) {
  const next = [...apps];
  const index = next.findIndex((item) => item.id === sourceId);
  next.splice(index < 0 ? next.length : index + 1, 0, tab);
  return next.map((item, position) => ({ ...item, position: position + 1 }));
}
