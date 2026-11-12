import { app, BrowserWindow, shell } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { validActivitySound } from '../browser/activitySound';

let player: BrowserWindow | undefined;
/** Play a bundled WAV through Chromium's audio engine on every platform. */
function playChime() {
  const file = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/sounds/activity-chime.wav')
    : path.join(__dirname, '../../assets/sounds/activity-chime.wav');
  const sound = fs.readFileSync(file).toString('base64');
  if (player && !player.isDestroyed()) player.destroy();
  const window = new BrowserWindow({
    show: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  player = window;
  const close = () => {
    if (!window.isDestroyed()) window.destroy();
    if (player === window) player = undefined;
  };
  window
    .loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src data:"><audio autoplay src="data:audio/wav;base64,${sound}"></audio>`
      )}`
    )
    .then(() => {
      setTimeout(close, 1800);
      return undefined;
    })
    .catch(() => {
      close();
      shell.beep();
    });
}
/** Only allow built-in names; no shell commands or user-provided paths. */
export function playActivitySound(name: unknown) {
  if (name === 'chime') {
    try {
      playChime();
    } catch {
      shell.beep();
    }
    return;
  }
  if (
    process.platform !== 'darwin' ||
    name === 'system' ||
    !validActivitySound(name)
  ) {
    shell.beep();
    return;
  }
  execFile(
    '/usr/bin/afplay',
    [`/System/Library/Sounds/${name}.aiff`],
    { timeout: 5000 },
    (error) => {
      if (error) shell.beep();
    }
  );
}
