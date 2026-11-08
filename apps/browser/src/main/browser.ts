import type { BrowserWindow } from 'electron';
import type { BrowserBackend } from '../browser/contracts';
import { registerElectronBrowser } from './electronBrowser';

// Composition root: replace this backend when introducing another browser host.
export const browserBackend: BrowserBackend<BrowserWindow> = {
  id: 'electron',
  attach: registerElectronBrowser,
};
export const registerBrowser = (
  host: BrowserWindow,
  storageReady?: Promise<void>
) => browserBackend.attach(host, storageReady);
