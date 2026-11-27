import type { ElectronHandler } from 'main/preload';
import { BrowserWindowConstructorOptions } from 'electron';

export type View =
  | 'main'
  | 'settings'
  | 'add-app'
  | 'downloads'
  | 'task-manager'
  | 'global-hook-editor'
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
  sessionChromeColor?: string;
  sessionChromeCollapsed?: boolean;
  sessionChromeUngrouped?: boolean;
  sessionSlug?: string;
  sessionIconEmoji?: string;
  sessionIconImage?: string;
  sessionHomeURL?: string;
  /** The inbox account the user uses in this group's browser session. */
  browserEmail?: import('./browser/email').EmailBrowserInbox;
  browserEmails?: import('./browser/email').EmailBrowserInbox[];
  sessionNameCustom?: boolean;
  sessionNameGenerated?: boolean;
  spaceId?: string;
  folderId?: string;
  /** Derived collection label supplied to browser/AI layouts. */
  collectionName?: string;
  groupDisplay?: 'stack' | 'folder';
  sessionMode?: 'separate' | 'collection';
  /** Agents act without hard-floor review in this group (dev groups with seed data). */
  aiTrusted?: boolean;
  /** Model tier override for this group: auto (default), assist, control or cloud. */
  aiTier?: 'auto' | 'assist' | 'control' | 'cloud';
  pinned?: boolean;
  tabPinned?: boolean;
  tabDefaultURL?: string;
  favorite?: boolean;
  archived?: boolean;
  archivedAt?: number;
  customName?: string;
  customIconEmoji?: string;
  customIconImage?: string;
  focusColor?: string;
  sessionFocusColor?: string;
  tags?: string[];
  name: string;
  url: string;
  icon: string;
}

export type IAppAction = IApp & { action: 'update' | 'new' };

export type NewWindowParams = {
  privateSession?: import('electron').Session;
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
