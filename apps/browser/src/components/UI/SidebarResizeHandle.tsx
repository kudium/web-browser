// Optional resize settings use parameter defaults for both sidebar positions.
/* eslint-disable react/require-default-props */
import { RefObject, useEffect, useRef } from 'react';

export const defaultSidebarWidth = 300;
const minimum = 240;
const maximum = () => Math.max(minimum, Math.min(480, window.innerWidth - 360));
export function savedSidebarWidth() {
  const saved = Number(localStorage.getItem('kudiumbrowser-sidebar-width'));
  return Number.isFinite(saved) && saved >= minimum
    ? Math.min(saved, maximum())
    : defaultSidebarWidth;
}
export function SidebarResizeHandle({
  width,
  axis = 'horizontal',
  label,
  className = '',
  onChange,
  onResizingChange,
  side = 'left',
  minWidth = minimum,
  maxWidth = maximum(),
  resetWidth = defaultSidebarWidth,
  liveResize,
  onLiveChange,
  step = 10,
}: {
  width: number;
  step?: number;
  liveResize?: { target: RefObject<HTMLElement | null>; property: string };
  axis?: 'horizontal' | 'vertical';
  label?: string;
  className?: string;
  side?: 'left' | 'right';
  minWidth?: number;
  maxWidth?: number;
  resetWidth?: number;
  onChange: (nextWidth: number) => void;
  onLiveChange?: (nextWidth: number) => void;
  onResizingChange: (resizing: boolean) => void;
}) {
  const drag = useRef<
    { pointer: number; x: number; width: number } | undefined
  >(undefined);
  const frame = useRef(0);
  const liveWidth = useRef<number | undefined>(undefined);
  const pendingWidth = useRef<number | undefined>(undefined);
  const removeDragListeners = useRef<() => void | undefined>(undefined);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      removeDragListeners.current?.();
    },
    []
  );
  const change = (value: number) => {
    const next = Math.round(Math.max(minWidth, Math.min(maxWidth, value)));
    const target = liveResize?.target.current;
    if (drag.current && target && liveResize) {
      target.style.setProperty(liveResize.property, `${next}px`);
      if (liveWidth.current !== next) onLiveChange?.(next);
      liveWidth.current = next;
    } else onChange(next);
  };
  const flush = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (pendingWidth.current !== undefined) {
      change(pendingWidth.current);
      pendingWidth.current = undefined;
    }
  };
  const finish = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    pendingWidth.current = undefined;
    removeDragListeners.current?.();
    removeDragListeners.current = undefined;
    if (drag.current) {
      if (liveWidth.current !== undefined) onChange(liveWidth.current);
      liveWidth.current = undefined;
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
      aria-label={
        label || (side === 'right' ? 'Resize AI sidebar' : 'Resize sidebar')
      }
      aria-orientation={axis === 'vertical' ? 'horizontal' : 'vertical'}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.min(width, maxWidth)}
      className={`sidebar-resize-handle ${
        (side === 'right' ? 'ai-resize-handle' : '') + ' ' + className
      }`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          pointer: event.pointerId,
          x: axis === 'vertical' ? event.clientY : event.clientX,
          width:
            side === 'right'
              ? width
              : event.currentTarget.parentElement?.getBoundingClientRect()
                  .width || width,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        // Keep tracking the captured drag through native view boundary changes
        // until its matching release or cancellation.
        const move = (input: PointerEvent) => {
          if (drag.current?.pointer === input.pointerId) {
            pendingWidth.current =
              drag.current.width +
              ((axis === 'vertical' ? input.clientY : input.clientX) -
                drag.current.x) *
                (side === 'right' ? -1 : 1);
            if (!frame.current) frame.current = requestAnimationFrame(flush);
          }
        };
        const release = (input: PointerEvent) => {
          if (drag.current?.pointer !== input.pointerId) return;
          move(input);
          flush();
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
      onPointerCancel={finish}
      onDoubleClick={() => change(resetWidth)}
      onKeyDown={(event) => {
        const increment = event.shiftKey ? step * 3 : step;
        if (event.key === (axis === 'vertical' ? 'ArrowUp' : 'ArrowLeft')) {
          event.preventDefault();
          change(width + (side === 'right' ? increment : -increment));
        }
        if (event.key === (axis === 'vertical' ? 'ArrowDown' : 'ArrowRight')) {
          event.preventDefault();
          change(width + (side === 'right' ? -increment : increment));
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
