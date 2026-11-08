// Optional resize settings use parameter defaults for both sidebar positions.
/* eslint-disable react/require-default-props */
import { useEffect, useRef } from 'react';

export const defaultSidebarWidth = 300;
const minimum = 240;
const maximum = () => Math.max(minimum, Math.min(480, window.innerWidth - 360));
export function savedSidebarWidth() {
  const saved = Number(localStorage.getItem('touchbox-sidebar-width'));
  return Number.isFinite(saved) && saved >= minimum
    ? Math.min(saved, maximum())
    : defaultSidebarWidth;
}
export function SidebarResizeHandle({
  width,
  onChange,
  onResizingChange,
  side = 'left',
  minWidth = minimum,
  maxWidth = maximum(),
  resetWidth = defaultSidebarWidth,
}: {
  width: number;
  side?: 'left' | 'right';
  minWidth?: number;
  maxWidth?: number;
  resetWidth?: number;
  onChange: (nextWidth: number) => void;
  onResizingChange: (resizing: boolean) => void;
}) {
  const drag = useRef<{ pointer: number; x: number; width: number }>();
  const removeDragListeners = useRef<() => void>();
  useEffect(() => () => removeDragListeners.current?.(), []);
  const change = (value: number) =>
    onChange(Math.round(Math.max(minWidth, Math.min(maxWidth, value))));
  const finish = () => {
    removeDragListeners.current?.();
    removeDragListeners.current = undefined;
    if (drag.current) {
      drag.current = undefined;
      onResizingChange(false);
    }
  };
  // Focusable separators follow the WAI-ARIA window-splitter keyboard pattern.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={side === 'right' ? 'Resize AI sidebar' : 'Resize sidebar'}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.min(width, maxWidth)}
      className={`sidebar-resize-handle ${
        side === 'right' ? 'ai-resize-handle' : ''
      }`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          pointer: event.pointerId,
          x: event.clientX,
          width:
            side === 'right'
              ? width
              : event.currentTarget.parentElement?.getBoundingClientRect()
                  .width || width,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        // Suspending a native WebContentsView can release DOM capture. Track
        // this drag at window level until its matching release/cancellation.
        const move = (input: PointerEvent) => {
          if (drag.current?.pointer === input.pointerId)
            change(
              drag.current.width +
                (input.clientX - drag.current.x) * (side === 'right' ? -1 : 1)
            );
        };
        const release = (input: PointerEvent) => {
          if (drag.current?.pointer !== input.pointerId) return;
          move(input);
          finish();
        };
        const cancel = () => finish();
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('blur', cancel);
        removeDragListeners.current = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', release);
          window.removeEventListener('pointercancel', cancel);
          window.removeEventListener('blur', cancel);
        };
        onResizingChange(true);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointer === event.pointerId)
          change(
            drag.current.width +
              (event.clientX - drag.current.x) * (side === 'right' ? -1 : 1)
          );
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        change(
          drag.current.width +
            (event.clientX - drag.current.x) * (side === 'right' ? -1 : 1)
        );
        finish();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={finish}
      onDoubleClick={() => change(resetWidth)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 30 : 10;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          change(width + (side === 'right' ? step : -step));
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          change(width + (side === 'right' ? -step : step));
        }
        if (event.key === 'Home') {
          event.preventDefault();
          change(minWidth);
        }
        if (event.key === 'End') {
          event.preventDefault();
          change(maxWidth);
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          change(resetWidth);
        }
      }}
    />
  );
}
