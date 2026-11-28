import { useCallback, useEffect, useState } from 'react';
import { isSidebarPage, type SidebarPage } from './useSidebarPages';
export type SidebarPageDocks = Partial<Record<SidebarPage, 'right' | 'bottom'>>;
const key = 'kudium-sidebar-page-docks';
export function useSidebarPageDocks(defaultPosition: 'right' | 'bottom') {
  const [docks, setDocks] = useState<SidebarPageDocks>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return Object.fromEntries(
        Object.keys(saved || {})
          .filter(isSidebarPage)
          .filter((page) => ['right', 'bottom'].includes(saved?.[page]))
          .map((page) => [page, saved[page]]),
      );
    } catch {
      return {};
    }
  });
  const changeDock = useCallback(
    (page: SidebarPage, position: 'right' | 'bottom') =>
      setDocks((previous) => ({ ...previous, [page]: position })),
    [],
  );
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(docks));
    } catch {
      /* Optional layout. */
    }
  }, [docks]);
  return {
    docks,
    resetDocks: () => setDocks({}),
    changeDock,
    position: (page: SidebarPage) => docks[page] || defaultPosition,
  };
}
