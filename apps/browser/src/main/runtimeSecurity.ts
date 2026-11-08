import { app } from 'electron';

/** Release apps never expose Chromium's unauthenticated debugging transports. */
export function restrictPackagedDebugging() {
  if (!app.isPackaged) return;
  [
    'remote-debugging-port',
    'remote-debugging-pipe',
    'remote-debugging-address',
    'remote-allow-origins',
  ].forEach((name) => app.commandLine.removeSwitch(name));
}
