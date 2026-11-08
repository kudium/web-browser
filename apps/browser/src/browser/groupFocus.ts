import type { IApp } from '../types';
import { LocalStorage } from '../utils/LocalStorage';
import { aiGroupId } from './aiGroups';

const key = 'kudium-group-last-active-tabs';
function read(): Record<string, string> {
  try {
    const value = JSON.parse(LocalStorage.get(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
export function rememberGroupTab(tab: IApp) {
  if (tab.archived) return;
  const saved = read();
  const id = aiGroupId(tab);
  if (saved[id] === tab.id) return;
  saved[id] = tab.id;
  LocalStorage.set(key, JSON.stringify(saved));
}
export function rememberedGroupTab(tabs: IApp[], source: IApp): IApp {
  const group = aiGroupId(source);
  const id = read()[group];
  return (
    tabs.find(
      (tab) => tab.id === id && !tab.archived && aiGroupId(tab) === group
    ) || source
  );
}
