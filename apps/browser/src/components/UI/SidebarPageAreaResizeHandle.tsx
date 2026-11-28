import type { RefObject } from 'react';
import type { SidebarPage } from '../../utils/hooks/useSidebarPages';
import { sidebarPageWidthProperty } from '../../utils/hooks/useSidebarPageWidths';
import { SidebarResizeHandle } from './SidebarResizeHandle';

/** The outer edge temporarily sizes both the first column and its dock area. */
export function SidebarPageAreaResizeHandle({
  page,
  width,
  totalWidth,
  maxAreaWidth,
  target,
  onChange,
  onResizingChange,
}: {
  page: SidebarPage;
  width: number;
  totalWidth: number;
  maxAreaWidth: number;
  target: RefObject<HTMLElement | null>;
  onChange: (width: number) => void;
  onResizingChange: (resizing: boolean) => void;
}) {
  const property = sidebarPageWidthProperty(page);
  const areaWidth = (next: number) =>
    Math.min(maxAreaWidth, totalWidth - width + next);
  return (
    <SidebarResizeHandle
      side="right"
      label="Resize panel"
      width={width}
      minWidth={240}
      maxWidth={Math.min(1200, maxAreaWidth)}
      resetWidth={368}
      liveResize={{ target, property }}
      onLiveChange={(next) =>
        target.current?.style.setProperty(
          '--right-panels-width',
          `${areaWidth(next)}px`,
        )
      }
      onChange={(next) => {
        onChange(next);
        // Do not leave a workspace-level override shadowing later saved widths.
        target.current?.style.removeProperty(property);
        // Write the committed area even if React's style value did not change.
        target.current?.style.setProperty(
          '--right-panels-width',
          `${areaWidth(next)}px`,
        );
      }}
      onResizingChange={onResizingChange}
    />
  );
}
