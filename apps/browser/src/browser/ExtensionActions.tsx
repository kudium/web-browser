import { createElement, useEffect, useRef } from 'react';
import type { BrowserState } from './contracts';

// Electron's action renderer is contained here, away from workspace components.
export function ExtensionActions({
  onExtensionMenu,
  context,
  order,
}: {
  onExtensionMenu?: (id: string) => void;
  context: BrowserState['extensionContext'];
  order: string[] | null;
}) {
  const element = useRef<HTMLElement>(null);
  const initialOrder = useRef(new WeakMap<HTMLElement, number>());
  const nextOrder = useRef(0);
  useEffect(() => {
    const root = element.current?.shadowRoot;
    if (!root) return undefined;
    const contextMenu = (event: Event) => {
      if (!onExtensionMenu || !(event.target instanceof Element)) return;
      const action = event.target.closest<HTMLElement>('.action');
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onExtensionMenu(action.id);
    };
    root.addEventListener('contextmenu', contextMenu, true);

    const update = () => {
      const actions = [...root.querySelectorAll<HTMLElement>('.action')];
      actions.forEach((action) => {
        if (!initialOrder.current.has(action)) {
          initialOrder.current.set(action, nextOrder.current);
          nextOrder.current += 1;
        }
        const index = order?.indexOf(action.id) ?? 0;
        action.hidden = index < 0;
        action.style.display = index < 0 ? 'none' : '';
        action.style.order = String(Math.max(0, index));
      });
      const sorted = [...actions].sort((a, b) => {
        if (order) {
          const rank = (id: string) =>
            order.includes(id) ? order.indexOf(id) : order.length;
          return rank(a.id) - rank(b.id);
        }
        return initialOrder.current.get(a)! - initialOrder.current.get(b)!;
      });
      if (sorted.some((action, index) => actions[index] !== action))
        sorted.forEach((action) => root.appendChild(action));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true });
    return () => { observer.disconnect(); root.removeEventListener('contextmenu', contextMenu, true); };
  }, [context?.profile, order, onExtensionMenu]);
  if (!context) return null;
  // The dependency subscribes on connect, but does not resubscribe when its
  // partition attribute changes. Recreate it to release the old profile observer.
  return createElement('browser-action-list', {
    key: context.profile,
    ref: element,
    partition: context.profile,
    tab: context.tab,
    alignment: 'bottom left',
    'aria-label': 'Extensions',
  });
}
