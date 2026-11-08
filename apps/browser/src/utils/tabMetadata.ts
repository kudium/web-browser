import { IApp } from '../types';

/** Keep the login context, but never borrow another page's identity. */
export function newPageTab(source: IApp, url: string, id: string): IApp {
  return {
    ...source,
    id,
    url,
    name: new URL(url).hostname || 'New tab',
    openerTabId: undefined,
    restorationId: undefined,
    tabPinned: false,
    tabDefaultURL: undefined,
    icon: '',
    customName: undefined,
    position: undefined,
    extensionInstallTarget: undefined,
    favorite: false,
    pinned: false,
    archived: false,
  };
}
