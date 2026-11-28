import { useCallback, useEffect, useState } from 'react';
import { isSidebarPage, type SidebarPage } from './useSidebarPages';

export type SidebarPageWidths = Partial<Record<SidebarPage, number>>;
export const sidebarPageWidthProperty = (page: SidebarPage) =>
  `--sidebar-page-${page}-width`;
const key = 'kudium-sidebar-page-widths';
const bounded = (width: number) =>
  Math.round(Math.max(240, Math.min(1200, width)));

/** Preserve the preference while fitting a right column to its visible area. */
export const fittedSidebarPageWidth = (
  page: SidebarPage,
  widths: SidebarPageWidths,
  defaultWidth: number,
  available: number,
) => Math.min(widths[page] ?? defaultWidth, Math.max(240, available));

/** Bottom docking fills its row; the final page absorbs the remaining width. */
export function bottomSidebarPageWidths(
  pages: readonly SidebarPage[],
  widths: SidebarPageWidths,
  defaultWidth: number,
  available: number,
): SidebarPageWidths {
  if (!pages.length || available <= 0) return widths;
  const room = Math.max(pages.length * 240, available - (pages.length - 1) * 8);
  const fixed = pages
    .slice(0, -1)
    .map((page) => Math.max(240, widths[page] ?? defaultWidth));
  const excess = fixed.reduce((sum, width) => sum + width - 240, 0);
  const allowance = Math.max(0, room - pages.length * 240);
  const factor = excess > allowance ? allowance / excess : 1;
  const fitted = fixed.map((width) => Math.floor(240 + (width - 240) * factor));
  const last = Math.max(
    240,
    room - fitted.reduce((sum, width) => sum + width, 0),
  );
  return Object.fromEntries(
    pages.map((page, index) => [page, fitted[index] ?? last]),
  );
}

/** Width preferences are independent of open order and dock position. */
export function useSidebarPageWidths() {
  const [widths, setWidths] = useState<SidebarPageWidths>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return Object.fromEntries(
        Object.keys(saved || {})
          .filter(isSidebarPage)
          .filter(
            (page) =>
              Number.isFinite(saved?.[page]) &&
              saved[page] >= 240 &&
              saved[page] <= 1200,
          )
          .map((page) => [page, Math.round(saved[page])]),
      );
    } catch {
      return {};
    }
  });
  const changeWidths = useCallback((changes: SidebarPageWidths) => {
    setWidths((previous) => ({
      ...previous,
      ...Object.fromEntries(
        Object.keys(changes)
          .filter(isSidebarPage)
          .filter((page) => Number.isFinite(changes[page]))
          .map((page) => [page, bounded(changes[page]!)]),
      ),
    }));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(widths));
    } catch {
      /* Optional layout. */
    }
  }, [widths]);
  return { widths, changeWidths, resetWidths: () => setWidths({}) };
}
