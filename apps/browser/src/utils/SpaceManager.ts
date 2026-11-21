import { useEffect, useState } from 'react';
import { AppManager } from './AppManager';
import { eventBus } from './EventBus';
import { EVENT_KEY } from './constant';
import { LocalStorage } from './LocalStorage';
import { readSavedList, writeSavedList } from './storageRecovery';

import { resolveAppTheme } from './appTheme';
import { normalizeFocusColor } from './focusColor';
export { spaceColorValues, primaryContrast } from './appTheme';

export const DEFAULT_SPACE = 'default';
export const SPACE_KEY = 'kudiumbrowser-spaces';
export const ACTIVE_SPACE_KEY = 'kudiumbrowser-active-space';
export const spaceColors = [
  'iris',
  'red',
  'blue',
  'green',
  'amber',
  'pink',
] as const;
export const spaceColorNames = {
  iris: 'Kudium teal',
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  amber: 'Yellow',
  pink: 'Pink',
};
export type SpaceColor = (typeof spaceColors)[number];
export type SpaceIconName =
  | 'home'
  | 'work'
  | 'explore'
  | 'code'
  | 'reading'
  | 'heart'
  | 'coffee'
  | 'layers'
  | 'star'
  | 'globe'
  | 'music'
  | 'camera'
  | 'game'
  | 'rocket'
  | 'science'
  | 'travel'
  | 'shopping'
  | 'finance'
  | 'fitness'
  | 'sun'
  | 'moon'
  | 'palette';
export interface Collection {
  id: string;
  name: string;
  iconImage?: string;
  iconEmoji?: string;
  focusColor?: string;
}
export interface Space {
  icon?: SpaceIconName;
  iconImage?: string;
  iconEmoji?: string;
  customColor?: string;
  frameColor?: string;
  useWebsiteColors?: boolean;
  id: string;
  name: string;
  color: SpaceColor;
  folders: Collection[];
  selectedAppId?: string;
}
export function spacePrimaryColor(
  space: Pick<Space, 'color' | 'customColor' | 'useWebsiteColors'>,
  themeColor?: string
) {
  return resolveAppTheme(space, themeColor).primary;
}
export function spaceFrameColor(
  space: Pick<
    Space,
    'color' | 'customColor' | 'frameColor' | 'useWebsiteColors'
  >,
  themeColor?: string
) {
  return resolveAppTheme(space, themeColor).frame;
}
export const SpaceManager = {
  getAll(): Space[] {
    const seen = new Set<string>();
    const spaces: Space[] = readSavedList(SPACE_KEY, (value) => {
      const space = value as Space | null;
      return (
        !!space &&
        typeof space.id === 'string' &&
        typeof space.name === 'string'
      );
    })
      .map((value) => {
        const space = value as Space;
        const defaultIcon =
          space.name.toLowerCase() === 'personal' ? 'home' : 'layers';
        const next: Space = {
          ...space,
          color: spaceColors.includes(space.color) ? space.color : 'iris',
          icon: typeof space.icon === 'string' ? space.icon : defaultIcon,
          folders: Array.isArray(space.folders)
            ? space.folders
                .filter(
                  (folder) =>
                    folder &&
                    typeof folder.id === 'string' &&
                    typeof folder.name === 'string'
                )
                .map((folder) => {
                  const collection = { ...folder };
                  if (typeof collection.iconEmoji !== 'string')
                    delete collection.iconEmoji;
                  if (typeof collection.iconImage !== 'string')
                    delete collection.iconImage;
                  if (collection.focusColor !== undefined) {
                    const color = normalizeFocusColor(collection.focusColor);
                    if (color) collection.focusColor = color;
                    else delete collection.focusColor;
                  }
                  return collection;
                })
            : [],
        };
        (
          [
            'iconEmoji',
            'iconImage',
            'customColor',
            'frameColor',
            'selectedAppId',
          ] as const
        ).forEach((key) => {
          if (typeof next[key] !== 'string') delete next[key];
        });
        if (typeof next.useWebsiteColors !== 'boolean')
          delete next.useWebsiteColors;
        return next;
      })
      .filter((space) => {
        if (seen.has(space.id)) return false;
        seen.add(space.id);
        return true;
      });
    if (!spaces.length)
      spaces.push({
        id: DEFAULT_SPACE,
        name: 'Personal',
        color: 'iris',
        icon: 'home',
        folders: [],
      });
    // Keep saved sessions reachable when their space/folder metadata is missing.
    AppManager.getAll().forEach((app) => {
      const id = app.spaceId || DEFAULT_SPACE;
      let space = spaces.find((entry) => entry.id === id);
      if (!space) {
        space = {
          id,
          name: 'Recovered space',
          color: 'iris',
          icon: 'layers',
          folders: [],
        };
        spaces.push(space);
      }
      if (
        app.folderId &&
        !space.folders.some((folder) => folder.id === app.folderId)
      )
        space.folders.push({ id: app.folderId, name: 'Recovered folder' });
    });
    let selection: Record<string, string | undefined> = {};
    try {
      selection = JSON.parse(
        LocalStorage.get('kudium-window-selected-tabs') || '{}'
      );
    } catch {
      /* First window selection. */
    }
    return spaces.map((space) => ({
      ...space,
      selectedAppId: selection[space.id] ?? space.selectedAppId,
    }));
  },
  activeId(): string {
    return LocalStorage.get(ACTIVE_SPACE_KEY) || DEFAULT_SPACE;
  },
  select(id: string) {
    LocalStorage.set(ACTIVE_SPACE_KEY, id);
    eventBus.dispatch(EVENT_KEY.SPACE_UPDATE);
  },
  set(spaces: Space[]) {
    writeSavedList(SPACE_KEY, spaces);
    eventBus.dispatch(EVENT_KEY.SPACE_UPDATE);
  },
  add(name: string, color: SpaceColor, icon: SpaceIconName = 'layers') {
    const space = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color,
      icon,
      folders: [],
    };
    SpaceManager.set([...SpaceManager.getAll(), space]);
    SpaceManager.select(space.id);
    window.electron?.telemetry?.feature('space_created');
    return space;
  },
  update(id: string, changes: Partial<Space>) {
    if (Object.keys(changes).length === 1 && 'selectedAppId' in changes) {
      let selection: Record<string, string | undefined> = {};
      try {
        selection = JSON.parse(
          LocalStorage.get('kudium-window-selected-tabs') || '{}'
        );
      } catch {
        /* First selection. */
      }
      selection[id] = changes.selectedAppId;
      LocalStorage.set(
        'kudium-window-selected-tabs',
        JSON.stringify(selection)
      );
      eventBus.dispatch(EVENT_KEY.SPACE_UPDATE);
      return;
    }
    SpaceManager.set(
      SpaceManager.getAll().map((space) =>
        space.id === id ? { ...space, ...changes } : space
      )
    );
  },
  remove(id: string) {
    const spaces = SpaceManager.getAll();
    if (spaces.length === 1) return;
    const remaining = spaces.filter((space) => space.id !== id);
    const destination = remaining[0].id;
    // Preserve instance IDs and sessions when removing an organizational space.
    AppManager.set(
      AppManager.getAll().map((item) =>
        (item.spaceId || DEFAULT_SPACE) === id
          ? { ...item, spaceId: destination, folderId: undefined }
          : item
      )
    );
    SpaceManager.set(remaining);
    if (SpaceManager.activeId() === id) SpaceManager.select(destination);
  },
};
export function useSpaces() {
  const [spaces, setSpaces] = useState(SpaceManager.getAll);
  const [activeId, setActiveId] = useState(SpaceManager.activeId);
  useEffect(() => {
    const update = () => {
      setSpaces(SpaceManager.getAll());
      setActiveId(SpaceManager.activeId());
    };
    const unsubscribe = eventBus.on(EVENT_KEY.SPACE_UPDATE, update);
    const onStorage = (event: StorageEvent) => {
      if (event.key === SPACE_KEY || event.key === null) update();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return {
    spaces,
    activeId,
    active: spaces.find((space) => space.id === activeId) || spaces[0],
  };
}
