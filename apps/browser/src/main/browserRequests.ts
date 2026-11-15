import { validDeveloperConfig } from '../browser/siteDeveloper';
import type { BrowserCommand, BrowserLayout } from '../browser/contracts';

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit = 1024): value is string =>
  typeof value === 'string' && value.length <= limit;
const optionalText = (value: unknown) => value === undefined || text(value);

/** Validate the complete message before removing views or changing partitions. */
export function isBrowserLayout(value: unknown): value is BrowserLayout {
  if (
    !object(value) ||
    !Array.isArray(value.apps) ||
    value.apps.length > 10000 ||
    !Array.isArray(value.visible) ||
    value.visible.length > 16 ||
    !optionalText(value.focusedId) ||
    (value.suspended !== undefined && typeof value.suspended !== 'boolean') ||
    (value.tabSwitcher !== undefined && typeof value.tabSwitcher !== 'boolean')
  )
    return false;
  const ids = new Set<string>();
  if (
    !value.apps.every((item) => {
      if (
        !object(item) ||
        !text(item.id) ||
        !item.id ||
        ids.has(item.id) ||
        !text(item.url, 65536) ||
        !text(item.name, 65536) ||
        (item.groupDisplay !== undefined &&
          !['folder', 'stack'].includes(item.groupDisplay as string)) ||
        (item.sessionMode !== undefined &&
          !['separate', 'collection'].includes(item.sessionMode as string)) ||
        ![
          'sessionId',
          'openerTabId',
          'restorationId',
          'sessionProfileId',
          'protectionGroupId',
          'extensionInstallTarget',
          'spaceId',
          'folderId',
          'collectionName',
        ].every((key) => optionalText(item[key])) ||
        ![
          'sessionName',
          'customName',
          'sessionHomeURL',
          'tabDefaultURL',
          'sessionIconEmoji',
        ].every((key) => item[key] === undefined || text(item[key], 65536)) ||
        !['icon', 'sessionIconImage'].every(
          (key) => item[key] === undefined || text(item[key], 1048576)
        ) ||
        ![
          'pinned',
          'favorite',
          'archived',
          'sessionNameCustom',
          'sessionNameGenerated',
        ].every(
          (key) => item[key] === undefined || typeof item[key] === 'boolean'
        ) ||
        (item.position !== undefined &&
          (typeof item.position !== 'number' ||
            !Number.isFinite(item.position)))
      )
        return false;
      ids.add(item.id);
      return true;
    })
  )
    return false;
  const visibleIds = new Set<string>();
  return (
    (value.focusedId === undefined || ids.has(value.focusedId as string)) &&
    value.visible.every((slot) => {
      if (
        !object(slot) ||
        !text(slot.id) ||
        !ids.has(slot.id) ||
        visibleIds.has(slot.id) ||
        !['x', 'y', 'width', 'height'].every(
          (key) =>
            typeof slot[key] === 'number' &&
            Number.isFinite(slot[key]) &&
            Math.abs(slot[key] as number) <= 1000000
        ) ||
        (slot.width as number) < 0 ||
        (slot.height as number) < 0
      )
        return false;
      visibleIds.add(slot.id);
      return true;
    })
  );
}
const commands = new Set<BrowserCommand['action']>([
  'focus-chrome',
  'back',
  'forward',
  'reload',
  'reload-ignore-cache',
  'clear-cookies-reload',
  'reload-menu',
  'stop',
  'navigate',
  'settings',
  'extensions',
  'menu',
  'print',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'find',
  'clear-data',
  'media-play-pause',
  'media-previous',
  'media-next',
  'toggle-mute',
  'toggle-picture-in-picture',
  'set-permission',
  'reset-permissions',
  'close-group',
  'unload-tab',
  'open-site-developer',
  'toggle-site-hook',
  'run-site-hook',
  'set-site-developer',
  'ask-hook-ai',
  'clear-site-developer-logs',
  'activate-hook-notification',
  'revoke-hook-notification',
]);
export function isBrowserCommand(value: unknown): value is BrowserCommand {
  return (
    object(value) &&
    text(value.id) &&
    typeof value.action === 'string' &&
    commands.has(value.action as BrowserCommand['action']) &&
    (value.url === undefined || text(value.url, 65536)) &&
    (value.action !== 'set-site-developer' ||
      (validDeveloperConfig(value.developer) &&
        (value.run === undefined || typeof value.run === 'boolean'))) &&
    (!['toggle-site-hook', 'run-site-hook'].includes(value.action) ||
      (typeof value.hookId === 'string' && typeof value.url === 'string')) &&
    (value.action !== 'ask-hook-ai' || text(value.prompt, 30000)) &&
    optionalText(value.permission) &&
    (value.grantId === undefined || text(value.grantId, 100)) &&
    (value.hookId === undefined || text(value.hookId, 100)) &&
    (!['activate-hook-notification', 'revoke-hook-notification'].includes(
      String(value.action)
    ) ||
      (typeof value.grantId === 'string' && !!value.grantId)) &&
    (value.choice === undefined ||
      ['ask', 'allow', 'block'].includes(value.choice as string))
  );
}
