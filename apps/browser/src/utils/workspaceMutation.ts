import type { IApp } from '../types';
import { AppManager } from './AppManager';

/** Commit the trusted main process's group import through the ordinary workspace save. */
export function applyWorkspaceMutation(
  changes: { id: string; changes: Partial<IApp> }[],
  additions: IApp[] = []
) {
  const patches = new Map(changes.map((patch) => [patch.id, patch.changes]));
  const apps = AppManager.getAll();
  if (
    (!patches.size && !additions.length) ||
    [...patches.keys()].some((id) => !apps.some((app) => app.id === id))
  )
    throw new Error('Tab is unavailable in this window');
  const ids = new Set(apps.map((app) => app.id));
  for (const app of additions) {
    if (ids.has(app.id)) throw new Error('Duplicate workspace tab');
    ids.add(app.id);
  }
  AppManager.set([
    ...apps.map((app) =>
      patches.has(app.id) ? { ...app, ...patches.get(app.id) } : app
    ),
    ...additions,
  ]);
}
