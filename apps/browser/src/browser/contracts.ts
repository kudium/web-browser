import type { AppUpdateAction, AppUpdateState } from './appUpdates';
import type { SiteDeveloperConfig, SiteDeveloperState } from './siteDeveloper';
import type { PageCaptureRequest, PageCaptureResult } from './pageCapture';
import type { HistoryAction, HistoryRecord } from './history';
import type {
  DownloadAction,
  DownloadRecord,
  DownloadRecoveryInfo,
} from './downloads';
import type {
  AccountSyncAction,
  AccountSyncInput,
  AccountSyncStatus,
  RestoredWorkspace,
} from './accountSync';
import type { CloudSyncStatus } from './cloudSync';
import type { ShortcutAction } from './shortcuts';
import type { NativeMenuItem, NativePrompt } from './nativeUi';
import type {
  BrowserPreferences,
  PreferenceAction,
  PreferenceInfo,
} from './preferences';
import type { IApp } from '../types';

export interface BrowserTabRequest {
  action:
    | 'create'
    | 'select'
    | 'select-group'
    | 'close'
    | 'remove'
    | 'unload-group'
    | 'store'
    | 'open-external';
  url?: string;
  background?: boolean;
  profileId?: string;
  groupId?: string;
  id?: string;
  ids?: string[];
  app?: IApp;
}

export interface PictureInPictureState {
  available: boolean;
  active: boolean;
  busy?: boolean;
  error?: string;
}
export interface BrowserState {
  id: string;
  url: string;
  title: string;
  icon?: string;
  muted?: boolean;
  audible?: boolean;
  mediaPlaying?: boolean;
  pictureInPicture?: PictureInPictureState;
  siteSettings?: {
    origin: string;
    permissions: Record<string, 'ask' | 'allow' | 'block'>;
    blocked: boolean;
    developer?: SiteDeveloperState;
  };
  extensionContext?: { profile: string; tab: string };
  discarded?: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
  errorCode?: number;
  failedURL?: string;
  initialLoading?: boolean;
}
export interface BrowserLayout {
  focusedId?: string;
  suspended?: boolean;
  apps: IApp[];
  visible: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}
export interface BrowserCommand {
  id: string;
  action:
    | 'focus-chrome'
    | 'back'
    | 'forward'
    | 'reload'
    | 'reload-ignore-cache'
    | 'clear-cookies-reload'
    | 'reload-menu'
    | 'stop'
    | 'navigate'
    | 'settings'
    | 'extensions'
    | 'menu'
    | 'print'
    | 'zoom-in'
    | 'zoom-out'
    | 'zoom-reset'
    | 'find'
    | 'clear-data'
    | 'toggle-mute'
    | 'toggle-picture-in-picture'
    | 'set-permission'
    | 'reset-permissions'
    | 'close-group'
    | 'open-site-developer'
    | 'set-site-developer'
    | 'clear-site-developer-logs'
    | 'activate-hook-notification'
    | 'revoke-hook-notification';
  url?: string;
  developer?: SiteDeveloperConfig;
  grantId?: string;
  permission?: string;
  choice?: 'ask' | 'allow' | 'block';
}

export type BrowserShortcut =
  | ShortcutAction
  | 'sidebar-or-save'
  | 'new-session'
  | 'new-space'
  | 'import-group'
  | 'export-group'
  | 'group-settings'
  | 'assistant'
  | 'ai-tasks'
  | 'developer'
  | 'site-settings';

export type SpaceWheelEvent =
  | { available: boolean }
  | {
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
      phase: number;
      momentum: number;
    };

export interface BrowserSnapshot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
}

export type { BrowserPreferences } from './preferences';

export interface BrowserClient {
  removeGroup(
    id: string,
    allowArchive?: boolean
  ): Promise<{ removed: boolean; ids?: string[]; archive?: boolean }>;
  capture(request: PageCaptureRequest): Promise<PageCaptureResult>;
  nativeMenu(items: NativeMenuItem[]): Promise<string | null>;
  confirm(prompt: NativePrompt): Promise<boolean>;
  showEmojiPicker(): Promise<void>;
  chooseSpaceIcon(): Promise<string | null>;
  onTabRequest(callback: (request: BrowserTabRequest) => void): () => void;
  history(action: HistoryAction, id?: string): Promise<HistoryRecord[]>;
  onHistory(callback: (records: HistoryRecord[]) => void): () => void;
  downloads(action: DownloadAction, id?: string): Promise<DownloadRecord[]>;
  downloadThumbnail(id: string): Promise<string | null>;
  downloadRecovery(): Promise<DownloadRecoveryInfo>;
  onDownloads(callback: (records: DownloadRecord[]) => void): () => void;
  sync(layout: BrowserLayout): void;
  command(command: BrowserCommand): void;
  accountSync(
    action: AccountSyncAction,
    input?: AccountSyncInput
  ): Promise<AccountSyncStatus | RestoredWorkspace>;
  preferences(
    action: 'get' | 'open' | 'update',
    patch?: Partial<BrowserPreferences> & {
      section?: 'archive' | 'sync' | 'import' | 'passwords' | 'spaces';
    }
  ): Promise<BrowserPreferences>;
  appUpdates(action: AppUpdateAction): Promise<AppUpdateState>;
  onAppUpdates(callback: (state: AppUpdateState) => void): () => void;
  preferenceAction(
    action: PreferenceAction,
    profileId?: string
  ): Promise<
    | PreferenceInfo
    | BrowserPreferences
    | CloudSyncStatus
    | { kind: 'diagnostic'; text: string }
    | null
  >;
  onPreferences(
    callback: (preferences: BrowserPreferences) => void
  ): () => void;
  onSnapshots(callback: (frames: BrowserSnapshot[]) => void): () => void;
  onSpaceWheel(callback: (event: SpaceWheelEvent) => void): () => void;
  onShortcut(callback: (shortcut: BrowserShortcut) => void): () => void;
  onState(callback: (state: BrowserState) => void): () => void;
}
export interface BrowserBackend<Host> {
  readonly id: string;
  attach(host: Host, storageReady?: Promise<void>): () => void;
}
