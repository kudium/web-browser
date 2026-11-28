import { browser } from '../../browser/client';
import {
  SidebarPageLayoutContext,
  PANEL_DRAG_MIME,
} from './SidebarPageLayoutContext';
import { isSidebarPage } from '../../utils/hooks/useSidebarPages';
import { createPortal } from 'react-dom';
import { SidebarPageDockContext } from './SidebarPageDockContext';
import type { SidebarPageDocks } from '../../utils/hooks/useSidebarPageDocks';
import type { RefObject } from 'react';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import { ASSISTANT_PANEL_NAMES } from './AssistantPanelHost';
import {
  sidebarPageWidthProperty,
  bottomSidebarPageWidths,
  fittedSidebarPageWidth,
  type SidebarPageWidths,
} from '../../utils/hooks/useSidebarPageWidths';
import { frameResizeObserver } from '../../utils/frameResizeObserver';
import {
  Children,
  useCallback,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SidebarPage } from '../../utils/hooks/useSidebarPages';

/** Keep every host keyed and mounted while arranging open pages in opening order. */
export function SidebarPageColumns({
  pages,
  children,
  selectedPage,
  activation,
  widths = {},
  defaultWidth = 368,
  dockPosition = 'right',
  pageDocks,
  onPageDockChange,
  bottomTarget,
  onWidthsChange,
  onResizingChange = () => {},
  onReorder,
  onBalance,
  onReset,
}: {
  pages?: readonly SidebarPage[];
  selectedPage?: SidebarPage;
  activation?: number;
  children: ReactNode;
  widths?: SidebarPageWidths;
  defaultWidth?: number;
  dockPosition?: 'right' | 'bottom';
  pageDocks?: SidebarPageDocks;
  onPageDockChange?: (page: SidebarPage, position: 'right' | 'bottom') => void;
  bottomTarget?: HTMLElement | null;
  onWidthsChange?: (changes: SidebarPageWidths) => void;
  onResizingChange?: (resizing: boolean) => void;
  onReorder?: (page: SidebarPage, before?: SidebarPage) => void;
  onBalance?: (position: 'right' | 'bottom') => void;
  onReset?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [rightTarget, setRightTarget] = useState<HTMLDivElement | null>(null);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    root.current = node;
    setRightTarget(node);
  }, []);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [rightAvailableWidth, setRightAvailableWidth] = useState(0);
  const position = (page: SidebarPage) => pageDocks?.[page] || dockPosition;
  const bottomPages =
    pages?.filter((page) => position(page) === 'bottom') || [];
  const bottomWidths = bottomSidebarPageWidths(
    bottomPages,
    widths,
    defaultWidth,
    availableWidth,
  );
  const displayWidths: SidebarPageWidths = {
    ...widths,
    ...Object.fromEntries(
      (pages || [])
        .filter((page) => position(page) === 'right' && rightAvailableWidth > 0)
        .map((page) => [
          page,
          fittedSidebarPageWidth(
            page,
            widths,
            defaultWidth,
            rightAvailableWidth,
          ),
        ]),
    ),
    ...Object.fromEntries(
      bottomPages.map((page) => [page, bottomWidths[page] ?? defaultWidth]),
    ),
  };
  useLayoutEffect(() => {
    const scroller = (bottomTarget || root.current)?.parentElement;
    if (!scroller) return undefined;
    const keepSelectedVisible = () => {
      const page =
        selectedPage && pages?.includes(selectedPage)
          ? selectedPage
          : pages?.at(-1);
      const group =
        page && position(page) === 'bottom'
          ? bottomTarget || root.current
          : root.current;
      const areaScroller = group?.parentElement;
      if (!areaScroller) return;
      const column = group?.querySelector<HTMLElement>(
        `[data-sidebar-page="${page}"]:not([hidden])`,
      );
      if (!column) return;
      const bounds = column.getBoundingClientRect(),
        area = areaScroller.getBoundingClientRect();
      // A column wider than the area cannot show both edges. Keep its leading
      // edge stable instead of alternating left/right on every resize callback.
      if (bounds.width > area.width) {
        if (bounds.left !== area.left)
          areaScroller.scrollLeft += bounds.left - area.left;
      } else if (bounds.right > area.right)
        areaScroller.scrollLeft += bounds.right - area.right;
      else if (bounds.left < area.left)
        areaScroller.scrollLeft -= area.left - bounds.left;
    };
    const resized = () => {
      setAvailableWidth(scroller.clientWidth);
      setRightAvailableWidth(root.current?.parentElement?.clientWidth || 0);
      keepSelectedVisible();
    };
    resized();
    const observer = frameResizeObserver(resized);
    observer.observe(scroller);
    if (root.current?.parentElement && root.current.parentElement !== scroller)
      observer.observe(root.current.parentElement);
    return () => observer.disconnect();
  }, [pages, selectedPage, activation, dockPosition, pageDocks, bottomTarget]);
  if (!pages) return <>{children}</>;
  const hosts = Children.toArray(children).filter(
    isValidElement<{ panel?: SidebarPage }>,
  );
  const entries = hosts.map((host) => ({
    id: host.props.panel || ('panels' as SidebarPage),
    host,
  }));
  entries.sort((left, right) => {
    const index = (id: SidebarPage) =>
      pages.includes(id) ? pages.indexOf(id) : pages.length;
    return index(left.id) - index(right.id);
  });
  return (
    <div className="sidebar-page-columns" ref={setRoot}>
      {entries.map(({ id, host }) => {
        const groupPages = pages.filter(
          (page) => position(page) === position(id),
        );
        const nextId = groupPages[groupPages.indexOf(id) + 1];
        const groupTarget = position(id) === 'bottom' ? bottomTarget : null;
        const resizeRoot = groupTarget ? { current: groupTarget } : root;
        const width = displayWidths[id] ?? defaultWidth;
        const nextWidth = nextId ? (displayWidths[nextId] ?? defaultWidth) : 0;
        const total = width + nextWidth;
        const name = (page: SidebarPage) =>
          page === 'panels'
            ? 'Panels'
            : page.startsWith('native-')
              ? 'Panel'
              : ASSISTANT_PANEL_NAMES[
                  page as keyof typeof ASSISTANT_PANEL_NAMES
                ];
        const property = sidebarPageWidthProperty(id);
        const index = groupPages.indexOf(id);
        const move = (direction: -1 | 1) => {
          if (
            !onReorder ||
            index + direction < 0 ||
            index + direction >= groupPages.length
          )
            return;
          onReorder(
            id,
            direction === -1 ? groupPages[index - 1] : groupPages[index + 2],
          );
        };
        const menu = () => {
          void browser
            .nativeMenu([
              { id: 'previous', label: 'Move panel left', enabled: index > 0 },
              {
                id: 'next',
                label: 'Move panel right',
                enabled: index < groupPages.length - 1,
              },
              { id: 'balance', label: 'Balance panel widths' },
              { id: 'reset', label: 'Reset panel layout' },
            ])
            .then((choice) => {
              if (choice === 'previous') move(-1);
              if (choice === 'next') move(1);
              if (choice === 'balance') onBalance?.(position(id));
              if (choice === 'reset') onReset?.();
            })
            .catch(() => {});
        };
        return (
          <RetainedColumn
            key={id}
            order={pages.indexOf(id)}
            target={groupTarget || rightTarget}
            fallback={root}
            width={width}
            property={property}
            active={pages.includes(id)}
            position={position(id)}
            onDock={
              onPageDockChange
                ? (value) => onPageDockChange(id, value)
                : undefined
            }
          >
            <div
              className="sidebar-page-column"
              data-sidebar-page={id}
              hidden={!pages.includes(id)}
            >
              <SidebarPageLayoutContext.Provider
                value={onReorder ? { page: id, menu, move } : null}
              >
                <div
                  className="sidebar-page-retained-content"
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes(PANEL_DRAG_MIME)) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(event) => {
                    const page = event.dataTransfer.getData(PANEL_DRAG_MIME);
                    if (isSidebarPage(page)) {
                      event.preventDefault();
                      event.stopPropagation();
                      onReorder?.(page, id);
                    }
                  }}
                >
                  {host}
                </div>
              </SidebarPageLayoutContext.Provider>
            </div>
            {pages.includes(id) && nextId && onWidthsChange && (
              <SidebarResizeHandle
                label={`Resize ${name(id)} and ${name(nextId)}`}
                className="sidebar-column-resize-handle"
                width={width}
                minWidth={
                  position(id) === 'bottom'
                    ? 240
                    : Math.max(
                        240,
                        total - Math.min(1200, rightAvailableWidth || 1200),
                      )
                }
                maxWidth={Math.min(
                  1200,
                  total - 240,
                  position(id) === 'right' ? rightAvailableWidth || 1200 : 1200,
                )}
                resetWidth={Math.round(total / 2)}
                liveResize={{ target: resizeRoot, property }}
                onLiveChange={(value) =>
                  resizeRoot.current?.style.setProperty(
                    sidebarPageWidthProperty(nextId),
                    `${total - value}px`,
                  )
                }
                onChange={(value) => {
                  onWidthsChange({ [id]: value, [nextId]: total - value });
                  // React's committed widths become the source after the drag.
                  if (position(id) === 'right') {
                    resizeRoot.current?.style.removeProperty(property);
                    resizeRoot.current?.style.removeProperty(
                      sidebarPageWidthProperty(nextId),
                    );
                  }
                }}
                onResizingChange={onResizingChange}
              />
            )}
          </RetainedColumn>
        );
      })}
    </div>
  );
}

/** Moving the same portal container preserves editors and native slot identity. */
function RetainedColumn({
  order,
  target,
  fallback,
  width,
  property,
  active,
  position,
  onDock,
  children,
}: {
  order: number;
  target?: HTMLElement | null;
  fallback: RefObject<HTMLDivElement | null>;
  width: number;
  property: string;
  active: boolean;
  position: 'right' | 'bottom';
  onDock?: (position: 'right' | 'bottom') => void;
  children: ReactNode;
}) {
  const [container] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    const focused =
      document.activeElement instanceof HTMLElement &&
      container.contains(document.activeElement)
        ? document.activeElement
        : null;
    (target || fallback.current)?.appendChild(container);
    focused?.focus({ preventScroll: true });
  }, [container, target, fallback, order]);
  useLayoutEffect(() => () => container.remove(), [container]);
  useLayoutEffect(() => {
    container.className = 'sidebar-page-column-shell';
    container.hidden = !active;
    container.style.width = `var(${property}, ${width}px)`;
    container.style.flexBasis = `var(${property}, ${width}px)`;
    // Bottom widths override right-dock preferences on the shared parent, so live resize remains shared.
    if (position === 'bottom')
      (target || fallback.current)?.style.setProperty(property, `${width}px`);
    else (target || fallback.current)?.style.removeProperty(property);
  }, [container, active, width, property, position, target, fallback]);
  return createPortal(
    <SidebarPageDockContext.Provider
      value={onDock ? { position, change: onDock } : null}
    >
      {children}
    </SidebarPageDockContext.Provider>,
    container,
  );
}
