import { IApp } from '../types';
import { groupKey, isGroupHomeTab } from './groups';
import { commandDestination } from './commandNavigation';
import { collectionProfile } from './collectionGroups';
import { normalizeFocusColor } from './focusColor';

export interface GroupSettings {
  loginProfileId?: string;
  groupDisplay?: 'stack' | 'folder';
  sessionMode?: 'separate' | 'collection';
  name: string;
  slug?: string;
  emoji: string;
  image: string;
  focusColor?: string;
  homeURL: string;
  spaceId: string;
  folderId: string;
  placement: 'regular' | 'pinned' | 'favorite';
  aiTrusted?: boolean;
  aiTier?: 'auto' | 'assist' | 'control' | 'cloud';
}
export function updateGroupSettings(
  tabs: IApp[],
  source: IApp,
  settings: GroupSettings
): IApp[] {
  const collectionLogin =
    settings.sessionMode === 'collection' &&
    settings.folderId &&
    settings.placement !== 'favorite'
      ? collectionProfile(settings.spaceId, settings.folderId)
      : undefined;
  const updated = tabs.map((tab) =>
    groupKey(tab) === groupKey(source) &&
    (tab.spaceId || 'default') === (source.spaceId || 'default')
      ? {
          ...tab,
          groupDisplay: settings.groupDisplay || tab.groupDisplay,
          aiTrusted: settings.aiTrusted ?? tab.aiTrusted,
          aiTier: settings.aiTier ?? tab.aiTier,
          sessionMode:
            settings.folderId && settings.placement !== 'favorite'
              ? settings.sessionMode || tab.sessionMode
              : 'separate',
          sessionProfileId:
            collectionLogin ||
            (settings.loginProfileId === undefined
              ? tab.sessionProfileId
              : settings.loginProfileId || undefined),
          sessionName: settings.name,
          sessionSlug: settings.slug ?? tab.sessionSlug,
          sessionNameCustom: true,
          sessionNameGenerated: false,
          sessionIconEmoji: settings.emoji || undefined,
          sessionIconImage: settings.image || undefined,
          sessionFocusColor:
            settings.focusColor === undefined
              ? tab.sessionFocusColor
              : normalizeFocusColor(settings.focusColor),
          sessionHomeURL: settings.homeURL || undefined,
          spaceId: settings.spaceId,
          folderId:
            settings.placement === 'favorite'
              ? undefined
              : settings.folderId || undefined,
          favorite: settings.placement === 'favorite',
          pinned: settings.placement !== 'regular',
        }
      : tab
  );
  const target = updated.find((tab) => tab.id === source.id);
  if (!settings.homeURL || !target) return updated;
  const belongs = (tab: IApp) =>
    groupKey(tab) === groupKey(target) &&
    (tab.spaceId || 'default') === (target.spaceId || 'default');
  if (!updated.some((tab) => belongs(tab) && !tab.archived)) return updated;
  const matching =
    updated.find(
      (tab) => belongs(tab) && !tab.archived && isGroupHomeTab(tab)
    ) || updated.find((tab) => belongs(tab) && isGroupHomeTab(tab));
  const home = matching
    ? {
        ...matching,
        archived: false,
        ...(matching.archived
          ? { restorationId: crypto.randomUUID(), openerTabId: undefined }
          : {}),
      }
    : {
        ...commandDestination(
          [],
          target,
          settings.homeURL,
          false,
          settings.spaceId
        ).app!,
        sessionSlug: target.sessionSlug,
        favorite: target.favorite,
        pinned: target.pinned,
      };
  const remaining = updated.filter((tab) => tab.id !== home.id);
  const first = remaining.findIndex(belongs);
  remaining.splice(first < 0 ? updated.findIndex(belongs) : first, 0, home);
  return remaining.map((tab, position) => ({ ...tab, position: position + 1 }));
}
