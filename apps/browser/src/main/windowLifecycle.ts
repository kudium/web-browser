import type { BrowserWindow } from 'electron';

const closeHandlers = new WeakMap<
  BrowserWindow,
  {
    callbacks: Set<() => void>;
    closed: () => void;
  }
>();

/** Share one Electron listener while allowing temporary cleanup to unsubscribe. */
export function onWindowClosed(window: BrowserWindow, callback: () => void) {
  let handlers = closeHandlers.get(window);
  if (!handlers) {
    const callbacks = new Set<() => void>();
    const closed = () => {
      closeHandlers.delete(window);
      const pending = [...callbacks];
      callbacks.clear();
      pending.forEach((cleanup) => cleanup());
    };
    handlers = { callbacks, closed };
    closeHandlers.set(window, handlers);
    window.once('closed', closed);
  }
  const subscription = () => callback();
  handlers.callbacks.add(subscription);
  const registered = handlers;
  return () => {
    registered.callbacks.delete(subscription);
    if (
      !registered.callbacks.size &&
      closeHandlers.get(window) === registered
    ) {
      window.removeListener('closed', registered.closed);
      closeHandlers.delete(window);
    }
  };
}
