import type { BrowserWindow, Session } from 'electron';
import { showBrowserDialog, websitePermissionDialog } from './dialogs';
import { getBrowserPreferences } from './preferences';
import {
  getSiteSettings,
  siteOrigin,
  updateSiteSettings,
} from './siteSettings';

type RequestHandler = NonNullable<
  Parameters<Session['setPermissionRequestHandler']>[0]
>;
type CheckHandler = NonNullable<
  Parameters<Session['setPermissionCheckHandler']>[0]
>;

export function websitePermissionCheckHandler(profile: string): CheckHandler {
  return (_requester, permission, requestingOrigin, details) => {
    const origin = siteOrigin(details?.securityOrigin ?? requestingOrigin);
    if (!origin || getBrowserPreferences().permissions === 'block')
      return false;
    return getSiteSettings(profile, origin).permissions[permission] === 'allow';
  };
}

/** Permission decisions belong to the requesting document, not a later page. */
export function websitePermissionHandler(
  window: BrowserWindow,
  profile: string
): RequestHandler {
  return async (requester, permission, callback, details) => {
    if (
      requester.isDestroyed() ||
      getBrowserPreferences().permissions === 'block'
    ) {
      callback(false);
      return;
    }
    const origin = siteOrigin(
      details.requestingUrl || (details.isMainFrame ? requester.getURL() : '')
    );
    if (!origin) {
      callback(false);
      return;
    }
    const choice = getSiteSettings(profile, origin).permissions[permission];
    if (choice && choice !== 'ask') {
      callback(choice === 'allow');
      return;
    }
    let settled = false;
    let cleanup = () => {};
    const finish = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(allowed);
    };
    const closed = () => finish(false);
    // Cancel for document navigation, including subframes. In-page changes
    // retain the same document and need not discard an outstanding decision.
    const navigating = (_event: unknown, _url: string, inPlace: boolean) => {
      if (!inPlace) finish(false);
    };
    cleanup = () => {
      requester.removeListener('did-start-navigation', navigating);
      requester.removeListener('destroyed', closed);
    };
    requester.on('did-start-navigation', navigating);
    requester.once('destroyed', closed);
    try {
      const answer = await showBrowserDialog(
        window,
        websitePermissionDialog(origin, permission)
      );
      if (settled) return;
      if (
        requester.isDestroyed() ||
        getBrowserPreferences().permissions === 'block'
      ) {
        finish(false);
        return;
      }
      const latest = getSiteSettings(profile, origin);
      const current = latest.permissions[permission];
      if (current && current !== 'ask') {
        finish(current === 'allow');
        return;
      }
      const allowed = answer.response === 1;
      updateSiteSettings(profile, origin, {
        permissions: {
          ...latest.permissions,
          [permission]: allowed ? 'allow' : 'block',
        },
      });
      finish(allowed);
    } catch {
      finish(false);
    }
  };
}
