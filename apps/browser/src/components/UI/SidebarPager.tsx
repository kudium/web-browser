import { ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { swipeDirection } from '../../utils/sidebarNavigation';

export function SidebarPager({
  page,
  direction,
  onSwipe,
  children,
}: {
  page: string;
  direction: number;
  onSwipe: (step: number) => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const outgoing = useRef<HTMLDivElement>(null);
  const callback = useRef(onSwipe);
  callback.current = onSwipe;
  const previous = useRef(page);
  const transition = useRef<{ offset: number; direction: number }>();
  const touch = useRef<{ x: number; y: number }>();
  const gesture = useRef({ x: 0, y: 0, last: 0, locked: false });
  const frame = useRef<number>();
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  const motion = () =>
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const move = (x: number) => {
    const element = pane.current;
    if (!element) return;
    const width = root.current?.clientWidth || 240;
    const offset = Math.max(-width * 0.85, Math.min(width * 0.85, -x));
    element.getAnimations().forEach((animation) => animation.cancel());
    element.style.transform = motion() ? `translate3d(${offset}px,0,0)` : '';
  };
  const schedule = () => {
    if (frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      move(gesture.current.x);
    });
  };
  const settle = (cancel = false) => {
    if (frame.current !== undefined) {
      cancelAnimationFrame(frame.current);
      frame.current = undefined;
    }
    const data = gesture.current;
    if (data.locked) return;
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = undefined;
    }
    const step = cancel ? 0 : swipeDirection(data.x, data.y);
    const element = pane.current;
    if (!element) return;
    const width = root.current?.clientWidth || 240;
    const offset = Math.max(-width * 0.85, Math.min(width * 0.85, -data.x));
    data.locked = true;
    if (!step) {
      const moved = element.style.transform;
      element.style.transform = '';
      if (motion() && moved)
        element.animate(
          [
            { transform: `translate3d(${offset}px,0,0)` },
            { transform: 'translate3d(0,0,0)' },
          ],
          { duration: 140, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      return;
    }
    if (outgoing.current && motion()) {
      const snapshot = element.cloneNode(true) as HTMLElement;
      snapshot.removeAttribute('data-sidebar-page');
      snapshot.removeAttribute('id');
      snapshot
        .querySelectorAll('[id]')
        .forEach((node) => node.removeAttribute('id'));
      snapshot.inert = true;
      snapshot.setAttribute('aria-hidden', 'true');
      outgoing.current.replaceChildren(snapshot);
    }
    transition.current = { offset, direction: step };
    callback.current(step);
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  useLayoutEffect(() => {
    if (previous.current === page) return;
    previous.current = page;
    const element = pane.current;
    if (!element) return;
    const width = root.current?.clientWidth || 240;
    const pending = transition.current;
    transition.current = undefined;
    element.style.transform = '';
    if (!motion()) {
      outgoing.current?.replaceChildren();
      return;
    }
    const step = pending?.direction || direction;
    const start = pending ? step * width + pending.offset : step * 32;
    element.animate(
      [
        { transform: `translate3d(${start}px,0,0)` },
        { transform: 'translate3d(0,0,0)' },
      ],
      { duration: 140, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
    const snapshot = outgoing.current?.firstElementChild as
      | HTMLElement
      | undefined;
    if (snapshot && pending) {
      const animation = snapshot.animate(
        [
          { transform: `translate3d(${pending.offset}px,0,0)` },
          { transform: `translate3d(${-step * width}px,0,0)` },
        ],
        { duration: 140, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
      );
      animation.finished
        .then(() => {
          snapshot.remove();
          return null;
        })
        .catch(() => {});
    }
  }, [page, direction]);

  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return;
      const data = gesture.current;
      const now = performance.now();
      if (now - data.last > 180) {
        data.x = 0;
        data.y = 0;
        data.locked = false;
      }
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) && !data.x) return;
      event.preventDefault();
      data.last = now;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (data.locked) return;
      const scale = event.deltaMode === 1 ? 16 : 1;
      data.x += event.deltaX * scale;
      data.y += event.deltaY * scale;
      if (swipeDirection(data.x, data.y)) settleRef.current();
      else {
        scheduleRef.current();
        settleTimer.current = setTimeout(() => settleRef.current(), 90);
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, []);
  return (
    <div
      ref={root}
      className="sidebar-pager"
      aria-label="Sidebar spaces"
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch') return;
        touch.current = { x: event.clientX, y: event.clientY };
        gesture.current = {
          x: 0,
          y: 0,
          last: performance.now(),
          locked: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!touch.current || gesture.current.locked) return;
        gesture.current.x = touch.current.x - event.clientX;
        gesture.current.y = touch.current.y - event.clientY;
        if (swipeDirection(gesture.current.x, gesture.current.y)) settle();
        else if (Math.abs(gesture.current.x) > Math.abs(gesture.current.y))
          schedule();
      }}
      onPointerUp={() => {
        if (touch.current) {
          touch.current = undefined;
          settle();
        }
      }}
      onPointerCancel={() => {
        touch.current = undefined;
        settle(true);
      }}
    >
      <div ref={outgoing} className="sidebar-outgoing" aria-hidden="true" />
      <div ref={pane} className="sidebar-page" data-sidebar-page={page}>
        {children}
      </div>
    </div>
  );
}
