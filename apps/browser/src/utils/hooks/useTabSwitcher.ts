import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { IApp } from '../../types';

export const TAB_SWITCHER_DELAY = 200;
interface Session {
  tabs: IApp[];
  index: number;
}
export function useTabSwitcher(
  tabs: IApp[],
  selectedId: string | undefined,
  select: (tab: IApp) => void,
  scope: string
) {
  const [shown, setShown] = useState<Session>();
  const session = useRef<Session | undefined>(undefined);
  const history = useRef<string[]>([]);
  const lastSelected = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ tabs, selectedId, select });
  latest.current = { tabs, selectedId, select };
  useLayoutEffect(() => {
    const available = new Set(tabs.map((tab) => tab.id));
    history.current = history.current.filter((id) => available.has(id));
    if (selectedId !== lastSelected.current) {
      lastSelected.current = selectedId;
      if (selectedId && available.has(selectedId))
        history.current = [
          selectedId,
          ...history.current.filter((id) => id !== selectedId),
        ];
    }
  }, [tabs, selectedId]);
  const finish = useCallback((commit: boolean) => {
    clearTimeout(timer.current);
    const { current } = session;
    session.current = undefined;
    setShown(undefined);
    const tab = current?.tabs[current.index];
    const available =
      tab && latest.current.tabs.find((item) => item.id === tab.id);
    if (commit && available) {
      // Native shortcut messages can arrive before React renders the selection.
      // Keep MRU ordering current so successive quick chords toggle immediately.
      history.current = [
        available.id,
        ...history.current.filter((id) => id !== available.id),
      ];
      latest.current.select(available);
    }
  }, []);
  useEffect(() => {
    finish(false);
    return () => clearTimeout(timer.current);
  }, [scope, finish]);
  const handle = (action: string) => {
    if (action === 'tab-switcher-commit' || action === 'tab-switcher-cancel') {
      finish(action === 'tab-switcher-commit');
      return true;
    }
    if (action !== 'tab-switcher-next' && action !== 'tab-switcher-previous')
      return false;
    const direction = action === 'tab-switcher-next' ? 1 : -1;
    if (!session.current) {
      const byId = new Map(latest.current.tabs.map((tab) => [tab.id, tab]));
      const recent = history.current.flatMap((id) => {
        const tab = byId.get(id);
        return tab ? [tab] : [];
      });
      if (recent.length < 2) return true;
      session.current = {
        tabs: recent,
        index: 0,
      };
      timer.current = setTimeout(() => {
        if (session.current) setShown({ ...session.current });
      }, TAB_SWITCHER_DELAY);
    }
    const { current } = session;
    current.index =
      (current.index + direction + current.tabs.length) % current.tabs.length;
    setShown((previous) => (previous ? { ...current } : undefined));
    return true;
  };
  const remove = (ids: string[]) => {
    const removed = new Set(ids);
    history.current = history.current.filter((id) => !removed.has(id));
    finish(false);
    if (latest.current.selectedId && removed.has(latest.current.selectedId)) {
      const previous = history.current
        .map((id) => latest.current.tabs.find((tab) => tab.id === id))
        .find((tab) => tab && !removed.has(tab.id));
      if (previous) latest.current.select(previous);
    }
  };
  return { shown, handle, finish, remove };
}
