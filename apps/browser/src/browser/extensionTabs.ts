import type { IApp } from '../types';

/** Keep the current group/profile while giving an extension-created tab fresh state. */
export function extensionCreatedTab(
  source: IApp,
  id: string,
  url: string,
): IApp {
  return {
    ...source,
    id,
    url,
    openerTabId: source.id,
    restorationId: undefined,
    tabDefaultURL: undefined,
    favorite: false,
    pinned: false,
    archived: false,
    customName: undefined,
    customIconEmoji: undefined,
    customIconImage: undefined,
  };
}
