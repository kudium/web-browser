import { app, BrowserWindow } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { showBrowserDialog } from './dialogs';

// Signed releases share a designated requirement. Ad-hoc builds have a new
// requirement after rebuilding, just as they have a new Keychain identity.
function signingIdentity() {
  try {
    const result = spawnSync(
      '/usr/bin/codesign',
      ['-dr', '-', process.execPath],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    return result.status === 0 && result.stderr.trim()
      ? result.stderr.trim()
      : process.execPath;
  } catch {
    return process.execPath;
  }
}

export async function explainSecureStorage(window: BrowserWindow) {
  if (process.platform !== 'darwin') return true;
  const identity = signingIdentity();
  const file = path.join(
    app.getPath('userData'),
    'secure-storage-consent.json'
  );
  try {
    if (JSON.parse(fs.readFileSync(file, 'utf8')).identity === identity)
      return true;
  } catch {
    // First launch, changed signing identity, or unreadable consent record.
  }
  const { response } = await showBrowserDialog(window, {
    type: 'info',
    title: 'Keep your private data protected',
    message: 'Enable secure storage',
    detail:
      'Kudium uses your Mac’s Keychain to protect saved passwords, AI API keys, and private AI history on this device.\n\nmacOS may ask for your login password next. Enter it only in the macOS dialog; Kudium does not receive it. Choose “Always Allow” there to remember access for this trusted app.\n\nYou can browse without enabling secure storage. Saved private data will stay locked until you enable it on a later launch.',
    buttons: ['Enable secure storage', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0 || window.isDestroyed()) return false;
  try {
    fs.writeFileSync(file, JSON.stringify({ identity }), { mode: 0o600 });
  } catch {
    // A consent-record failure must not prevent browsing.
  }
  return true;
}
