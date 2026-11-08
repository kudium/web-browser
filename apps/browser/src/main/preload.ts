import { injectBrowserAction } from 'electron-chrome-extensions/browser-action';
import {
  contextBridge,
  ipcRenderer,
  IpcRendererEvent,
  webUtils,
} from 'electron';
import type { AppUpdateAction, AppUpdateState } from '../browser/appUpdates';
import type {
  BrowserWindowRequest,
  BrowserWindowState,
} from '../browser/windows';
// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import {
  safeErrorType,
  safeErrorFrames,
  validatedErrorFrames,
  TelemetryFeature,
} from '../browser/telemetry';
import type {
  ProjectFilesRequest,
  ProjectFilesResult,
  ProjectScriptRequest,
  ProjectScriptResult,
  DeveloperProject,
  ProjectAction,
  ProjectEditors,
  ProjectTerminalRequest,
  ProjectTerminalState,
  ProjectTerminalEvent,
} from '../browser/developerProject';
import type {
  AIConversationRequest,
  AIConversationsState,
} from '../browser/aiConversations';
import type { GroupLockRequest, GroupLockState } from '../browser/groupLocks';
import type {
  SiteDeveloperWindowState,
  SiteDeveloperPageSummary,
} from '../browser/siteDeveloper';
import type {
  PageCaptureRequest,
  PageCaptureResult,
} from '../browser/pageCapture';
import type {
  AIContextAttachment,
  AIContextReference,
} from '../browser/aiContext';
import type {
  AIComposerAttachment,
  AIComposerTask,
} from '../browser/aiComposer';
import type {
  VaultRequest,
  VaultStatus,
  VaultItem,
} from '../browser/passwordManager';
import type { AIAccessMode, AIAccessStatus } from '../browser/aiPermissions';
import type { AIGroup } from '../browser/aiGroups';
import type { AITaskInput, SavedAITask } from '../browser/aiTasks';
import type { MCPStatus, MCPConnection } from '../browser/mcp';
import type {
  PersonalAgentRequest,
  PersonalAgentResult,
} from '../browser/personalAgents';
import type { AISettings, AIEvent, AITaskStatus } from '../browser/ai';
import type { BrowserTabRequest } from '../browser/contracts';
import type { HistoryAction, HistoryRecord } from '../browser/history';
import type {
  DownloadAction,
  DownloadRecord,
  DownloadRecoveryInfo,
} from '../browser/downloads';
import type {
  AccountSyncAction,
  AccountSyncInput,
  AccountSyncStatus,
  RestoredWorkspace,
} from '../browser/accountSync';
import type { CloudSyncStatus } from '../browser/cloudSync';
import { retainExtensionIcons } from '../browser/extensionIconRetention';
import type { NativeMenuItem, NativePrompt } from '../browser/nativeUi';
import type {
  BrowserPreferences,
  PreferenceAction,
  PreferenceInfo,
} from '../browser/preferences';
import type {
  BrowserCommand,
  BrowserLayout,
  BrowserState,
  BrowserShortcut,
  BrowserSnapshot,
} from '../types';

export type Channels =
  | 'ipc-close-window'
  | 'ipc-create-window'
  | 'ipc-event-bus';

const assertLegacyChannel = (channel: Channels) => {
  if (
    !['ipc-close-window', 'ipc-create-window', 'ipc-event-bus'].includes(
      channel
    )
  )
    throw new Error('Unsupported IPC channel.');
};

// This preload is assigned only to trusted Kudium Browser UI windows.
injectBrowserAction();
contextBridge.executeInMainWorld({ func: retainExtensionIcons });

function sendTelemetry(request: Record<string, unknown>) {
  try {
    ipcRenderer.send('kudium-telemetry', request);
  } catch {
    /* Diagnostics never affect the user action. */
  }
}
let storageReady: Promise<void> | undefined;
function invokeWhenReady(channel: string, ...args: unknown[]) {
  if (
    channel.startsWith('ai-') ||
    ['password-manager', 'account-sync', 'browser-migration'].includes(channel)
  ) {
    if (!storageReady)
      storageReady = ipcRenderer.invoke('browser-storage-ready');
    return storageReady.then(() => ipcRenderer.invoke(channel, ...args));
  }
  return ipcRenderer.invoke(channel, ...args);
}

function trackedInvoke(
  feature: TelemetryFeature | undefined,
  channel: string,
  ...args: unknown[]
) {
  return invokeWhenReady(channel, ...args)
    .then((result) => {
      if (feature && result !== false && result !== null)
        sendTelemetry({ feature, succeeded: true });
      return result;
    })
    .catch((error) => {
      if (feature)
        sendTelemetry({
          feature,
          succeeded: false,
          errorType: safeErrorType(error?.name),
          frames: safeErrorFrames(error?.stack),
        });
      throw error;
    });
}
const electronHandler = {
  telemetry: {
    feature(feature: TelemetryFeature) {
      sendTelemetry({ feature });
    },
    error(type: string, frames?: string[]) {
      sendTelemetry({
        errorType: safeErrorType(type),
        frames: validatedErrorFrames(frames),
      });
    },
  },
  platform: process.platform,
  browserMigration(
    action:
      | 'profiles'
      | 'prepare'
      | 'commit'
      | 'status'
      | 'recover'
      | 'start'
      | 'discard',
    input?:
      | import('../browser/browserMigration').MigrationRequest
      | {
          token: string;
          destinationSpace?: string;
          organization?: import('../browser/importWorkspace').ImportOrganizationOptions;
        }
  ): Promise<
    | import('../browser/browserMigration').MigrationProfile[]
    | import('../browser/browserMigration').MigrationPreview
    | import('../browser/browserMigration').MigrationResult
    | import('../browser/browserMigration').MigrationProgress
    | import('../browser/browserMigration').MigrationRecovery[]
  > {
    return invokeWhenReady('browser-migration', action, input);
  },
  onPasswordManagerLock(callback: () => void) {
    const listener = () => callback();
    ipcRenderer.on('password-manager-locked', listener);
    return () =>
      ipcRenderer.removeListener('password-manager-locked', listener);
  },
  passwordManager(
    request: VaultRequest
  ): Promise<
    | VaultItem
    | VaultStatus
    | { filled: number }
    | { imported: number; skipped: number; canceled?: boolean }
    | { removed: boolean }
    | Array<{ id: number; title: string; url: string }>
  > {
    return invokeWhenReady('password-manager', request);
  },
  ai: {
    skillsFromDrop(
      file: File
    ): Promise<import('../browser/aiSkills').AISkill[]> {
      const source = webUtils.getPathForFile(file);
      if (!source)
        return Promise.reject(
          new Error('Drop a local SKILL.md file or skill folder.')
        );
      return trackedInvoke('ai_skill_installed', 'ai-skills', {
        action: 'import-path',
        source,
      });
    },
    skills(
      request: import('../browser/aiSkills').AISkillsRequest
    ): Promise<import('../browser/aiSkills').AISkill[]> {
      return trackedInvoke(
        ['add', 'create', 'import-link', 'import-path'].includes(request.action)
          ? 'ai_skill_installed'
          : undefined,
        'ai-skills',
        request
      );
    },
    permissions(mode?: AIAccessMode): Promise<AIAccessStatus> {
      return invokeWhenReady('ai-permissions', mode);
    },
    onPermissions(callback: (status: AIAccessStatus) => void) {
      const listener = (_event: IpcRendererEvent, value: AIAccessStatus) =>
        callback(value);
      ipcRenderer.on('ai-permissions-changed', listener);
      return () =>
        ipcRenderer.removeListener('ai-permissions-changed', listener);
    },
    groups(
      groupId?: string | null
    ): Promise<{ groupId: string | null; groups: AIGroup[] }> {
      return invokeWhenReady('ai-groups', groupId);
    },
    onScope(callback: (groupId: string | null) => void) {
      const listener = (_event: IpcRendererEvent, value: string | null) =>
        callback(value);
      ipcRenderer.on('ai-scope-changed', listener);
      return () => ipcRenderer.removeListener('ai-scope-changed', listener);
    },
    draftTask(request: string): Promise<AITaskInput> {
      return invokeWhenReady('ai-tasks', 'draft', request);
    },
    tasks(): Promise<SavedAITask[]> {
      return invokeWhenReady('ai-tasks', 'list');
    },
    createTask(input: AITaskInput): Promise<string> {
      return invokeWhenReady('ai-tasks', 'create', input);
    },
    taskAction(id: string, action: 'run' | 'delete' | 'toggle'): Promise<void> {
      return invokeWhenReady('ai-tasks', action, id);
    },
    onTasks(callback: () => void) {
      ipcRenderer.on('ai-tasks-changed', callback);
      return () => {
        ipcRenderer.removeListener('ai-tasks-changed', callback);
      };
    },
    mcpStatus(): Promise<MCPStatus> {
      return invokeWhenReady('ai-mcp', 'status');
    },
    personalAgents(
      request: PersonalAgentRequest
    ): Promise<PersonalAgentResult> {
      return invokeWhenReady('ai-personal-agents', request);
    },
    mcpUpdate(patch: {
      enabled: boolean;
      port?: number;
      rotate?: boolean;
    }): Promise<MCPStatus> {
      return invokeWhenReady('ai-mcp', 'update', patch);
    },
    mcpStdio(): Promise<{
      mcpServers: { kudiumbrowser: { command: string; args: string[] } };
    }> {
      return invokeWhenReady('ai-mcp', 'stdio');
    },
    mcpConnection(): Promise<MCPConnection> {
      return invokeWhenReady('ai-mcp', 'connection');
    },
    onMCP(callback: (status: MCPStatus) => void) {
      const listener = (_event: IpcRendererEvent, value: MCPStatus) =>
        callback(value);
      ipcRenderer.on('ai-mcp-changed', listener);
      return () => {
        ipcRenderer.removeListener('ai-mcp-changed', listener);
      };
    },
    openPreferences(): Promise<void> {
      return invokeWhenReady('ai-open-preferences');
    },
    models(config?: { endpoint: string; key?: string }): Promise<string[]> {
      return invokeWhenReady('ai-models', config);
    },
    onSettings(callback: (settings: AISettings) => void) {
      const listener = (_event: IpcRendererEvent, value: AISettings) =>
        callback(value);
      ipcRenderer.on('ai-settings-changed', listener);
      return () => {
        ipcRenderer.removeListener('ai-settings-changed', listener);
      };
    },
    recoverStorage(): Promise<void> {
      return invokeWhenReady('ai-recover-storage');
    },
    restartForStorage(): Promise<void> {
      return invokeWhenReady('ai-restart-for-storage');
    },
    settings(patch?: {
      endpoint: string;
      model: string;
      key?: string;
      remember?: boolean;
      clear?: boolean;
    }): Promise<AISettings> {
      return invokeWhenReady('ai-settings', patch);
    },
    pickAttachments(): Promise<{
      attachments: AIComposerAttachment[];
      errors: string[];
    }> {
      return invokeWhenReady('ai-composer-pick');
    },
    addAttachment(
      name: string,
      bytes: Uint8Array
    ): Promise<AIComposerAttachment> {
      return invokeWhenReady('ai-composer-add', name, bytes);
    },
    savedAttachments(): Promise<AIComposerAttachment[]> {
      return invokeWhenReady('ai-composer-files');
    },
    saveAttachment(id: string): Promise<boolean> {
      return invokeWhenReady('ai-composer-save', id);
    },
    clearAttachments(): Promise<boolean> {
      return invokeWhenReady('ai-composer-clear');
    },
    removeAttachment(id: string): Promise<boolean> {
      return invokeWhenReady('ai-composer-remove', id);
    },
    attachContext(reference: AIContextReference): Promise<AIContextAttachment> {
      return invokeWhenReady('ai-composer-context', reference);
    },
    feedback(id: string, answer: string): Promise<boolean> {
      return invokeWhenReady('ai-feedback', id, answer);
    },
    run(prompt: string | AIComposerTask): Promise<boolean> {
      return trackedInvoke('ai_run', 'ai-run', prompt);
    },
    conversations(
      request: AIConversationRequest = { action: 'list' }
    ): Promise<AIConversationsState> {
      return invokeWhenReady('ai-conversations', request);
    },
    onConversations(callback: (state: AIConversationsState) => void) {
      const listener = (
        _event: IpcRendererEvent,
        state: AIConversationsState
      ) => callback(state);
      ipcRenderer.on('ai-conversations-changed', listener);
      return () =>
        ipcRenderer.removeListener('ai-conversations-changed', listener);
    },
    taskStatus(): Promise<AITaskStatus> {
      return invokeWhenReady('ai-task-status');
    },
    resume(): Promise<boolean> {
      return invokeWhenReady('ai-resume');
    },
    takeOver(): Promise<void> {
      return invokeWhenReady('ai-takeover');
    },
    resumeExternal(): Promise<void> {
      return invokeWhenReady('ai-resume-external');
    },
    stop(): Promise<void> {
      return invokeWhenReady('ai-stop');
    },
    onEvent(callback: (event: AIEvent) => void) {
      const listener = (_event: IpcRendererEvent, value: AIEvent) =>
        callback(value);
      ipcRenderer.on('ai-event', listener);
      return () => {
        ipcRenderer.removeListener('ai-event', listener);
      };
    },
  },
  groupLocks: {
    request(request: GroupLockRequest): Promise<GroupLockState> {
      return ipcRenderer.invoke('browser-group-lock', request);
    },
    onState(callback: (state: GroupLockState) => void) {
      const listener = (_event: IpcRendererEvent, state: GroupLockState) =>
        callback(state);
      ipcRenderer.on('group-lock-state', listener);
      return () => {
        ipcRenderer.removeListener('group-lock-state', listener);
      };
    },
  },
  siteDeveloper: {
    drop(
      file: File,
      spaceId: string
    ): Promise<import('../browser/sidebarDrop').SidebarDropResult> {
      const filePath = webUtils.getPathForFile(file);
      if (!filePath)
        return Promise.reject(new Error('Drop a local file or folder.'));
      return ipcRenderer.invoke('sidebar-drop', filePath, spaceId);
    },
    createDroppedGroup(
      draft: import('../browser/sidebarDrop').DroppedGroupDraft
    ): Promise<import('../browser/sidebarDrop').CreatedDroppedGroup> {
      return ipcRenderer.invoke('sidebar-drop-create', draft);
    },
    transfer(
      action: 'import' | 'export',
      id: string
    ): Promise<import('../browser/groupTransfer').GroupTransferResult | null> {
      return trackedInvoke(
        action === 'import' ? 'group_imported' : 'group_exported',
        'group-transfer',
        action,
        id
      );
    },
    files(
      id: string,
      request: ProjectFilesRequest
    ): Promise<ProjectFilesResult> {
      const feature = {
        list: 'file_browser_opened',
        preview: 'file_previewed',
        save: 'file_saved',
        'terminal-tab': 'terminal_opened',
      }[request.action as string] as TelemetryFeature | undefined;
      return trackedInvoke(feature, 'site-developer-files', id, request);
    },
    scripts(
      id: string,
      request: ProjectScriptRequest
    ): Promise<ProjectScriptResult> {
      const features: Partial<
        Record<ProjectScriptRequest['action'], TelemetryFeature>
      > = { run: 'script_run', save: 'script_saved' };
      return trackedInvoke(
        features[request.action],
        'site-developer-scripts',
        id,
        request
      );
    },
    editors(choose?: true): Promise<ProjectEditors> {
      return ipcRenderer.invoke('site-developer-editors', choose);
    },
    terminal(
      group: string,
      request: ProjectTerminalRequest
    ): Promise<ProjectTerminalState> {
      return trackedInvoke(
        ['open', 'create'].includes(request.action)
          ? 'terminal_opened'
          : undefined,
        'site-developer-terminal',
        group,
        request
      );
    },
    onTerminal(callback: (event: ProjectTerminalEvent) => void) {
      const listener = (
        _event: IpcRendererEvent,
        value: ProjectTerminalEvent
      ) => callback(value);
      ipcRenderer.on('site-developer-terminal-data', listener);
      return () =>
        ipcRenderer.removeListener('site-developer-terminal-data', listener);
    },
    project(
      id: string,
      action: ProjectAction,
      editorId?: string,
      folderPath?: string
    ): Promise<DeveloperProject | null> {
      return trackedInvoke(
        action === 'link' ? 'project_linked' : undefined,
        'site-developer-project',
        id,
        action,
        editorId,
        folderPath
      );
    },
    onPagesChanged(callback: () => void) {
      const listener = () => callback();
      ipcRenderer.on('site-developer-library-changed', listener);
      return () =>
        ipcRenderer.removeListener('site-developer-library-changed', listener);
    },
    pages(id: string): Promise<SiteDeveloperPageSummary[]> {
      return ipcRenderer.invoke('site-developer-pages', id);
    },
    command(
      request:
        | BrowserCommand
        | 'get'
        | 'close'
        | 'expand'
        | 'focus-group'
        | 'focus-page'
    ) {
      ipcRenderer.send('site-developer-command', request);
    },
    onState(callback: (state: SiteDeveloperWindowState) => void) {
      const listener = (
        _event: IpcRendererEvent,
        state: SiteDeveloperWindowState
      ) => callback(state);
      ipcRenderer.on('site-developer-state', listener);
      return () => {
        ipcRenderer.removeListener('site-developer-state', listener);
      };
    },
  },
  browser: {
    storageStatus(): Promise<{ available: boolean; needsRecovery: boolean }> {
      return ipcRenderer.invoke('browser-storage-ready');
    },
    windowRequest(request: BrowserWindowRequest): Promise<BrowserWindowState> {
      return ipcRenderer.invoke('browser-window-request', request);
    },
    onWindowState(callback: (state: BrowserWindowState) => void) {
      const listener = (_event: IpcRendererEvent, state: BrowserWindowState) =>
        callback(state);
      ipcRenderer.on('browser-window-state', listener);
      return () => {
        ipcRenderer.removeListener('browser-window-state', listener);
      };
    },
    onWindowMirrors(callback: (frames: BrowserSnapshot[]) => void) {
      const listener = (_event: IpcRendererEvent, frames: BrowserSnapshot[]) =>
        callback(frames);
      ipcRenderer.on('browser-window-mirrors', listener);
      return () => {
        ipcRenderer.removeListener('browser-window-mirrors', listener);
      };
    },
    onWindowCommit(
      callback: (change: {
        tabs: import('../types').IApp[];
        remove: string[];
        token: string;
      }) => void
    ) {
      const listener = (
        _event: IpcRendererEvent,
        change: {
          tabs: import('../types').IApp[];
          remove: string[];
          token: string;
        }
      ) => callback(change);
      ipcRenderer.on('browser-window-commit', listener);
      return () => {
        ipcRenderer.removeListener('browser-window-commit', listener);
      };
    },
    removeGroup(
      id: string,
      allowArchive?: boolean
    ): Promise<{ removed: boolean; ids?: string[]; archive?: boolean }> {
      return ipcRenderer.invoke('browser-remove-group', id, allowArchive);
    },
    capture(request: PageCaptureRequest): Promise<PageCaptureResult> {
      return ipcRenderer.invoke('browser-capture', request);
    },
    onPreferenceSection(callback: (section: string) => void) {
      const listener = (_event: IpcRendererEvent, value: string) =>
        callback(value);
      ipcRenderer.on('preferences-section', listener);
      return () => {
        ipcRenderer.removeListener('preferences-section', listener);
      };
    },
    history(action: HistoryAction, id?: string): Promise<HistoryRecord[]> {
      return ipcRenderer.invoke('browser-history', action, id);
    },
    onHistory(callback: (records: HistoryRecord[]) => void) {
      const listener = (_event: IpcRendererEvent, records: HistoryRecord[]) =>
        callback(records);
      ipcRenderer.on('browser-history-changed', listener);
      return () =>
        ipcRenderer.removeListener('browser-history-changed', listener);
    },
    downloads(action: DownloadAction, id?: string): Promise<DownloadRecord[]> {
      return ipcRenderer.invoke('browser-downloads', action, id);
    },
    downloadRecovery(): Promise<DownloadRecoveryInfo> {
      return ipcRenderer.invoke('browser-download-recovery');
    },
    downloadThumbnail(id: string): Promise<string | null> {
      return ipcRenderer.invoke('browser-download-thumbnail', id);
    },
    onDownloads(callback: (records: DownloadRecord[]) => void) {
      const listener = (_event: IpcRendererEvent, records: DownloadRecord[]) =>
        callback(records);
      ipcRenderer.on('browser-downloads-changed', listener);
      return () =>
        ipcRenderer.removeListener('browser-downloads-changed', listener);
    },
    nativeMenu(items: NativeMenuItem[]): Promise<string | null> {
      return ipcRenderer.invoke('browser-native-menu', items);
    },
    confirm(prompt: NativePrompt): Promise<boolean> {
      return ipcRenderer.invoke('browser-native-confirm', prompt);
    },
    showEmojiPicker(): Promise<void> {
      return ipcRenderer.invoke('browser-emoji-picker');
    },
    chooseSpaceIcon(): Promise<string | null> {
      return ipcRenderer.invoke('browser-space-icon');
    },
    onTabRequest(callback: (request: BrowserTabRequest) => void) {
      const listener = (_event: IpcRendererEvent, request: BrowserTabRequest) =>
        callback(request);
      ipcRenderer.on('browser-tab-request', listener);
      ipcRenderer.send('browser-tab-requests-ready');
      return () => {
        ipcRenderer.removeListener('browser-tab-request', listener);
      };
    },
    accountSync(
      action: AccountSyncAction,
      input?: AccountSyncInput
    ): Promise<AccountSyncStatus | RestoredWorkspace> {
      return invokeWhenReady('account-sync', action, input);
    },
    preferences(
      action: 'get' | 'open' | 'update',
      patch?: Partial<BrowserPreferences> & {
        section?: 'archive' | 'sync' | 'import' | 'passwords';
      }
    ): Promise<BrowserPreferences> {
      return ipcRenderer.invoke('browser-preferences', action, patch);
    },
    appUpdates(action: AppUpdateAction): Promise<AppUpdateState> {
      return ipcRenderer.invoke('browser-app-updates', action);
    },
    onAppUpdates(callback: (state: AppUpdateState) => void) {
      const listener = (_event: IpcRendererEvent, state: AppUpdateState) =>
        callback(state);
      ipcRenderer.on('browser-app-updates-changed', listener);
      return () =>
        ipcRenderer.removeListener('browser-app-updates-changed', listener);
    },
    preferenceAction(
      action: PreferenceAction,
      profileId?: string
    ): Promise<
      | PreferenceInfo
      | BrowserPreferences
      | CloudSyncStatus
      | { kind: 'diagnostic'; text: string }
      | null
    > {
      return ipcRenderer.invoke('browser-preference-action', action, profileId);
    },
    onPreferences(callback: (preferences: BrowserPreferences) => void) {
      const listener = (
        _event: IpcRendererEvent,
        preferences: BrowserPreferences
      ) => callback(preferences);
      ipcRenderer.on('browser-preferences-changed', listener);
      return () =>
        ipcRenderer.removeListener('browser-preferences-changed', listener);
    },
    onSnapshots(callback: (snapshots: BrowserSnapshot[]) => void) {
      const listener = (
        _event: IpcRendererEvent,
        snapshots: BrowserSnapshot[]
      ) => callback(snapshots);
      ipcRenderer.on('browser-snapshots', listener);
      return () => {
        ipcRenderer.removeListener('browser-snapshots', listener);
      };
    },
    onShortcut(callback: (action: BrowserShortcut) => void) {
      const listener = (_event: IpcRendererEvent, action: BrowserShortcut) =>
        callback(action);
      ipcRenderer.on('browser-shortcut', listener);
      return () => {
        ipcRenderer.removeListener('browser-shortcut', listener);
      };
    },
    sync(layout: BrowserLayout) {
      ipcRenderer.send('browser-sync', layout);
    },
    command(command: BrowserCommand) {
      ipcRenderer.send('browser-command', command);
    },
    onState(callback: (state: BrowserState) => void) {
      const listener = (_event: IpcRendererEvent, state: BrowserState) =>
        callback(state);
      ipcRenderer.on('browser-state', listener);
      return () => {
        ipcRenderer.removeListener('browser-state', listener);
      };
    },
  },
  ipcRenderer: {
    sendMessage(channel: Channels, args: unknown[]) {
      assertLegacyChannel(channel);
      ipcRenderer.send(channel, args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      assertLegacyChannel(channel);
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      assertLegacyChannel(channel);
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
