import type { ElectronHandler } from 'main/preload';
import { BrowserWindowConstructorOptions } from 'electron';

export type View =
  | 'main'
  | 'settings'
  | 'add-app'
  | 'downloads'
  | 'site-developer';

export interface IApp {
  id: string;
  position?: number;
  sessionId?: string;
  openerTabId?: string;
  restorationId?: string;
  sessionProfileId?: string;
  protectionGroupId?: string;
  extensionInstallTarget?: string;
  sessionName?: string;
  sessionSlug?: string;
  sessionIconEmoji?: string;
  sessionIconImage?: string;
  sessionHomeURL?: string;
  sessionNameCustom?: boolean;
  sessionNameGenerated?: boolean;
  spaceId?: string;
  folderId?: string;
  pinned?: boolean;
  tabPinned?: boolean;
  tabDefaultURL?: string;
  favorite?: boolean;
  archived?: boolean;
  archivedAt?: number;
  customName?: string;
  tags?: string[];
  name: string;
  url: string;
  icon: string;
}

export type IAppAction = IApp & { action: 'update' | 'new' };

export type NewWindowParams = {
  options?: BrowserWindowConstructorOptions;
  view: View;
  isChild?: boolean;
  additional?: boolean;
  intent?: 'edit' | 'new-session';
  preferencesSection?: string;
};

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
  }
}

export {};

export type {
  BrowserState,
  BrowserLayout,
  BrowserCommand,
  BrowserShortcut,
  SpaceWheelEvent,
  BrowserSnapshot,
} from './browser/contracts';
