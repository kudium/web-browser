import type { IApp } from '../types';
import { aiGroupId } from './aiGroups';
import { commandDestination } from '../utils/commandNavigation';

export const OPEN_TERMINAL_LINK = 'kudiumbrowser-open-terminal-link';

/** Printed terminal links open a new web tab in their source project group. */
export function terminalLinkTab(
  apps: IApp[],
  group: string,
  address: string,
  spaceId: string
): IApp | undefined {
  try {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    const source = apps.find(
      (app) => !app.archived && aiGroupId(app) === group
    );
    if (!source) return undefined;
    // An empty destination list ensures every click creates a new tab.
    return commandDestination([], source, url.href, false, spaceId).app;
  } catch {
    return undefined;
  }
}
