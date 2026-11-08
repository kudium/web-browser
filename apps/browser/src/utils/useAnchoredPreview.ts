import { useCallback, useEffect, useRef, useState } from 'react';

export interface AnchoredPreviewTarget {
  kind: 'session' | 'folder';
  id: string;
  anchor: HTMLElement;
  interaction: 'hover' | 'click' | 'keyboard';
  parentFolder?: string;
}

/** One popup and one timer for the whole sidebar, regardless of session count. */
export function useAnchoredPreview() {
  const [target, setTarget] = useState<AnchoredPreviewTarget | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const close = useCallback(() => {
    cancel();
    setTarget(null);
  }, [cancel]);
  const open = useCallback(
    (next: AnchoredPreviewTarget) => {
      cancel();
      if (next.interaction === 'hover') {
        timer.current = setTimeout(() => {
          if (next.anchor.isConnected) setTarget(next);
        }, 180);
      } else setTarget(next);
    },
    [cancel]
  );
  const leave = useCallback(() => {
    cancel();
    if (!target || target.interaction === 'hover')
      timer.current = setTimeout(() => {
        if (!document.activeElement?.closest('.anchored-tab-preview'))
          setTarget(null);
      }, 240);
  }, [cancel, target]);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!target) return undefined;
    const moved = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('.anchored-tab-preview')
      )
        close();
    };
    window.addEventListener('scroll', moved, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('scroll', moved, true);
      window.removeEventListener('blur', close);
    };
  }, [target, close]);
  return { target, open, close, leave, cancel };
}
