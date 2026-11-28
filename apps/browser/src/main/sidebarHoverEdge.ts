import type { BrowserWindow, MouseInputEvent, WebContentsView } from 'electron';

const hoverWidth = 16;

/** Native pages cover renderer hit regions. Observe their edge without taking
 * mouse events away from the page or reserving a wider visible frame. */
export function observeSidebarHoverEdge(
  view: WebContentsView,
  owner: () => BrowserWindow | undefined,
  enabled: (window: BrowserWindow) => boolean,
) {
  let inside = false;
  let previousOwner: BrowserWindow | undefined;
  const mouse = (_event: unknown, input: MouseInputEvent) => {
    if (!['mouseMove', 'mouseEnter', 'mouseLeave'].includes(input.type)) return;
    const window = owner();
    if (window !== previousOwner) {
      inside = false;
      previousOwner = window;
    }
    if (
      !window ||
      window.isDestroyed() ||
      !enabled(window) ||
      !view.getVisible()
    ) {
      inside = false;
      return;
    }
    if (input.modifiers?.some((modifier) => modifier.endsWith('buttondown')))
      return;
    let next = false;
    if (
      input.type !== 'mouseLeave' &&
      Number.isFinite(input.x) &&
      Number.isFinite(input.y) &&
      input.x >= 0 &&
      input.x < hoverWidth &&
      input.y >= 0
    ) {
      const bounds = view.getBounds();
      next =
        bounds.x + input.x < hoverWidth &&
        bounds.x + input.x >= 0 &&
        input.y < bounds.height;
    }
    if (next === inside) return;
    inside = next;
    window.webContents.send('browser-sidebar-hover-edge', inside);
  };
  const stop = () => {
    view.webContents.removeListener('before-mouse-event', mouse);
    view.webContents.removeListener('destroyed', stop);
  };
  view.webContents.on('before-mouse-event', mouse);
  view.webContents.once('destroyed', stop);
  return stop;
}
