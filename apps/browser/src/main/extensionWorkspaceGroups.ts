import { randomUUID } from 'node:crypto';
import type { BrowserWindow, Session, WebContents } from 'electron';
import type { IApp } from '../types';
import { groupKey, loginProfileKey } from '../utils/groups';

export interface WorkspaceChromeGroup {
  id: number;
  windowId: number;
  title: string;
  color: string;
  collapsed: boolean;
}
export interface ExtensionWorkspaceSource {
  apps(): IApp[];
  contents(id: string): WebContents | undefined;
  window(id: string): BrowserWindow;
  profile(session: Session): string | undefined;
  assertAccess(app: IApp): void;
  update(
    window: BrowserWindow,
    changes: { id: string; changes: Partial<IApp> }[],
  ): Promise<void>;
}
const sources = new Set<ExtensionWorkspaceSource>();
export function registerExtensionWorkspace(source: ExtensionWorkspaceSource) {
  sources.add(source);
  return () => sources.delete(source);
}
/** Stable Chrome IDs are a projection of persisted Kudium group IDs. */
export function chromeWorkspaceGroupId(key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 2147483646) + 1;
}
export function extensionWorkspaceGroups(session: Session) {
  const source = [...sources].find((candidate) => candidate.profile(session));
  if (!source) return undefined;
  const profile = source.profile(session)!;
  const apps = () =>
    source
      .apps()
      .filter((app) => !app.archived && loginProfileKey(app) === profile);
  const grouped = () => {
    const result = new Map<number, IApp[]>();
    for (const app of apps()) {
      if (app.sessionChromeUngrouped) continue;
      const id = chromeWorkspaceGroupId(groupKey(app));
      const entries = result.get(id) || [];
      if (entries.length && groupKey(entries[0]) !== groupKey(app))
        throw new Error('Tab group ID collision');
      entries.push(app);
      result.set(id, entries);
    }
    return result;
  };
  const entries = (id: number) => {
    const result = grouped().get(id);
    if (!result) throw new Error('Tab group does not exist in this profile');
    result.forEach((app) => source.assertAccess(app));
    return result;
  };
  const info = (items: IApp[]): WorkspaceChromeGroup => ({
    id: chromeWorkspaceGroupId(groupKey(items[0])),
    windowId: source.window(items[0].id).id,
    title: items[0].sessionName || items[0].name,
    color: items[0].sessionChromeColor || 'grey',
    collapsed: items[0].sessionChromeCollapsed ?? false,
  });
  const tab = (contents: WebContents) => {
    const app = apps().find((item) => source.contents(item.id) === contents);
    if (!app || contents.session !== session)
      throw new Error('Tab is unavailable in this profile');
    source.assertAccess(app);
    return app;
  };
  return {
    query: () =>
      [...grouped().values()]
        .filter((items) => {
          try {
            items.forEach((app) => source.assertAccess(app));
            return true;
          } catch {
            return false;
          }
        })
        .map(info),
    get: (id: number) => info(entries(id)),
    tabGroup: (contents: WebContents) => {
      const app = tab(contents);
      return app.sessionChromeUngrouped
        ? -1
        : chromeWorkspaceGroupId(groupKey(app));
    },
    group: async (tabs: WebContents[], id?: number) => {
      const moving = tabs.map(tab);
      const target = id === undefined ? undefined : entries(id)[0];
      const window = source.window((target || moving[0]).id);
      if (moving.some((app) => source.window(app.id) !== window))
        throw new Error('Moving tabs between windows is not supported');
      const key = target ? groupKey(target) : randomUUID();
      const changes = moving.map((app) => ({
        id: app.id,
        changes: {
          sessionId: key,
          sessionProfileId: profile,
          sessionName: target?.sessionName || 'Extension group',
          sessionNameCustom: true,
          sessionSlug: undefined,
          sessionChromeUngrouped: false,
          sessionHomeURL: target?.sessionHomeURL,
          browserEmail: target?.browserEmail,
          browserEmails: target?.browserEmails,
          sessionMode: target?.sessionMode || ('separate' as const),
          favorite: target?.favorite || false,
          pinned: target?.pinned || false,
          sessionChromeColor: target?.sessionChromeColor || 'grey',
          sessionChromeCollapsed: target?.sessionChromeCollapsed ?? false,
          sessionFocusColor: target?.sessionFocusColor,
          spaceId: target?.spaceId ?? app.spaceId,
          folderId: target?.folderId ?? app.folderId,
        },
      }));
      await source.update(window, changes);
      return chromeWorkspaceGroupId(key);
    },
    ungroup: async (tabs: WebContents[]) => {
      const moving = tabs.map(tab);
      for (const app of moving)
        await source.update(source.window(app.id), [
          {
            id: app.id,
            changes: {
              sessionId: randomUUID(),
              sessionProfileId: profile,
              sessionName: app.customName || app.name,
              sessionNameCustom: true,
              sessionSlug: undefined,
              sessionChromeColor: 'grey',
              sessionChromeCollapsed: false,
              sessionChromeUngrouped: true,
              sessionMode: 'separate',
              sessionHomeURL: undefined,
              browserEmail: undefined,
              browserEmails: undefined,
              favorite: false,
              pinned: false,
            },
          },
        ]);
    },
    update: async (id: number, options: Partial<WorkspaceChromeGroup>) => {
      const items = entries(id);
      const colors: Record<string, string> = {
        grey: '#808080',
        blue: '#4285f4',
        red: '#ea4335',
        yellow: '#fbbc04',
        green: '#34a853',
        pink: '#ff80ab',
        purple: '#a142f4',
        cyan: '#24c1e0',
        orange: '#fa903e',
      };
      await source.update(
        source.window(items[0].id),
        items.map((app) => ({
          id: app.id,
          changes: {
            ...(options.title !== undefined && {
              sessionName: options.title,
              sessionNameCustom: true,
            }),
            ...(options.color !== undefined && {
              sessionChromeColor: options.color,
              sessionFocusColor: colors[options.color],
            }),
            ...(options.collapsed !== undefined && {
              sessionChromeCollapsed: options.collapsed,
              groupDisplay: 'folder' as const,
            }),
          },
        })),
      );
      return info(entries(id));
    },
  };
}
