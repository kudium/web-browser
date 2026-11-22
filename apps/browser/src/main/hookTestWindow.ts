import { hookActionMenu } from './hookActions';
import { showBrowserContextMenu } from './browserContextMenu';
import { BrowserWindow } from 'electron';
import type { GlobalHook, HookTestState } from '../browser/hookMarketplace';
import {
  emptyDeveloperConfig,
} from '../browser/siteDeveloper';
import { hookTestApplies, validateHookTest } from './hookTestValidation';
export { hookTestApplies, validateHookTest } from './hookTestValidation';
import {
  developerState,
  registerDeveloperPage,
  siteDeveloperPreload,
} from './siteDeveloper';
import { randomUUID } from 'crypto';

/** Runs one unsaved draft using the production hook runtime in a disposable session. */
export function createHookTestWindow(
  owner: BrowserWindow,
  draft: GlobalHook,
  url: string,
  publish: (state: HookTestState) => void
) {
  const target = validateHookTest(draft, url);
  const preview = new BrowserWindow({
    title: `${draft.name} — Test`,
    parent: owner,
    width: 1000,
    height: 760,
    show: false,
    webPreferences: {
      partition: `hook-test-${randomUUID()}`,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: siteDeveloperPreload(),
    },
  });
  const contents = preview.webContents;
  contents.session.setPermissionRequestHandler((_page, _permission, callback) =>
    callback(false)
  );
  contents.session.setPermissionCheckHandler(() => false);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, destination) => {
    if (!/^https?:\/\//i.test(destination)) event.preventDefault();
  });
  contents.on('will-redirect', (event, destination) => {
    if (!/^https?:\/\//i.test(destination)) event.preventDefault();
  });
  const checkMatch = (_event: unknown, currentURL: string) => {
    try {
      if (!hookTestApplies(draft, currentURL))
        publish({
          url: currentURL,
          status: 'waiting',
          logs: [
            {
              time: Date.now(),
              level: 'info',
              message:
                'This page does not match the hook pathname or domain rules.',
            },
          ],
        });
    } catch {
      /* Unsupported navigations are blocked above. */
    }
  };
  contents.on('did-navigate', checkMatch);
  contents.on('did-navigate-in-page', (event, currentURL, mainFrame) => {
    if (mainFrame) checkMatch(event, currentURL);
  });
  contents.session.on('will-download', (event) => event.preventDefault());
  const hook = { ...draft, enabled: true };
  const actionConfig = (currentURL: string) => {
    try { return hookTestApplies(hook, currentURL) ? { ...emptyDeveloperConfig, enabled: true, hooks: [hook] } : emptyDeveloperConfig; }
    catch { return emptyDeveloperConfig; }
  };
  contents.on('context-menu', (_event, params) => {
    showBrowserContextMenu(preview, contents, params, () => {}, [], undefined,
      hookActionMenu(preview, contents, params, `@hook-test-${contents.id}`,
        () => ({ groupId: '', sourceId: `@hook-test-${contents.id}` }),
        { config: actionConfig, preview: true }));
  });
  registerDeveloperPage(
    contents,
    `@hook-test-${contents.id}`,
    () => {
      if (contents.isDestroyed()) return;
      const currentURL = contents.getURL() || target;
      const state = developerState(contents, new URL(currentURL).origin);
      publish({
        url: currentURL,
        status: state.status,
        logs: state.logs.map(({ time, level, message }) => ({
          time,
          level,
          message,
        })),
      });
    },
    () => undefined,
    (currentURL) => {
      try {
        return hookTestApplies(hook, currentURL)
          ? { ...emptyDeveloperConfig, enabled: true, hooks: [hook] }
          : emptyDeveloperConfig;
      } catch {
        return emptyDeveloperConfig;
      }
    },
    owner
  );
  contents.on(
    'did-fail-load',
    (_event, code, description, failedURL, mainFrame) => {
      if (mainFrame && code !== -3)
        publish({
          url: failedURL,
          status: 'error',
          logs: [{ time: Date.now(), level: 'error', message: description }],
        });
    }
  );
  preview.once('ready-to-show', () => preview.show());
  preview.once('closed', () =>
    publish({ url: target, status: 'stopped', logs: [] })
  );
  publish({ url: target, status: 'loading', logs: [] });
  preview.loadURL(target).catch((error) => {
    if (!preview.isDestroyed())
      publish({
        url: target,
        status: 'error',
        logs: [{ time: Date.now(), level: 'error', message: String(error) }],
      });
  });
  return preview;
}
