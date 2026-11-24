import type { BrowserWindow } from 'electron';
const handlers = new WeakMap<BrowserWindow, () => Promise<{ unloaded: number; protected: number }>>();
export function registerEnergySaver(owner: BrowserWindow, handler: () => Promise<{ unloaded: number; protected: number }>) {
  handlers.set(owner, handler);
  return () => handlers.delete(owner);
}
export async function saveBrowserEnergy(owner: BrowserWindow) {
  return handlers.get(owner)?.();
}
