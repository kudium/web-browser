import { useCallback, useEffect, useRef, useState } from 'react';

export const SIDEBAR_PAGES = [
  'assistant',
  'tasks',
  'developer',
  'notes',
  'activity',
  'email',
  'panels',
] as const;
export type BuiltinSidebarPage = (typeof SIDEBAR_PAGES)[number];
export type SidebarPage = BuiltinSidebarPage | `native-${string}`;
export const isSidebarPage = (value: unknown): value is SidebarPage =>
  typeof value === 'string' &&
  ((SIDEBAR_PAGES as readonly string[]).includes(value) ||
    (/^native-[0-9a-f]+(?:-[0-9a-f]+)*$/.test(value) && value.length <= 4096));
export function nativeSidebarPage(panel: {
  id: string;
  key?: string;
}): SidebarPage {
  return `native-${Array.from(panel.key || panel.id)
    .map((char) => char.codePointAt(0)!.toString(16))
    .join('-')}`;
}
const key = 'kudium-open-sidebar-pages';

/** Window-local ordering with a durable restart layout; retained hosts own content. */
export function useSidebarPages(legacyOpen: boolean, legacyPage: SidebarPage) {
  const [pages, setPages] = useState<SidebarPage[]>(() => {
    try {
      const session = sessionStorage.getItem(key);
      const saved =
        session !== null
          ? JSON.parse(session)
          : JSON.parse(localStorage.getItem('kudium-sidebar-layout') || 'null')
              ?.pages;
      if (
        Array.isArray(saved) &&
        saved.length <= 64 &&
        saved.every(isSidebarPage)
      )
        return [...new Set(saved)] as SidebarPage[];
    } catch {
      /* Optional window layout. */
    }
    return legacyOpen ? [legacyPage] : [];
  });
  const [activation, setActivation] = useState(0);
  const current = useRef(pages);
  const [activePage, setActivePage] = useState<SidebarPage>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('kudium-sidebar-layout') || 'null',
      )?.activePage;
      if (isSidebarPage(saved) && pages.includes(saved)) return saved;
    } catch {
      /* Optional layout. */
    }
    return pages.at(-1) || legacyPage;
  });
  const lastPage = useRef(legacyPage);
  const previous = useRef<SidebarPage[]>(pages);
  const commit = useCallback((next: SidebarPage[]) => {
    current.current = next;
    setPages(next);
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(pages));
      localStorage.setItem(
        'kudium-sidebar-layout',
        JSON.stringify({ pages, activePage }),
      );
    } catch {
      /* Optional layout. */
    }
  }, [pages, activePage]);
  const openPage = useCallback(
    (page: SidebarPage) => {
      lastPage.current = page;
      setActivePage(page);
      setActivation((value) => value + 1);
      if (!current.current.includes(page)) commit([...current.current, page]);
    },
    [commit],
  );
  const closePage = useCallback(
    (page: SidebarPage) => {
      if (current.current.includes(page)) {
        const remaining = current.current.filter((item) => item !== page);
        setActivePage((active) =>
          active === page ? remaining.at(-1) || active : active,
        );
        commit(remaining);
      }
    },
    [commit],
  );
  const togglePage = useCallback(
    (page: SidebarPage) => {
      if (current.current.includes(page)) closePage(page);
      else openPage(page);
    },
    [openPage, closePage],
  );
  const setOpen = useCallback(
    (next: boolean | ((open: boolean) => boolean)) => {
      const open =
        typeof next === 'function' ? next(current.current.length > 0) : next;
      if (!open) {
        previous.current = current.current;
        commit([]);
      } else if (!current.current.length)
        commit(previous.current.length ? previous.current : [lastPage.current]);
    },
    [commit],
  );
  const reorder = useCallback(
    (page: SidebarPage, before?: SidebarPage) => {
      if (
        !current.current.includes(page) ||
        before === page ||
        (before && !current.current.includes(before))
      )
        return;
      const next = current.current.filter((item) => item !== page);
      next.splice(before ? next.indexOf(before) : next.length, 0, page);
      commit(next);
    },
    [commit],
  );
  const resetOrder = useCallback(
    () =>
      commit(
        [...current.current].sort((left, right) => {
          const index = (page: SidebarPage) => {
            const found = (SIDEBAR_PAGES as readonly string[]).indexOf(page);
            return found < 0 ? SIDEBAR_PAGES.length : found;
          };
          return index(left) - index(right);
        }),
      ),
    [commit],
  );
  return {
    pages,
    activePage,
    activation,
    reorder,
    resetOrder,
    openPage,
    closePage,
    togglePage,
    setOpen,
  };
}
