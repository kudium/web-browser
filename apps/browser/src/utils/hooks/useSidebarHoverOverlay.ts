import { useEffect, useRef, useState } from 'react';

export function useSidebarHoverOverlay(
  hidden: boolean,
  sidebar: HTMLElement | null,
  holdOpen: boolean,
  onReady?: (callback: (token: number) => void) => () => void,
  onEdge?: (callback: (inside: boolean) => void) => () => void,
) {
  const [revealed, setRevealed] = useState(false);
  const [readyToken, setReadyToken] = useState(0);
  const token = useRef(0);
  const requested = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const inside = useRef(false);
  const held = useRef(holdOpen);
  held.current = holdOpen;
  const clear = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = undefined;
  };
  const focused = () =>
    sidebar?.contains(document.activeElement) &&
    (document.documentElement.dataset.inputModality === 'keyboard' ||
      document.activeElement?.matches(
        'input, textarea, [contenteditable="true"]',
      ));
  const dismiss = () => {
    clear();
    inside.current = false;
    requested.current = false;
    token.current++;
    setRevealed(false);
  };
  const leave = () => {
    inside.current = false;
    if (held.current || focused() || leaveTimer.current !== undefined) return;
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = undefined;
      if (!inside.current && !held.current && !focused()) dismiss();
    }, 180);
  };
  const enter = () => {
    inside.current = true;
    clear();
  };
  const reveal = () => {
    if (!hidden) return;
    enter();
    if (!requested.current) {
      requested.current = true;
      token.current++;
    }
    setRevealed(true);
  };
  const enterEdge = reveal;

  useEffect(
    () =>
      onEdge?.((inside) => {
        if (inside) reveal();
        else if (requested.current) leave();
      }),
    [onEdge, hidden, sidebar],
  );
  useEffect(
    () =>
      onReady?.((next) => {
        if (requested.current && next === token.current) setReadyToken(next);
      }),
    [onReady],
  );
  useEffect(() => {
    if (!hidden) dismiss();
  }, [hidden]);
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (revealed && !holdOpen && !inside.current) leave();
  }, [holdOpen, revealed]);
  useEffect(() => {
    if (!revealed || !hidden) return;
    const pointer = (event: PointerEvent) => {
      if (
        sidebar?.contains(event.target as Node) ||
        (event.target as Element).closest?.('.sidebar-hover-edge')
      )
        enter();
      else if (!held.current) leave();
    };
    const outside = (event: PointerEvent) => {
      if (
        !held.current &&
        !sidebar?.contains(event.target as Node) &&
        !(event.target as Element).closest?.('.sidebar-hover-edge')
      )
        dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !held.current)
        dismiss();
    };
    document.addEventListener('pointermove', pointer);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointermove', pointer);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', dismiss);
    };
  }, [hidden, revealed, sidebar]);

  return {
    open: hidden && revealed,
    visible: hidden && revealed && (!onReady || readyToken === token.current),
    token: token.current,
    enterEdge,
    reveal,
    enter,
    leave,
    dismiss,
  };
}
