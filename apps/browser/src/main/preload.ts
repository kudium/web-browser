import { injectBrowserAction } from 'electron-chrome-extensions/browser-action';
import type {
  TaskManagerRequest,
  TaskManagerState,
} from '../browser/taskManager';
import {
  contextBridge,
  ipcRenderer,
  IpcRendererEvent,
  webUtils,
} from 'electron';
import type { AppUpdateAction, AppUpdateState } from '../browser/appUpdates';
import type { SidebarPanelRequest, SidebarPanelState } from '../browser/sidebarPanels';
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
  AIQueueState,
  AIQueueRequest,
} from '../browser/aiComposer';
import type {
  VaultRequest,
  VaultStatus,
  VaultItem,
} from '../browser/passwordManager';
import type { AIAccessMode, AIAccessStatus } from '../browser/aiPermissions';
import type { AIGroup } from '../browser/aiGroups';
import type { AITaskInput, SavedAITask } from '../browser/aiTasks';
import type { MCPStatus, MCPConnection, MCPClientSummary } from '../browser/mcp';
import type { MCPRelayCommand, MCPRelayStatus } from '../browser/mcpRelay';
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
import type {
  NativeMenuItem,
  NativePrompt,
  NativeTooltipRequest,
} from '../browser/nativeUi';
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
  SpaceWheelEvent,
  BrowserSnapshot,
} from '../types';

export type Channels =
  'ipc-close-window' | 'ipc-create-window' | 'ipc-event-bus';

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
    [
      'password-manager',
      'account-sync',
      'browser-migration',
      'browser-activity',
      'email',
    ].includes(channel)
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
  activity(request: {
    action:
      | 'list'
      | 'read'
      | 'readAll'
      | 'clearAll'
      | 'testSound'
      | 'delete'
      | 'disableHook';
    id?: string;
  }): Promise<import('../browser/activity').BrowserActivity[] | undefined> {
    return invokeWhenReady('browser-activity', request);
  },
  onActivityChanged(callback: () => void) {
    const listener = () => callback();
    const open = (_event: IpcRendererEvent, id: string) => {
      if (typeof id === 'string')
        window.dispatchEvent(
          new CustomEvent('kudiumbrowser-open-activity', { detail: id })
        );
    };
    ipcRenderer.on('browser-activity-changed', listener);
    ipcRenderer.on('browser-open-activity', open);
    return () => {
      ipcRenderer.removeListener('browser-activity-changed', listener);
      ipcRenderer.removeListener('browser-open-activity', open);
    };
  },
  email(
    request: import('../browser/email').EmailRequest
  ): Promise<import('../browser/email').EmailStatus | import('../browser/email').EmailAlias | import('../browser/email').EmailBrowserDetection> {
    return invokeWhenReady('email', request);
  },
  onEmailChanged(callback: () => void) {
    const listener = () => callback();
    ipcRenderer.on('email-changed', listener);
    return () => {
      ipcRenderer.removeListener('email-changed', listener);
    };
  },
  onPasswordManagerChanged(callback: () => void) {
    const listener = () => callback();
    ipcRenderer.on('password-manager-changed', listener);
    return () =>
      ipcRenderer.removeListener('password-manager-changed', listener);
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
    | import('../browser/passwordManager').VaultSummary[]
    | import('../browser/todos').TodoEntry[]
    | import('../browser/hookSuggestions').HookSuggestion[]
    | {recordId: string; taskId?: string; deepLink: string}
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
      tunnelUrl?: string;
      enabled: boolean;
      port?: number;
      rotate?: boolean;
      https?: boolean;
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
    mcpClients(): Promise<MCPClientSummary[]> {
      return invokeWhenReady('ai-mcp', 'clients');
    },
    mcpClientCeiling(
      id: string,
      ceiling: 'ask' | 'standard' | 'full' | undefined
    ): Promise<MCPClientSummary[]> {
      return invokeWhenReady('ai-mcp', 'client-ceiling', { id, ceiling });
    },
    mcpRevokeClient(id: string): Promise<MCPClientSummary[]> {
      return invokeWhenReady('ai-mcp', 'client-revoke', { id });
    },
    mcpExportAudit(since?: string): Promise<{ exported: boolean; path?: string; runs?: number }> {
      return invokeWhenReady('ai-mcp', 'export-audit', { since });
    },
    mcpRelay(request: MCPRelayCommand): Promise<MCPRelayStatus> {
      return invokeWhenReady('ai-mcp', 'relay', request);
    },
    onMCPRelay(callback: (status: MCPRelayStatus) => void) {
      const listener = (_event: IpcRendererEvent, value: MCPRelayStatus) =>
        callback(value);
      ipcRenderer.on('ai-mcp-relay-changed', listener);
      return () => {
        ipcRenderer.removeListener('ai-mcp-relay-changed', listener);
      };
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
    localModels(
      request: import('./aiLocalModels').LocalModelRequest
    ): Promise<unknown> {
      return invokeWhenReady('ai-local-models', request);
    },
    onLocalModelProgress(
      callback: (progress: import('./aiLocalModels').LocalModelProgress) => void
    ) {
      const listener = (
        _event: IpcRendererEvent,
        value: import('./aiLocalModels').LocalModelProgress
      ) => callback(value);
      ipcRenderer.on('ai-local-model-progress', listener);
      return () => {
        ipcRenderer.removeListener('ai-local-model-progress', listener);
      };
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
      thinking?: import('../browser/aiThinking').AIThinking;
      contextManagement?: boolean;
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
    queue(request: AIQueueRequest = { action: 'list' }): Promise<AIQueueState> {
      return invokeWhenReady('ai-queue', request);
    },
    onQueue(callback: (state: AIQueueState) => void) {
      const listener = (_event: IpcRendererEvent, state: AIQueueState) =>
        callback(state);
      ipcRenderer.on('ai-queue-changed', listener);
      return () => ipcRenderer.removeListener('ai-queue-changed', listener);
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
  appTheme: {
    get(): Promise<import('../utils/appTheme').AppTheme | undefined> {
      return invokeWhenReady('app-theme', { action: 'get' });
    },
    publish(
      theme: import('../utils/appTheme').AppTheme
    ): Promise<import('../utils/appTheme').AppTheme> {
      return invokeWhenReady('app-theme', { action: 'publish', theme });
    },
    onChanged(
      callback: (
        theme: import('../utils/appTheme').AppTheme | undefined
      ) => void
    ) {
      const listener = (
        _event: IpcRendererEvent,
        theme: import('../utils/appTheme').AppTheme | undefined
      ) => callback(theme);
      ipcRenderer.on('app-theme-changed', listener);
      return () => {
        ipcRenderer.removeListener('app-theme-changed', listener);
      };
    },
  },
  hookMarketplace: {
    request(
      input: import('../browser/hookMarketplace').HookMarketplaceRequest
    ): Promise<any> {
      return invokeWhenReady('hook-marketplace', input);
    },
    onTestState(
      callback: (
        state: import('../browser/hookMarketplace').HookTestState
      ) => void
    ) {
      const listener = (
        _event: IpcRendererEvent,
        state: import('../browser/hookMarketplace').HookTestState
      ) => callback(state);
      ipcRenderer.on('global-hook-test-state', listener);
      return () => {
        ipcRenderer.removeListener('global-hook-test-state', listener);
      };
    },
    onInstall(callback: (url: string) => void) {
      const listener = (_event: IpcRendererEvent, url: unknown) => {
        if (typeof url === 'string' && url.length <= 4096) callback(url);
      };
      ipcRenderer.on('hook-marketplace-install', listener);
      return () => {
        ipcRenderer.removeListener('hook-marketplace-install', listener);
      };
    },
    ready() {
      ipcRenderer.send('hook-marketplace-ready');
    },
  },
  setActiveNote(value: {id:string;scope?:string;kind:'note'|'todo'} | undefined) { ipcRenderer.send('active-note',value); },
  onOpenSavedNote(callback: (id: string, taskId?: string) => void) {
    const listener = (_event: IpcRendererEvent, value: {id?: string; taskId?: string}) => {
      if (typeof value?.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.id) &&
          (value.taskId === undefined || (typeof value.taskId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.taskId)))) callback(value.id, value.taskId);
    };
    ipcRenderer.on('open-saved-note', listener);
    return () => ipcRenderer.removeListener('open-saved-note', listener);
  },
  onTodosChanged(callback: () => void) {
    const listener = () => callback();
    ipcRenderer.on('todos-changed', listener);
    return () => ipcRenderer.removeListener('todos-changed', listener);
  },
  siteDeveloper: {
    onSuggestionsChanged(callback: () => void) {
      const listener = () => callback();
      ipcRenderer.on('hook-suggestions-changed', listener);
      return () => ipcRenderer.removeListener('hook-suggestions-changed', listener);
    },
    onAskAI(callback: (prompt: string) => void) {
      const listener = (_event: IpcRendererEvent, prompt: unknown) => {
        if (typeof prompt === 'string' && prompt.length <= 30000)
          callback(prompt);
      };
      ipcRenderer.on('browser-hook-ai', listener);
      return () => {
        ipcRenderer.removeListener('browser-hook-ai', listener);
      };
    },
    language(
      request: import('../browser/hookLanguage').HookLanguageRequest
    ): Promise<import('../browser/hookLanguage').HookLanguageResult> {
      return invokeWhenReady('hook-language', request);
    },
    drop(
      file: File,
      spaceId: string
    ): Promise<import('../browser/sidebarDrop').SidebarDropResult> {
      const filePath = webUtils.getPathForFile(file);
      if (!filePath)
        return Promise.reject(new Error('Drop a local file or folder.'));
      return ipcRenderer.invoke('sidebar-drop', filePath, spaceId);
    },
    linkDroppedProject(
      id: string,
      file: File
    ): Promise<DeveloperProject | null> {
      const folderPath = webUtils.getPathForFile(file);
      if (!folderPath)
        return Promise.reject(new Error('Drop a local project folder.'));
      return trackedInvoke(
        'project_linked',
        'project-folder-drop',
        id,
        folderPath
      );
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
    droppedFilePaths(files: File[]): string[] {
      if (files.length > 128) throw new Error('Drop at most 128 paths at a time.');
      return files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
    },
    droppedProjectFile(file: File): Promise<{ sourceId: string; path: string } | null> {
      const filePath = webUtils.getPathForFile(file);
      if (!filePath) return Promise.resolve(null);
      return ipcRenderer.invoke('site-developer-file-drop', filePath);
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
    taskManager(request: TaskManagerRequest): Promise<TaskManagerState> {
      return ipcRenderer.invoke('browser-task-manager', request);
    },
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
    tooltip(request: NativeTooltipRequest): Promise<void> {
      return ipcRenderer.invoke('browser-native-tooltip', request);
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
    onAIFillForm(callback: (sourceId: string) => void) {
      const listener = (_event: IpcRendererEvent, sourceId: unknown) => {
        if (typeof sourceId === 'string' && sourceId.length <= 200) callback(sourceId);
      };
      ipcRenderer.on('browser-ai-fill-form', listener);
      return () => ipcRenderer.removeListener('browser-ai-fill-form', listener);
    },
    onAISelection(callback: (text: string) => void) {
      const listener = (_event: IpcRendererEvent, text: unknown) => {
        if (typeof text === 'string' && text.trim() && text.length <= 30000)
          callback(text);
      };
      ipcRenderer.on('browser-ai-selection', listener);
      return () => ipcRenderer.removeListener('browser-ai-selection', listener);
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
    nativeAppearance(appearance: 'system' | 'light' | 'dark'): Promise<void> {
      return ipcRenderer.invoke('browser-native-appearance', appearance);
    },
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
    ): Promise<BrowserPreferences> {
      return ipcRenderer.invoke('browser-preferences', action, patch);
    },
    appUpdates(action: AppUpdateAction): Promise<AppUpdateState> {
      return ipcRenderer.invoke('browser-app-updates', action);
    },
    sidebarPanels(request: SidebarPanelRequest): Promise<SidebarPanelState> {
      return ipcRenderer.invoke('browser-sidebar-panels', request);
    },
    onSidebarPanels(callback: (state: SidebarPanelState) => void) {
      const listener = (_event: IpcRendererEvent, state: SidebarPanelState) => callback(state);
      ipcRenderer.on('browser-sidebar-panels-changed', listener);
      return () => ipcRenderer.removeListener('browser-sidebar-panels-changed', listener);
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
      | import('../browser/protection').BrowserProtectionStatus
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
    onNativeOverlayReady(callback: (event: import('../browser/contracts').NativeOverlayReady) => void) {
      const listener = (_event: IpcRendererEvent, value: import('../browser/contracts').NativeOverlayReady) => {
        if (value && (value.surface === 'page' || value.surface === 'panel') && Number.isSafeInteger(value.token) && value.token >= 0) callback(value);
      };
      ipcRenderer.on('browser-native-overlay-ready', listener);
      return () => ipcRenderer.removeListener('browser-native-overlay-ready', listener);
    },
    onSidebarHoverEdge(callback: (inside: boolean) => void) {
      const listener = (_event: IpcRendererEvent, inside: boolean) => { if (typeof inside === 'boolean') callback(inside); };
      ipcRenderer.on('browser-sidebar-hover-edge', listener);
      return () => ipcRenderer.removeListener('browser-sidebar-hover-edge', listener);
    },
    onSidebarOverlayReady(callback: (token: number) => void) {
      const listener = (_event: IpcRendererEvent, token: number) => {
        if (Number.isSafeInteger(token) && token >= 0) callback(token);
      };
      ipcRenderer.on('browser-sidebar-overlay-ready', listener);
      return () => ipcRenderer.removeListener('browser-sidebar-overlay-ready', listener);
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
    onSpaceWheel(callback: (event: SpaceWheelEvent) => void) {
      const listener = (_event: IpcRendererEvent, event: SpaceWheelEvent) =>
        callback(event);
      ipcRenderer.on('browser-space-wheel', listener);
      ipcRenderer.send('browser-observe-space-wheel');
      return () => ipcRenderer.removeListener('browser-space-wheel', listener);
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

// One destination dispatch per IPC event, regardless of Activity list subscribers.
ipcRenderer.on('browser-activity-action', (_event: IpcRendererEvent, entry: import('../browser/activity').BrowserActivity) => {
  window.dispatchEvent(new CustomEvent('kudiumbrowser-activity-action', {detail:entry}));
});
contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
