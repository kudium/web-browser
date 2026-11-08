import { assertGroupChanges } from './groupAccess';
import { EVENT_KEY, STORAGE_KEY } from './constant';
import { LocalStorage } from './LocalStorage';
import { IApp } from '../types';
import { eventBus } from './EventBus';
import { migrateGroupNames } from './groups';
import { assignGroupSlugs } from '../browser/aiGroups';
import { readSavedList, writeSavedList } from './storageRecovery';

// Storage remains authoritative across windows and direct layout restores.
// Cache only successful normalization; return independent mutable records.
let savedApps: { raw: string; normalized: string } | undefined;

export const AppManager = {
  removeDeleted(ids: string[]) {
    const removed = new Set(ids);
    const current = AppManager.getAll();
    const next = current.filter((item) => !removed.has(item.id));
    if (next.length === current.length) return;
    writeSavedList(STORAGE_KEY.USER_APPS, next);
    if (LocalStorage.get(STORAGE_KEY.USER_APPS) !== JSON.stringify(next))
      throw new Error(
        'Group data was removed, but its saved tabs could not be updated. Restart to retry layout cleanup.'
      );
    eventBus.dispatch(EVENT_KEY.APP_LIST_UPDATE);
  },
  restore(item: IApp): IApp {
    const restored = {
      ...item,
      archived: false,
      openerTabId: undefined,
      restorationId: crypto.randomUUID(),
    };
    AppManager.update('id', item.id, restored);
    return restored;
  },
  update(id: keyof IApp, value: any, newApp: IApp) {
    const existingApps = AppManager.getAll();
    const index = AppManager.getIndex(id, value, existingApps);
    existingApps[index] = newApp;
    AppManager.set(existingApps);
  },

  getBy: (
    key: keyof IApp,
    value: string,
    optionalList?: IApp[]
  ): IApp | undefined => {
    const apps = optionalList || AppManager.getAll();
    return apps.find((app) => app[key] === value);
  },

  getIndex: (key: keyof IApp, value: string, optionalList?: IApp[]): number => {
    const apps = optionalList || AppManager.getAll();
    return apps.findIndex((app) => app[key] === value);
  },

  getAll: (): IApp[] => {
    const raw = LocalStorage.get(STORAGE_KEY.USER_APPS);
    if (raw && savedApps?.raw === raw)
      return JSON.parse(savedApps.normalized) as IApp[];
    savedApps = undefined;
    const stored = readSavedList(STORAGE_KEY.USER_APPS, (value) => {
      const app = value as IApp | null;
      return (
        !!app &&
        typeof app.id === 'string' &&
        typeof app.name === 'string' &&
        typeof app.url === 'string' &&
        ['sessionId', 'sessionProfileId', 'spaceId', 'folderId'].every(
          (key) =>
            (app as any)[key] === undefined ||
            typeof (app as any)[key] === 'string'
        )
      );
    }).map((value) => {
      const app = value as IApp;
      const next = {
        ...app,
        icon: typeof app.icon === 'string' ? app.icon : '',
        tags: Array.isArray(app.tags)
          ? [
              ...new Set(
                app.tags.filter(
                  (tag) => typeof tag === 'string' && tag.length <= 100
                )
              ),
            ].slice(0, 50)
          : undefined,
      };
      (
        [
          'sessionId',
          'sessionProfileId',
          'extensionInstallTarget',
          'sessionName',
          'sessionSlug',
          'sessionIconEmoji',
          'sessionIconImage',
          'sessionHomeURL',
          'tabDefaultURL',
          'spaceId',
          'folderId',
          'customName',
          'restorationId',
        ] as const
      ).forEach((key) => {
        if (typeof next[key] !== 'string') delete next[key];
      });
      return next;
    });
    const migrated = assignGroupSlugs(migrateGroupNames(stored));
    if (
      migrated !== stored &&
      LocalStorage.get(`${STORAGE_KEY.USER_APPS}.recovery`) !==
        LocalStorage.get(STORAGE_KEY.USER_APPS)
    ) {
      try {
        writeSavedList(STORAGE_KEY.USER_APPS, migrated);
      } catch {
        // Keep startup usable without overwriting an unprotected original.
      }
    }
    // Failed migration or damaged data must retry recovery on later reads.
    // A second storage read also avoids caching an intervening replacement.
    const normalized = JSON.stringify(migrated);
    const current = LocalStorage.get(STORAGE_KEY.USER_APPS);
    if (current && current === normalized)
      savedApps = { raw: current, normalized };
    return migrated;
  },

  add: (app: IApp) => {
    if (!app) return;
    const existingApps = AppManager.getAll();
    app.position = existingApps.length + 1;
    app.sessionId = app.sessionId || crypto.randomUUID();
    app.spaceId =
      app.spaceId || localStorage.getItem('touchbox-active-space') || 'default';
    app.pinned = app.pinned ?? true;
    app.sessionName = app.sessionName || app.name;
    assertGroupChanges(existingApps, [...existingApps, app]);
    existingApps.push(app);
    writeSavedList(STORAGE_KEY.USER_APPS, assignGroupSlugs(existingApps));
    // Broadcast update
    eventBus.dispatch(EVENT_KEY.APP_LIST_UPDATE);
  },

  set(dataList: IApp[]) {
    assertGroupChanges(AppManager.getAll(), dataList);
    writeSavedList(STORAGE_KEY.USER_APPS, assignGroupSlugs(dataList));
    // On App Updated
    eventBus.dispatch(EVENT_KEY.APP_LIST_UPDATE);
  },
};

export const ScreenManager = {
  getLastAppId: () => LocalStorage.get(STORAGE_KEY.USER_LAST_APP_ID),
  saveLastAppId: (id: string) =>
    LocalStorage.set(STORAGE_KEY.USER_LAST_APP_ID, id),
  getLastAppUrl: () => {
    return LocalStorage.get(STORAGE_KEY.USER_LAST_SCREENS);
  },

  saveLastAppUrl: (url: string) => {
    LocalStorage.set(STORAGE_KEY.USER_LAST_SCREENS, url);
  },
};
