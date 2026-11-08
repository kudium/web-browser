import type { Session } from 'electron';
import { installedExtensionOrigins } from './extensions';

/** Clear website logins/storage without erasing installed extensions' storage. */
export function clearSessionSiteData(browserSession: Session) {
  return browserSession.clearData({
    dataTypes: ['cookies', 'localStorage', 'indexedDB', 'serviceWorkers'],
    excludeOrigins: installedExtensionOrigins(),
  });
}
