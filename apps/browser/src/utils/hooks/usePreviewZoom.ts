import { useEffect, useRef } from 'react';

export const clampPreviewZoom = (zoom: number) =>
  Math.min(4, Math.max(0.25, zoom));

/** Chromium delivers trackpad pinch as a Ctrl-wheel event. */
export function usePreviewZoom(zoom: number, setZoom: (zoom: number) => void) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef(zoom);
  current.current = zoom;
  const update = useRef(setZoom);
  update.current = setZoom;
  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    let distance = 0;
    const change = (factor: number) => {
      current.current = clampPreviewZoom(current.current * factor);
      update.current(current.current);
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
          ? element.clientHeight
          : 1);
      change(Math.exp(-delta * 0.01));
    };
    const touch = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        distance = 0;
        return;
      }
      event.preventDefault();
      const [a, b] = Array.from(event.touches);
      const next = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (distance > 0 && next > 0) change(next / distance);
      distance = next;
    };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('touchstart', touch, { passive: false });
    element.addEventListener('touchmove', touch, { passive: false });
    element.addEventListener('touchend', touch);
    element.addEventListener('touchcancel', touch);
    return () => {
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('touchstart', touch);
      element.removeEventListener('touchmove', touch);
      element.removeEventListener('touchend', touch);
      element.removeEventListener('touchcancel', touch);
    };
  }, []);
  return container;
}
