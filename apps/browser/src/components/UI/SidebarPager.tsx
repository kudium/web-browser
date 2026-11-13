import { ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { swipeDirection } from '../../utils/sidebarNavigation';
import { browser } from '../../browser/client';

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
  const retainChromeFocus = useRef(false);
  const transition = useRef<{ offset: number; direction: number }>();
  const touch = useRef<{ x: number; y: number }>();
  const gesture = useRef({
    x: 0,
    y: 0,
    last: -Infinity,
    locked: false,
    axis: '',
  });
  const frame = useRef<number>();
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  const nativeEnabled = useRef(false);
  const nativeGesture = useRef(false);
  const wheelInput = useRef<(event: WheelEvent, native?: boolean) => void>();
  const rearmTimer = useRef<ReturnType<typeof setTimeout>>();
  const motion = () =>
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rearm = () => {
    if (rearmTimer.current) clearTimeout(rearmTimer.current);
    rearmTimer.current = setTimeout(() => {
      gesture.current = {
        x: 0,
        y: 0,
        last: -Infinity,
        locked: false,
        axis: '',
      };
      rearmTimer.current = undefined;
    }, 140);
  };
  const move = (x: number) => {
    const element = pane.current;
    if (!element) return;
    const width = root.current?.clientWidth || 240;
    const offset = Math.max(-width, Math.min(width, -x));

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
    const step = cancel
      ? 0
      : swipeDirection(data.x, data.axis === 'x' ? 0 : data.y);
    const element = pane.current;
    if (!element) return;
    const width = root.current?.clientWidth || 240;
    const offset = Math.max(-width, Math.min(width, -data.x));
    data.locked = true;
    // Native trackpad gestures stay consumed until the next finger-down phase.
    if (!nativeGesture.current) rearm();
    if (!step) {
      const moved = element.style.transform;
      element.style.transform = '';
      if (motion() && moved)
        element.animate(
          [
            { transform: `translate3d(${offset}px,0,0)` },
            { transform: 'translate3d(0,0,0)' },
          ],
          { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
      return;
    }
    move(data.x);
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
    // Showing another native webpage can take focus away from the chrome.
    // Retain sidebar input after a click or gesture until the pointer leaves.
    if (retainChromeFocus.current)
      browser.command({ id: '', action: 'focus-chrome' });
    const element = pane.current;
    if (!element) return;
    const width = root.current?.clientWidth || 240;
    const pending = transition.current;
    transition.current = undefined;
    element.getAnimations().forEach((animation) => animation.cancel());
    element.style.transform = '';
    if (!motion()) {
      outgoing.current?.replaceChildren();
      return;
    }
    const step = pending?.direction || direction;
    const start = pending ? step * width + pending.offset : step * width;
    element.animate(
      [
        { transform: `translate3d(${start}px,0,0)` },
        { transform: 'translate3d(0,0,0)' },
      ],
      { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' }
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
        { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
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
    const wheel = (event: WheelEvent, native = false) => {
      if (event.ctrlKey || event.shiftKey || (!event.deltaX && !event.deltaY))
        return;
      if (nativeEnabled.current && !native) {
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY))
          event.preventDefault();
        return;
      }
      const data = gesture.current;
      const now = performance.now();
      if (!data.locked && now - data.last > 220) {
        if (rearmTimer.current) {
          clearTimeout(rearmTimer.current);
          rearmTimer.current = undefined;
        }
        // Wheel input over this surface is sufficient to retain chrome focus.
        if (!retainChromeFocus.current)
          browser.command({ id: '', action: 'focus-chrome' });
        retainChromeFocus.current = true;
        data.x = 0;
        data.y = 0;
        data.locked = false;
        data.axis = '';
        pane.current
          ?.getAnimations()
          .forEach((animation) => animation.cancel());
        outgoing.current?.replaceChildren();
      }
      data.last = now;
      const scale =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
          ? element.clientWidth || 240
          : 1;
      if (data.locked) {
        rearm();
        if (data.axis === 'x') event.preventDefault();
        return;
      }
      const limit = element.clientWidth || 240;
      data.x = Math.max(-limit, Math.min(limit, data.x + event.deltaX * scale));
      data.y += event.deltaY * scale;
      // Tiny initial trackpad noise should not lock the entire swipe to vertical.
      if (!data.axis) {
        if (Math.max(Math.abs(data.x), Math.abs(data.y)) < 6) return;
        data.axis = Math.abs(data.x) > Math.abs(data.y) * 1.25 ? 'x' : 'y';
      }
      if (data.axis !== 'x') return;
      event.preventDefault();
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (swipeDirection(data.x, 0)) {
        // Commit deliberate intent promptly; do not wait for trackpad momentum.
        settleRef.current();
      } else {
        scheduleRef.current();
        settleTimer.current = setTimeout(() => settleRef.current(), 110);
      }
    };
    wheelInput.current = wheel;
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (rearmTimer.current) clearTimeout(rearmTimer.current);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, []);
  useEffect(
    () =>
      browser.onSpaceWheel?.((event) => {
        if ('available' in event) {
          nativeEnabled.current = event.available;
          return;
        }
        if (!nativeEnabled.current || event.momentum) return;
        const bounds = root.current?.getBoundingClientRect();
        if (
          !bounds ||
          event.x < bounds.left ||
          event.x >= bounds.right ||
          event.y < bounds.top ||
          event.y >= bounds.bottom
        )
          return;
        if (!event.phase) {
          nativeGesture.current = false;
          wheelInput.current?.(
            new WheelEvent('wheel', {
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              cancelable: true,
            }),
            true
          );
          return;
        }
        if (event.phase & 1) {
          if (settleTimer.current) clearTimeout(settleTimer.current);
          if (rearmTimer.current) clearTimeout(rearmTimer.current);
          nativeGesture.current = true;
          gesture.current = {
            x: 0,
            y: 0,
            last: performance.now(),
            locked: false,
            axis: '',
          };
          retainChromeFocus.current = true;
          browser.command({ id: '', action: 'focus-chrome' });
          pane.current
            ?.getAnimations()
            .forEach((animation) => animation.cancel());
          outgoing.current?.replaceChildren();
        }
        if (!nativeGesture.current) return;
        if (event.phase & (8 | 16)) {
          if (!gesture.current.locked) settleRef.current(true);
          return;
        }
        const data = gesture.current;
        if (data.locked) return;
        data.x += event.deltaX;
        data.y += event.deltaY;
        if (!data.axis && Math.max(Math.abs(data.x), Math.abs(data.y)) >= 6)
          data.axis = Math.abs(data.x) > Math.abs(data.y) * 1.25 ? 'x' : 'y';
        if (data.axis !== 'x') return;
        if (swipeDirection(data.x, 0)) settleRef.current();
        else scheduleRef.current();
      }),
    []
  );
  return (
    <div
      ref={root}
      className="sidebar-pager"
      aria-label="Sidebar spaces"
      onPointerLeave={() => {
        retainChromeFocus.current = false;
      }}
      onPointerDown={(event) => {
        browser.command({ id: '', action: 'focus-chrome' });
        retainChromeFocus.current = true;
        if (event.pointerType !== 'touch') return;
        nativeGesture.current = false;
        if (rearmTimer.current) {
          clearTimeout(rearmTimer.current);
          rearmTimer.current = undefined;
        }
        touch.current = { x: event.clientX, y: event.clientY };
        gesture.current = {
          x: 0,
          y: 0,
          last: performance.now(),
          locked: false,
          axis: '',
        };
        pane.current
          ?.getAnimations()
          .forEach((animation) => animation.cancel());
        outgoing.current?.replaceChildren();
      }}
      onPointerMove={(event) => {
        if (!touch.current || gesture.current.locked) return;
        gesture.current.x = touch.current.x - event.clientX;
        gesture.current.y = touch.current.y - event.clientY;
        const data = gesture.current;
        if (!data.axis && Math.max(Math.abs(data.x), Math.abs(data.y)) > 8) {
          data.axis = Math.abs(data.x) > Math.abs(data.y) * 1.25 ? 'x' : 'y';
          if (data.axis === 'x')
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        if (data.axis === 'x') schedule();
      }}
      onPointerUp={() => {
        if (touch.current) {
          touch.current = undefined;
          settle(gesture.current.axis !== 'x');
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
