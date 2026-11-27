import { BrowserWindow } from 'electron';
/** A content-free event prevents ordinary note autosave from refreshing task queues. */
export function todosChanged() {
  for (const window of BrowserWindow?.getAllWindows?.() || []) {
    try {
      if (!window.isDestroyed()) window.webContents.send('todos-changed');
    } catch {
      /* A closed observer cannot fail a committed task change. */
    }
  }
}
