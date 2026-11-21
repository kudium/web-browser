import {
  expiredRecord,
  retentionCutoff,
} from '../browser/systemSpaceRetention';
import { lockedGroup, protectedGroup, assertGroupChanges } from './groupAccess';
import { EVENT_KEY, STORAGE_KEY } from './constant';
import { LocalStorage } from './LocalStorage';
import { IApp } from '../types';
import { eventBus } from './EventBus';
import { migrateGroupNames } from './groups';
import { assignGroupSlugs } from '../browser/aiGroups';
import { readSavedList, writeSavedList } from './storageRecovery';
import { windowWorkspace } from './windowWorkspace';
import { prepareCollectionGroups } from './collectionGroups';
import { normalizeFocusColor } from './focusColor';

// Storage remains authoritative across windows and direct layout restores.
// Cache only successful normalization; return independent mutable records.
let savedApps: { raw: string; normalized: string } | undefined;

export const AppManager = {
  commitWindowTabs(tabs: IApp[], removed: string[]) {
    const ids = new Set([...removed, ...tabs.map((tab) => tab.id)]);
    writeSavedList(STORAGE_KEY.USER_APPS, [
      ...AppManager.getStored().filter((tab) => !ids.has(tab.id)),
      ...tabs,
    ]);
    eventBus.dispatch(EVENT_KEY.APP_LIST_UPDATE);
  },
  removeDeleted(ids: string[]) {
    const removed = new Set(ids);
    const current = AppManager.getAll();
    const next = current.filter((item) => !removed.has(item.id));
    if (next.length === current.length) return;
    const saved = windowWorkspace.save(AppManager.getStored(), next);
    writeSavedList(STORAGE_KEY.USER_APPS, saved);
    if (LocalStorage.get(STORAGE_KEY.USER_APPS) !== JSON.stringify(saved))
      throw new Error(
        'Group data was removed, but its saved tabs could not be updated. Restart to retry layout cleanup.'
      );
    eventBus.dispatch(EVENT_KEY.APP_LIST_UPDATE);
  },
  restore(item: IApp): IApp {
    const restored = {
      ...item,
      archived: false,
      archivedAt: undefined,
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

  getAll: (): IApp[] => windowWorkspace.visible(AppManager.getStored()),
  getStored: (): IApp[] => {
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
          'protectionGroupId',
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
          'customIconEmoji',
          'customIconImage',
          'restorationId',
        ] as const
      ).forEach((key) => {
        if (typeof next[key] !== 'string') delete next[key];
      });
      for (const key of ['focusColor', 'sessionFocusColor'] as const) {
        const color = normalizeFocusColor(next[key]);
        if (color) next[key] = color;
        else delete next[key];
      }
      if (next.groupDisplay !== 'stack' && next.groupDisplay !== 'folder')
        delete next.groupDisplay;
      if (next.sessionMode !== 'separate' && next.sessionMode !== 'collection')
        delete next.sessionMode;
      return next;
    });
    const migrated = assignGroupSlugs(
      migrateGroupNames(prepareCollectionGroups(stored, stored))
    );
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
    if (app.archived) app.archivedAt = Date.now();
    app.position = existingApps.length + 1;
    app.sessionId = app.sessionId || crypto.randomUUID();
    app.spaceId =
      app.spaceId ||
      localStorage.getItem('kudiumbrowser-active-space') ||
      'default';
    app.pinned = app.pinned ?? true;
    app.sessionName = app.sessionName || app.name;
    const [prepared] = prepareCollectionGroups([app], existingApps);
    assertGroupChanges(existingApps, [...existingApps, prepared]);
    existingApps.push(prepared);
    writeSavedList(
      STORAGE_KEY.USER_APPS,
      assignGroupSlugs(
        windowWorkspace.save(AppManager.getStored(), existingApps)
      )
    );
    window.electron?.telemetry?.feature('tab_created');
    // Broadcast update
    eventBus.dispatch(EVENT_KEY.APP_LIST_UPDATE);
  },

  pruneArchive(days: number, now = Date.now()) {
    if (windowWorkspace.state()?.kind === 'temporary') return;
    const cutoff = retentionCutoff(days, now);
    if (cutoff === undefined) return;
    const current = AppManager.getAll();
    const next = current
      .filter(
        (item) =>
          !item.archived ||
          lockedGroup(item) ||
          protectedGroup(item) ||
          !expiredRecord(item.archivedAt, cutoff)
      )
      .map((item) =>
        item.archived && !lockedGroup(item) && !Number.isFinite(item.archivedAt)
          ? { ...item, archivedAt: now }
          : item
      );
    if (JSON.stringify(next) !== JSON.stringify(current)) AppManager.set(next);
  },
  set(dataList: IApp[]) {
    const previous = AppManager.getAll();
    const byId = new Map(previous.map((item) => [item.id, item]));
    dataList = dataList.map((item) => {
      if (lockedGroup(item)) return item;
      if (!item.archived)
        return item.archivedAt === undefined
          ? item
          : { ...item, archivedAt: undefined };
      const prior = byId.get(item.id);
      return {
        ...item,
        archivedAt: prior?.archived
          ? Number.isFinite(item.archivedAt)
            ? item.archivedAt
            : Number.isFinite(prior.archivedAt)
            ? prior.archivedAt
            : Date.now()
          : Date.now(),
      };
    });
    const prepared = prepareCollectionGroups(dataList, previous);
    assertGroupChanges(previous, prepared);
    writeSavedList(
      STORAGE_KEY.USER_APPS,
      assignGroupSlugs(windowWorkspace.save(AppManager.getStored(), prepared))
    );
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
