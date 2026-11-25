import type { AppUpdateAction, AppUpdateState } from './appUpdates';
import type { SidebarPanelRequest, SidebarPanelState } from './sidebarPanels';
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
import type {
  NativeMenuItem,
  NativePrompt,
  NativeTooltipRequest,
} from './nativeUi';
import type {
  BrowserPreferences,
  PreferenceAction,
  PreferenceInfo,
} from './preferences';
import type { IApp } from '../types';
import type { TaskManagerRequest, TaskManagerState } from './taskManager';

export interface BrowserTabRequest {
  action:
    | 'create'
    | 'select'
    | 'select-group'
    | 'close'
    | 'remove'
    | 'unload-group'
    | 'collapse-groups'
    | 'store'
    | 'task-ended'
    | 'open-external'
    | 'open-sidebar'
    | 'extension-group-update';
  groupChanges?: { id: string; changes: Partial<IApp> }[];
  mutationId?: string;
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
  themeColor?: string;
  icon?: string;
  muted?: boolean;
  audible?: boolean;
  mediaPlaying?: boolean;
  sidebarMediaEligible?: boolean;
  pictureInPicture?: PictureInPictureState;
  siteSettings?: {
    protection?: {enabled: boolean; globallyEnabled: boolean; blocked: number; status: import('./protection').BrowserProtectionStatus};
    origin: string;
    certificateError?: string;
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
  sidebarSuspended?: boolean;
  tabSwitcher?: boolean;
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
    | 'extension-group-result'
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
    | 'copy-clean-link'
    | 'zoom-in'
    | 'zoom-out'
    | 'zoom-reset'
    | 'find'
    | 'clear-data'
    | 'media-play-pause'
    | 'media-previous'
    | 'media-next'
    | 'toggle-mute'
    | 'toggle-picture-in-picture'
    | 'toggle-ad-blocking'
    | 'set-permission'
    | 'reset-permissions'
    | 'close-group'
    | 'unload-other-groups'
    | 'unload-space-groups'
    | 'unload-tab'
    | 'open-site-developer'
    | 'toggle-site-hook'
    | 'run-site-hook'
    | 'set-site-developer'
    | 'ask-hook-ai'
    | 'clear-site-developer-logs'
    | 'activate-hook-notification'
    | 'revoke-hook-notification';
  url?: string;
  developer?: SiteDeveloperConfig;
  run?: boolean;
  reloadAfterSave?: boolean;
  prompt?: string;
  extensionId?: string;
  grantId?: string;
  hookId?: string;
  mutationId?: string;
  error?: string;
  permission?: string;
  choice?: 'ask' | 'allow' | 'block';
}

export type BrowserShortcut =
  | ShortcutAction
  | 'tab-switcher-next'
  | 'tab-switcher-previous'
  | 'tab-switcher-commit'
  | 'tab-switcher-cancel'
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
  presentationId?: string;
  previewOnly?: boolean;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
}

export type { BrowserPreferences } from './preferences';

export interface BrowserClient {
  sidebarPanels(request: SidebarPanelRequest): Promise<SidebarPanelState>;
  onSidebarPanels(callback: (state: SidebarPanelState) => void): () => void;
  taskManager(request: TaskManagerRequest): Promise<TaskManagerState>;
  removeGroup(
    id: string,
    allowArchive?: boolean
  ): Promise<{ removed: boolean; ids?: string[]; archive?: boolean }>;
  capture(request: PageCaptureRequest): Promise<PageCaptureResult>;
  tooltip(request: NativeTooltipRequest): Promise<void>;
  nativeMenu(items: NativeMenuItem[]): Promise<string | null>;
  confirm(prompt: NativePrompt): Promise<boolean>;
  showEmojiPicker(): Promise<void>;
  chooseSpaceIcon(): Promise<string | null>;
  onAIFillForm?(callback: (sourceId: string) => void): () => void;
  onAISelection?(callback: (text: string) => void): () => void;
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
  nativeAppearance?: (appearance: 'system' | 'light' | 'dark') => Promise<void>;
  preferences(
    action: 'get' | 'open' | 'update',
    patch?: Partial<BrowserPreferences> & {
      section?:
        | 'archive'
        | 'sync'
        | 'import'
        | 'passwords'
        | 'spaces'
        | 'hooks' | 'appearance' | 'shortcuts' | 'performance' | 'routing' | 'ai' | 'extensions'
        | 'updates';
    }
  ): Promise<BrowserPreferences>;
  appUpdates(action: AppUpdateAction): Promise<AppUpdateState>;
  onAppUpdates(callback: (state: AppUpdateState) => void): () => void;
  preferenceAction(
    action: PreferenceAction,
    profileId?: string
  ): Promise<
    | PreferenceInfo
    | import('./protection').BrowserProtectionStatus
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
