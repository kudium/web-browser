import fs from 'fs';
import type { BrowserWindow } from 'electron';
import { writePrivateFile } from './privateFile';

interface WindowSize {
  width: number;
  height: number;
  maximized: boolean;
}

export function restoreWindowSize(
  file: string,
  workArea: { width: number; height: number }
): WindowSize {
  let size: WindowSize = { width: 1160, height: 950, maximized: false };
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      Number.isInteger(saved.width) &&
      saved.width >= 320 &&
      saved.width <= 30000 &&
      Number.isInteger(saved.height) &&
      saved.height >= 240 &&
      saved.height <= 30000 &&
      typeof saved.maximized === 'boolean'
    )
      size = saved;
  } catch {
    // A missing or invalid preference must never prevent opening the browser.
  }
  return {
    width: Math.min(size.width, workArea.width),
    height: Math.min(size.height, workArea.height),
    maximized: size.maximized,
  };
}

export function rememberWindowSize(window: BrowserWindow, file: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen())
      return;
    const { width, height } = window.getNormalBounds();
    try {
      writePrivateFile(
        file,
        JSON.stringify({ width, height, maximized: window.isMaximized() })
      );
    } catch {
      // Window preferences are optional; an unwritable profile must not block use.
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 250);
  };
  window.on('resize', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('leave-full-screen', schedule);
  window.on('close', () => {
    clearTimeout(timer);
    save();
  });
  window.once('closed', () => clearTimeout(timer));
}
