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

const storagePermissions = new Set([
  'persistent-storage',
  'storage-access',
  'top-level-storage-access',
]);

const mediaKeys = (types?: string[]) => {
  const keys =
    types?.flatMap((type) =>
      type === 'video' ? ['camera'] : type === 'audio' ? ['microphone'] : [],
    ) || [];
  return keys.length ? [...new Set(keys)] : ['camera', 'microphone'];
};
const choiceFor = (permissions: Record<string, string>, key: string) =>
  permissions[key] ??
  (['camera', 'microphone'].includes(key) ? permissions.media : undefined);

export function websitePermissionCheckHandler(profile: string): CheckHandler {
  return (_requester, permission, requestingOrigin, details) => {
    const origin = siteOrigin(details?.securityOrigin ?? requestingOrigin);
    if (!origin || getBrowserPreferences().permissions === 'block')
      return false;
    const permissions = getSiteSettings(profile, origin).permissions;
    if (permission === 'media') {
      const keys = mediaKeys(
        details?.mediaType ? [details.mediaType] : undefined,
      );
      return keys.every((key) => choiceFor(permissions, key) === 'allow');
    }
    const choice = permissions[permission];
    // Website storage access is granted silently unless explicitly blocked.
    return (
      choice === 'allow' ||
      (storagePermissions.has(permission) && choice !== 'block')
    );
  };
}

/** Permission decisions belong to the requesting document, not a later page. */
export function websitePermissionHandler(
  window: BrowserWindow,
  profile: string,
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
      details.requestingUrl || (details.isMainFrame ? requester.getURL() : ''),
    );
    if (!origin) {
      callback(false);
      return;
    }
    const keys =
      permission === 'media'
        ? mediaKeys('mediaTypes' in details ? details.mediaTypes : undefined)
        : [permission];
    const permissions = getSiteSettings(profile, origin).permissions;
    if (keys.some((key) => choiceFor(permissions, key) === 'block')) {
      callback(false);
      return;
    }
    const pendingKeys = keys.filter(
      (key) => choiceFor(permissions, key) !== 'allow',
    );
    if (!pendingKeys.length) {
      callback(true);
      return;
    }
    if (storagePermissions.has(permission)) {
      callback(true);
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
        websitePermissionDialog(
          origin,
          pendingKeys.length === 1 ? pendingKeys[0] : permission,
        ),
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
      if (keys.some((key) => choiceFor(latest.permissions, key) === 'block')) {
        finish(false);
        return;
      }
      const unresolved = pendingKeys.filter(
        (key) => choiceFor(latest.permissions, key) !== 'allow',
      );
      if (!unresolved.length) {
        finish(true);
        return;
      }
      const allowed = answer.response === 1;
      updateSiteSettings(profile, origin, {
        permissions: {
          ...latest.permissions,
          ...Object.fromEntries(
            unresolved.map((key) => [key, allowed ? 'allow' : 'block']),
          ),
        },
      });
      finish(allowed);
    } catch {
      finish(false);
    }
  };
}
