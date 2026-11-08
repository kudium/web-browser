import type { IApp } from '../types';
import type { BrowserWindowState } from '../browser/windows';

let state: BrowserWindowState | undefined;
const listeners = new Set<() => void>();
export const windowWorkspace = {
  state: () => state,
  update(next: BrowserWindowState) {
    state = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  visible(saved: IApp[]) {
    if (!state) return saved;
    if (state.kind === 'temporary')
      return state.tabs.map((tab) => ({ ...tab }));
    const pending = new Map(state.pendingTabs.map((tab) => [tab.id, tab]));
    const reserved = new Set(state.reservedIds);
    const tabs = saved
      .filter((tab) => !reserved.has(tab.id))
      .map((tab) => pending.get(tab.id) || tab);
    state.pendingTabs.forEach((tab) => {
      if (!tabs.some((item) => item.id === tab.id)) tabs.push(tab);
    });
    return state.kind === 'groups'
      ? tabs.filter((tab) =>
          state!.groupIds.includes(tab.sessionId || 'legacy')
        )
      : tabs;
  },
  save(saved: IApp[], next: IApp[]) {
    if (!state) return next;
    if (state.kind === 'temporary') {
      windowWorkspace.update({ ...state, tabs: next });
      window.electron.browser
        .windowRequest({ action: 'temporary-tabs', tabs: next })
        .catch(() => {});
      return saved;
    }
    const visibleIds = new Set(
      windowWorkspace.visible(saved).map((tab) => tab.id)
    );
    if (state.kind === 'groups')
      state = {
        ...state,
        groupIds: [
          ...new Set([
            ...state.groupIds,
            ...next.map((tab) => tab.sessionId || 'legacy'),
          ]),
        ],
      };
    const nextIds = new Set(next.map((tab) => tab.id));
    return [
      ...saved.filter((tab) => !visibleIds.has(tab.id) && !nextIds.has(tab.id)),
      ...next,
    ];
  },
};
