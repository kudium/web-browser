import { useEffect } from 'react';
import type { RefObject } from 'react';

/** Reopening a chat starts at its latest message; reading upward pauses following. */
export function useChatAutoScroll(
  log: RefObject<HTMLDivElement | null>,
  follow: RefObject<boolean>,
  active: boolean,
  conversationId: string | undefined,
  changing: boolean,
) {
  useEffect(() => {
    if (!active || changing) return undefined;
    follow.current = true;
    let frame: number;
    let observer: ResizeObserver | undefined;
    let node: HTMLDivElement | null = null;
    const scroll = () => {
      if (follow.current && node?.clientHeight)
        node.scrollTo({ top: node.scrollHeight, behavior: 'instant' });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scroll);
    };
    // Stable panel portals become visible after their parent commits. Measure on
    // the next frame rather than scrolling while the pane is still hidden.
    frame = requestAnimationFrame(() => {
      node = log.current;
      if (!node) return;
      scroll();
      observer = new ResizeObserver(schedule);
      observer.observe(node);
      node.addEventListener('load', schedule, true);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      node?.removeEventListener('load', schedule, true);
    };
  }, [log, follow, active, conversationId, changing]);
}
