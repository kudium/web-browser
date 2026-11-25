import type { IApp } from '../types';
/** Shared local tab matching for address entry and command navigation. */
export function matchNavigationTabs(apps: IApp[], query: string, limit = 6): IApp[] {
  const term = query.trim().toLowerCase();
  return apps.filter(app => !app.archived && `${app.customName || app.name} ${app.url}`.toLowerCase().includes(term)).slice(0, limit);
}
export function navigationSuggestionTitle(query: string) {
  return /^(https?:\/\/|localhost[:/]|[\w-]+\.[\w.-]+)/i.test(query.trim()) ? query.trim() : `Search for “${query.trim()}”`;
}
