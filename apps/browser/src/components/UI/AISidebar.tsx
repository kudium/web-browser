import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Settings2,
  Code2,
  Square,
  ArrowUp,
  Hand,
  Play,
  Plus,
  X,
  FileText,
  ShieldCheck,
  Layers,
  Save,
  Trash2,
  ListTodo,
} from 'lucide-react';
import { aiThinking, thinkingOptions } from '../../browser/aiThinking';
import { AIThinkingSlider } from './AIThinkingSlider';
import { isOllamaEndpoint } from '../../browser/aiProviders';
import { AssistantPageHeader } from './AssistantPageHeader';
import { AIComposerSuggestions } from './AIComposerSuggestions';
import { useProjectFileSuggestions } from '../../utils/hooks/useProjectFileSuggestions';
import { AISkill, skillCommands } from '../../browser/aiSkills';
import { StorageRecoveryAction } from './StorageRecoveryAction';
import { AIStarterActions } from './AIStarterActions';
import { AIWorkingTabsBadge, AIWorkingTab } from './AIWorkingTabsBadge';
import { useAIPagePreference } from '../../utils/useAIPagePreference';
import { NotesPage } from './NotesPage';
import { ActivityPage } from './ActivityPage';
import { AssistantPanelHost, focusAssistantPanel } from './AssistantPanelHost';
import { HistoryToolbar } from './HistorySidebarFrame';
import { AIChatSwitcher } from './AIChatSwitcher';
import type {
  AIConversationEvent,
  AIConversationRequest,
  AIConversationsState,
} from '../../browser/aiConversations';
/* Functional components use parameter defaults instead of deprecated defaultProps. */
/* eslint-disable react/require-default-props */
/* Attachment imports preserve order and report individual failures. */
/* eslint-disable no-await-in-loop, no-restricted-syntax */
import {
  AI_ATTACHMENT_BYTES,
  AI_ATTACHMENT_LIMIT,
  AIComposerAttachment,
  AIQueueState,
} from '../../browser/aiComposer';
import { GroupPicker } from './GroupPicker';
import { AIContextPicker } from './AIContextPicker';
import { GroupIcon } from './GroupIcon';
import { AppManager } from '../../utils/AppManager';
import {
  AI_CONTEXT_MIME,
  AI_CONTEXT_LIMIT,
  AIContextAttachment,
  AIContextReference,
  validateAIContext,
} from '../../browser/aiContext';
import { AppIcon } from './AppIcon/AppIcon';
import { AIAccessStatus, AI_ACCESS_MODES } from '../../browser/aiPermissions';
import { AIGroup, aiGroupId, promptAIReferences } from '../../browser/aiGroups';
import { eventBus } from '../../utils/EventBus';
import { EVENT_KEY } from '../../utils/constant';
import { AIReferencePicker } from './AIReferencePicker';
import { AIMessage } from './AIMessage';
import { AIUsageDetails } from './AIUsageDetails';
import { AIExecutionDetails } from './AIExecutionDetails';
import { visibleAIStreamText } from '../../browser/aiSuggestions';
import { PanelOverlayContext } from './PanelDialog';
import { DeveloperSidebar } from './DeveloperSidebar';
import { AITasksPanel } from './AITasksPanel';
import { browser } from '../../browser/client';
import { lockedGroup, useGroupAccess } from '../../utils/groupAccess';
import type { MCPStatus } from '../../browser/mcp';
import { AI_DEFAULTS, AIEvent, AISettings } from '../../browser/ai';

const accessIcon = () => <ShieldCheck size={14} />;
const noPickerIcon = () => null;

export function AISidebar({
  workingTabs = [],
  activeTabId,
  contextRequest,
  developerRequest = 0,
  menuPaneRequest,
  promptRequest,
  focusedTabId,
  onFocusTab,
  onTabContextMenu,
  onGroupContextMenu,
  onManageGroup,
}: {
  promptRequest?: { text: string; token: number };
  workingTabs?: AIWorkingTab[];
  activeTabId?: string;
  focusedTabId?: string;
  developerRequest?: number;
  menuPaneRequest?: {
    pane: 'assistant' | 'tasks' | 'developer' | 'notes' | 'activity';
    token: number;
  };
  onFocusTab?: (id: string) => void;
  contextRequest?: {
    reference: AIContextReference;
    token: number;
    mode?: 'scope';
  };
  onTabContextMenu?: (id: string) => void;
  onGroupContextMenu?: (id: string) => void;
  onManageGroup?: (id: string) => void;
}) {
  const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(
    null
  );
  const [historyOpen, setHistoryOpen] = useAIPagePreference(
    'historyOpen',
    false
  );
  const [historyPinned, setHistoryPinned] = useAIPagePreference(
    'historyPinned',
    false
  );
  useEffect(() => {
    if (!historyOpen || historyPinned) return undefined;
    // Native webpages live outside this document; their focus selects the tab.
    return browser.onTabRequest((request) => {
      if (request.action === 'select') setHistoryOpen(false);
    });
  }, [historyOpen, historyPinned, setHistoryOpen]);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const closeHistory = () => {
    setHistoryOpen(false);
    requestAnimationFrame(() => historyToggle.current?.focus());
  };
  const [permissions, setPermissions] = useState<AIAccessStatus>({
    mode: 'standard',
    effectiveMode: 'standard',
    taskOnly: false,
  });
  const [storedGroups, setGroups] = useState<AIGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [pane, setPane] = useAIPagePreference('pane', 'assistant');

  const [showStats] = useAIPagePreference('showStats', true);
  const handledMenuPaneRequest = useRef<number>();
  const handledDeveloperRequest = useRef(0);
  useEffect(() => {
    if (
      menuPaneRequest &&
      menuPaneRequest.token !== handledMenuPaneRequest.current
    ) {
      handledMenuPaneRequest.current = menuPaneRequest.token;
      setPane(menuPaneRequest.pane);
      focusAssistantPanel(menuPaneRequest.pane);
    }
  }, [menuPaneRequest, setPane]);
  useEffect(() => {
    if (
      developerRequest &&
      developerRequest !== handledDeveloperRequest.current
    ) {
      handledDeveloperRequest.current = developerRequest;
      setPane('developer');
      focusAssistantPanel('developer');
    }
  }, [developerRequest, setPane]);
  const showTasks = pane === 'tasks';
  const setShowTasks = useCallback(
    (value: boolean) => setPane(value ? 'tasks' : 'assistant'),
    [setPane]
  );
  const [settings, setSettings] = useState<AISettings>({
    ...AI_DEFAULTS,
    hasKey: false,
    remembered: false,
  });
  const aiConnected = settings.hasKey || isOllamaEndpoint(settings.endpoint);
  const [external, setExternal] = useState<MCPStatus>();
  const [chatSkills, setChatSkills] = useState<AISkill[]>([]);
  const refreshSkills = () => {
    window.electron.ai
      .skills?.({ action: 'list' })
      .then(setChatSkills)
      .catch(() => setChatSkills([]));
  };
  useEffect(() => {
    refreshSkills();
  }, []);
  const [prompt, setPrompt] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [attachments, setAttachments] = useState<AIComposerAttachment[]>([]);
  const [sentFiles, setSentFiles] = useState<AIComposerAttachment[]>([]);
  const [contexts, setContexts] = useState<AIContextAttachment[]>([]);
  const groupAccess = useGroupAccess();
  const allContextTabs = AppManager.getAll();
  const contextTabs = allContextTabs.filter(
    (tab) => !lockedGroup(tab, groupAccess)
  );
  const lockedGroupIds = new Set(
    allContextTabs.filter((tab) => lockedGroup(tab, groupAccess)).map(aiGroupId)
  );
  const groups = storedGroups.filter(
    (group) =>
      groupAccess.ready && !groupAccess.error && !lockedGroupIds.has(group.id)
  );
  const blockedContext =
    groupId !== null && contexts.some((ref) => ref.groupId !== groupId);
  const [attaching, setAttaching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const attachmentRef = useRef<AIComposerAttachment[]>([]);
  attachmentRef.current = attachments;
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [queue, setQueue] = useState<AIQueueState>({
    messages: [],
    paused: false,
  });
  const [feedbackId, setFeedbackId] = useState<string>();
  const [resumable, setResumable] = useState(false);
  const [events, setEvents] = useState<AIConversationEvent[]>([]);
  const followLog = useRef(true);
  const [chatState, setChatState] = useState<AIConversationsState>();
  const [changingChat, setChangingChat] = useState(false);
  const chatDrafts = useRef<
    Record<
      string,
      {
        prompt: string;
        attachments: AIComposerAttachment[];
        contexts: AIContextAttachment[];
        sentFiles: AIComposerAttachment[];
      }
    >
  >({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const taskInput = useRef<HTMLTextAreaElement>(null);
  const showError = useCallback((reason: Error) => {
    const missing = /No handler registered|Cannot read properties/.test(
      reason.message
    );
    setUnavailable(missing);
    setError(
      missing
        ? 'Restart Kudium Browser to connect the AI service.'
        : reason.message.replace(
            /^Error invoking remote method '[^']+': (Error: )?/,
            ''
          )
    );
  }, []);
  useEffect(() => {
    window.electron.ai.savedAttachments?.().then(setSentFiles).catch(showError);
  }, [showError]);
  const connect = useCallback(
    () =>
      window.electron.ai
        .settings()
        .then((value) => {
          setSettings(value);
          setUnavailable(false);
          setError('');
          return undefined;
        })
        .catch(showError)
        .finally(() => setConnecting(false)),
    [showError]
  );
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      if (!window.electron.ai.groups) return;
      window.electron.ai
        .groups()
        .then((value) => {
          if (mounted) {
            setGroups(value.groups);
            setGroupId(value.groupId);
          }
          return undefined;
        })
        .catch(showError);
    };
    refresh();
    const off =
      'ipcRenderer' in window.electron
        ? eventBus.on(EVENT_KEY.APP_LIST_UPDATE, refresh)
        : () => {};
    const scopeOff = window.electron.ai.onScope?.((next) => {
      setGroupId(next);
      refresh();
    });
    return () => {
      mounted = false;
      off();
      scopeOff?.();
    };
  }, [showError]);
  useEffect(() => {
    let mounted = true;
    setModels([]);
    if (aiConnected && window.electron.ai.models) {
      window.electron.ai
        .models()
        .then((value) => {
          if (mounted) setModels(value);
          return undefined;
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [settings.endpoint, aiConnected]);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const slash = slashDismissed
    ? null
    : /(?:^|\s)\/([^\s]*)$/u.exec(prompt.slice(0, cursor));
  const referencedProjectGroup =
    contexts.length > 0
      ? groups.find((group) => group.id === contexts[0].groupId)
      : undefined;
  const projectGroup =
    groupId !== null
      ? groups.find((group) => group.id === groupId)
      : groups.find((group) =>
          group.tabs.some((tab) => tab.id === (focusedTabId || activeTabId))
        ) || referencedProjectGroup;
  const projectSourceId =
    projectGroup?.tabs.find((tab) => tab.id === (focusedTabId || activeTabId))
      ?.id || projectGroup?.tabs[0]?.id;
  let projectQuery = slash?.[1];
  try {
    if (projectQuery !== undefined) projectQuery = decodeURI(projectQuery);
  } catch {
    /* Incomplete path escape while typing. */
  }
  const projectFiles = useProjectFileSuggestions(projectSourceId, projectQuery);
  const skillSuggestions = slash
    ? [
        ...skillCommands(chatSkills)
          .filter(
            (skill) =>
              skill.enabled &&
              skill.command.toLowerCase().includes(slash[1].toLowerCase())
          )
          .slice(0, 8)
          .map((skill) => ({ ...skill, kind: 'skill' as const })),
        ...projectFiles.entries.map((file) => ({
          id: `project:${file.path}`,
          command: `/${encodeURI(file.path)}${
            file.kind === 'folder' ? '/' : ''
          }`,
          name: file.name,
          description: `${file.kind === 'folder' ? 'Folder' : 'File'} · ${
            projectGroup?.name || 'Project'
          }`,
          kind: file.kind,
          path: file.path,
        })),
      ]
    : [];
  const insertSkill = (command: string) => {
    if (!slash) return;
    const start = cursor - slash[1].length - 1;
    const item = skillSuggestions.find((entry) => entry.command === command);
    const folder = item?.kind === 'folder';
    const insertion =
      item?.kind === 'file' && projectGroup
        ? `project file ${JSON.stringify(item.path)} in @${projectGroup.slug}`
        : command;
    const suffix = folder ? '' : ' ';
    setPrompt(
      `${prompt.slice(0, start)}${insertion}${suffix}${prompt.slice(cursor)}`
    );
    const position = start + insertion.length + suffix.length;
    setCursor(position);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      taskInput.current?.focus();
      taskInput.current?.setSelectionRange(position, position);
    });
  };
  const mention = /(?:^|[\s(*_])@([a-z0-9-/]*)$/.exec(prompt.slice(0, cursor));
  const suggestions = mention
    ? groups
        .flatMap<{
          reference: string;
          groupId: string;
          name: string;
          detail: string;
          icon: string;
          kind: 'tab' | 'group';
          id: string;
        }>((group) => {
          const [groupQuery, pageQuery] = mention[1].toLowerCase().split('/');
          if (!`${group.slug} ${group.name}`.toLowerCase().includes(groupQuery))
            return [];
          if (pageQuery !== undefined)
            return group.tabs
              .filter((page) =>
                `${page.name} ${page.slug}`.toLowerCase().includes(pageQuery)
              )
              .slice(0, 8)
              .map((page) => ({
                reference: `@${group.slug}/${page.slug}`,
                groupId: group.id,
                name: page.name,
                detail: group.name,
                icon: page.icon,
                kind: 'tab' as const,
                id: page.id,
              }));
          return [
            {
              reference: `@${group.slug}`,
              groupId: group.id,
              name: group.name,
              detail: `${group.tabs.length} tabs`,
              icon: group.tabs[0]?.icon,
              kind: 'group' as const,
              id: group.id,
            },
          ];
        })
        .slice(0, 8)
    : [];
  const blockedMention = groups.find(
    (group) =>
      groupId !== null &&
      group.id !== groupId &&
      promptAIReferences(prompt).some(
        (reference) => reference.split('/')[0] === group.slug
      )
  );
  const changeScope = useCallback(
    async (next: string) => {
      try {
        const value = await window.electron.ai.groups(
          next === 'all' ? null : next
        );
        setGroupId(value.groupId);
        setGroups(value.groups);
      } catch (reason) {
        showError(reason as Error);
      }
    },
    [showError]
  );
  const thinkingChoices = thinkingOptions(settings.endpoint, settings.model);
  const selectedThinking =
    thinkingChoices.find((option) => option.id === settings.thinking) ||
    thinkingChoices[0];
  const changeThinking = async (value: string) => {
    try {
      setSettings(
        await window.electron.ai.settings({
          endpoint: settings.endpoint,
          model: settings.model,
          remember: settings.remembered,
          thinking: aiThinking(value),
        })
      );
    } catch (reason) {
      showError(reason as Error);
    }
  };
  const changeModel = async (model: string) => {
    try {
      setSettings(
        await window.electron.ai.settings({
          endpoint: settings.endpoint,
          model,
          remember: settings.remembered,
        })
      );
    } catch (reason) {
      showError(reason as Error);
    }
  };
  useEffect(() => {
    let mounted = true;
    window.electron.ai
      .permissions?.()
      .then((value) => {
        if (mounted) setPermissions(value);
        return undefined;
      })
      .catch(showError);
    const off = window.electron.ai.onPermissions?.(setPermissions);
    return () => {
      mounted = false;
      off?.();
    };
  }, [showError]);
  useEffect(() => {
    if (!window.electron.ai.queue) return undefined;
    let mounted = true;
    let received = false;
    const off = window.electron.ai.onQueue?.((state) => {
      received = true;
      setQueue(state);
      if (state.started) setEvents((previous) => [...previous, state.started!]);
    });
    window.electron.ai
      .queue()
      .then((state) => {
        if (mounted && !received) setQueue(state);
      })
      .catch(showError);
    return () => {
      mounted = false;
      off?.();
    };
  }, [showError]);
  const changeQueue = async (
    request: Parameters<typeof window.electron.ai.queue>[0]
  ) => {
    try {
      setQueue(await window.electron.ai.queue(request));
    } catch (reason) {
      showError(reason as Error);
    }
  };
  const refreshChats = () => {
    window.electron.ai
      .conversations?.({ action: 'list' })
      .then(setChatState)
      .catch(showError);
  };
  useEffect(() => {
    const deletion = chatState?.undoDeletion;
    if (!deletion) return undefined;
    const timer = setTimeout(() => {
      delete chatDrafts.current[deletion.id];
      setChatState((state) =>
        state?.undoDeletion?.id === deletion.id
          ? { ...state, undoDeletion: undefined }
          : state
      );
    }, Math.max(0, deletion.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [chatState?.undoDeletion]);
  const changeChat = async (request: AIConversationRequest) => {
    if (changingChat || !chatState) return;
    if (request.action === 'select' && request.id === chatState.selectedId)
      return;
    if (request.action === 'rename' || request.action === 'reorder') {
      try {
        setChatState(await window.electron.ai.conversations(request));
      } catch (reason) {
        showError(reason as Error);
      }
      return;
    }
    if (busy || attaching || queue.messages.length) return;
    chatDrafts.current[chatState.selectedId] = {
      prompt,
      attachments,
      contexts,
      sentFiles,
    };
    setChangingChat(true);
    try {
      const next = await window.electron.ai.conversations({
        ...request,
        draft: prompt,
      } as AIConversationRequest);
      setChatState(next);
      followLog.current = true;
      setEvents(next.history);
      const cached = chatDrafts.current[next.selectedId];
      setPrompt(cached?.prompt ?? next.draft);
      setAttachments(cached?.attachments || []);
      setContexts(cached?.contexts || []);
      setSentFiles(cached?.sentFiles || []);
      setResumable(
        next.conversations.find((chat) => chat.id === next.selectedId)
          ?.paused || false
      );
      setError('');
      setNotice('');
    } catch (reason) {
      showError(reason as Error);
    } finally {
      setChangingChat(false);
    }
  };
  const changePermissions = (mode: string) =>
    window.electron.ai
      .permissions(mode as AIAccessStatus['mode'])
      .then(setPermissions)
      .catch(showError);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    connect();
    window.electron.ai
      .mcpStatus()
      .then(setExternal)
      .catch(() => {});
    const externalCleanup = window.electron.ai.onMCP(setExternal);
    let mounted = true;
    let receivedEvent = false;
    window.electron.ai
      .conversations?.({ action: 'list' })
      .then((value) => {
        if (!mounted) return undefined;
        setChatState(value);
        if (!receivedEvent) setEvents(value.history);
        setPrompt((current) => current || value.draft);
        return undefined;
      })
      .catch(showError);
    const chatsCleanup = window.electron.ai.onConversations?.(setChatState);
    const eventsCleanup = window.electron.ai.onEvent((event) => {
      if (event.type === 'activity') return;
      if (event.type === 'feedback') {
        setFeedbackId(event.feedbackId);
        return;
      }
      if (event.type === 'partial') {
        setStreamingText(visibleAIStreamText(event.text));
        return;
      }
      if (['message', 'error', 'handoff', 'done'].includes(event.type))
        setStreamingText('');
      receivedEvent = true;
      if (event.type === 'status') setBusy(true);
      if (
        event.source !== 'external' &&
        (event.type === 'error' || event.type === 'handoff')
      )
        setResumable(!!event.resumable);
      if (event.type === 'done') {
        setBusy(false);
        if (event.source !== 'external') setResumable(!!event.resumable);
      } else
        setEvents((previous) => [
          ...(event.type === 'status'
            ? previous.filter((item) => item.type !== 'status')
            : previous),
          event,
        ]);
    });
    window.electron.ai
      .taskStatus()
      .then((status) => {
        if (!mounted || receivedEvent) return undefined;
        setBusy(status.busy);
        setFeedbackId(status.feedbackId);
        setResumable(status.resumable);
        if (status.history?.length) setEvents(status.history);
        const { reason } = status;
        if (reason && !status.history?.some((event) => event.text === reason))
          setEvents((previous) => [
            ...previous,
            { type: 'handoff', text: reason },
          ]);
        return undefined;
      })
      .catch(showError);
    const settingsCleanup = window.electron.ai.onSettings(setSettings);
    return () => {
      mounted = false;
      chatsCleanup?.();
      eventsCleanup();
      settingsCleanup();
      externalCleanup();
    };
  }, [connect, showError]);
  useEffect(() => {
    if (followLog.current)
      log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [events, streamingText, error, notice]);
  useEffect(() => {
    if (!chatState?.selectedId || changingChat) return undefined;
    const timer = setTimeout(() => {
      window.electron.ai
        .conversations?.({
          action: 'draft',
          id: chatState.selectedId,
          draft: prompt,
        })
        .catch(showError);
    }, 400);
    return () => clearTimeout(timer);
  }, [prompt, chatState?.selectedId, changingChat, showError]);
  const latestReply = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === 'message' ||
        event.type === 'user' ||
        event.type === 'error'
    );
  const latestAction = [...events]
    .reverse()
    .find((event) => event.type === 'status');
  const openSettings = () =>
    window.electron.ai.openPreferences().catch(showError);
  const continueTask = async () => {
    if (changingChat) return false;
    if (busy || !aiConnected || unavailable) return false;
    setBusy(true);
    setError('');
    try {
      await window.electron.ai.resume();
      setResumable(false);
      return true;
    } catch (reason) {
      setBusy(false);
      showError(reason as Error);
      return false;
    }
  };
  useEffect(
    () => () => {
      [
        ...new Map(
          [
            ...attachmentRef.current,
            ...Object.values(chatDrafts.current).flatMap(
              (draft) => draft.attachments
            ),
          ].map((file) => [file.id, file])
        ).values(),
      ].forEach((file) => {
        window.electron.ai.removeAttachment?.(file.id).catch(() => {});
      });
    },
    []
  );
  useEffect(() => {
    const input = taskInput.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(160, Math.max(64, input.scrollHeight))}px`;
  }, [prompt, pane]);
  const handledPromptRequest = useRef<number>();
  useEffect(() => {
    if (
      !promptRequest ||
      changingChat ||
      handledPromptRequest.current === promptRequest.token
    )
      return undefined;
    handledPromptRequest.current = promptRequest.token;
    setPane('assistant');
    focusAssistantPanel('assistant');
    setPrompt(promptRequest.text);
    setCursor(promptRequest.text.length);
    const frame = requestAnimationFrame(() => {
      taskInput.current?.focus();
      taskInput.current?.setSelectionRange(
        promptRequest.text.length,
        promptRequest.text.length
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [promptRequest, changingChat, setPane]);
  const pickAttachments = async () => {
    if (attaching || busy) return;
    setAttaching(true);
    setError('');
    try {
      const result = await window.electron.ai.pickAttachments();
      setAttachments((previous) => [...previous, ...result.attachments]);
      if (result.errors.length) setError(result.errors.join('\n'));
    } catch (reason) {
      showError(reason as Error);
    } finally {
      setAttaching(false);
      taskInput.current?.focus();
    }
  };
  const addFiles = async (files: File[]) => {
    if (attaching || busy) return;
    setShowTasks(false);
    setAttaching(true);
    setDragging(false);
    setError('');
    const errors: string[] = [];
    for (const file of files.slice(0, AI_ATTACHMENT_LIMIT)) {
      try {
        if (file.size > AI_ATTACHMENT_BYTES)
          throw new Error('Choose a file up to 20 MB.');
        const added = await window.electron.ai.addAttachment(
          file.name,
          new Uint8Array(await file.arrayBuffer())
        );
        setAttachments((previous) => [...previous, added]);
      } catch (reason) {
        errors.push(`${file.name}: ${(reason as Error).message}`);
      }
    }
    if (files.length > AI_ATTACHMENT_LIMIT)
      errors.push('Attach up to 8 files.');
    if (errors.length) setError(errors.join('\n'));
    setAttaching(false);
  };
  const addContext = useCallback(
    async (payload: string) => {
      if (attaching) return;
      setShowTasks(false);
      setAttaching(true);
      setError('');
      try {
        const reference = validateAIContext(JSON.parse(payload));
        const added = await window.electron.ai.attachContext(reference);
        const alreadyIncluded = contexts.some(
          (ref) =>
            (ref.kind === added.kind && ref.id === added.id) ||
            (ref.kind === 'group' && ref.id === added.groupId)
        );
        const retained = contexts.filter(
          (ref) => added.kind !== 'group' || ref.groupId !== added.id
        );
        if (!alreadyIncluded && retained.length >= AI_CONTEXT_LIMIT)
          throw new Error('Attach up to 8 tabs or groups.');
        setContexts((previous) => {
          // A group already includes its pages. Keep one reference per target.
          if (
            previous.some(
              (ref) =>
                (ref.kind === added.kind && ref.id === added.id) ||
                (ref.kind === 'group' && ref.id === added.groupId)
            )
          )
            return previous;
          const next = previous.filter(
            (ref) => added.kind !== 'group' || ref.groupId !== added.id
          );
          return [...next, added];
        });
        taskInput.current?.focus();
      } catch (reason) {
        showError(reason as Error);
      } finally {
        setAttaching(false);
      }
    },
    [attaching, contexts, showError, setShowTasks]
  );
  const insertMention = (reference: string) => {
    if (!mention) return;
    const start = cursor - mention[1].length - 1;
    const next = `${prompt.slice(0, start)}${reference} ${prompt.slice(
      cursor
    )}`;
    setPrompt(next);
    const selected = suggestions.find((entry) => entry.reference === reference);
    if (selected)
      addContext(JSON.stringify({ kind: selected.kind, id: selected.id }));
    setCursor(start + reference.length + 1);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      taskInput.current?.focus();
      taskInput.current?.setSelectionRange(
        start + reference.length + 1,
        start + reference.length + 1
      );
    });
  };
  const handledRequest = useRef<number>();
  useEffect(() => {
    if (
      attaching ||
      !contextRequest ||
      handledRequest.current === contextRequest.token
    )
      return;
    handledRequest.current = contextRequest.token;
    if (
      contextRequest.mode === 'scope' &&
      contextRequest.reference.kind === 'group'
    ) {
      setShowTasks(false);
      changeScope(contextRequest.reference.id);
      taskInput.current?.focus();
    } else addContext(JSON.stringify(contextRequest.reference));
  }, [contextRequest, attaching, addContext, changeScope, setShowTasks]);
  const activeContextTabId = focusedTabId || activeTabId;
  const activeContextGroup = groups.find((group) =>
    group.tabs.some((tab) => tab.id === activeContextTabId)
  );
  const activeContextGroupId = activeContextGroup?.id;
  const activeChatId = chatState?.selectedId;
  const autoContext = useRef<{ chatId: string; tabId: string }>();
  const freshChat =
    !!chatState &&
    !chatState.history.length &&
    !events.length &&
    !busy &&
    !resumable &&
    !changingChat;
  useEffect(() => {
    if (
      !freshChat ||
      !activeChatId ||
      !activeContextGroupId ||
      !activeContextTabId ||
      attaching
    )
      return undefined;
    const chatId = activeChatId;
    const tabId = activeContextTabId;
    if (
      autoContext.current?.chatId === chatId &&
      autoContext.current.tabId === tabId
    )
      return undefined;
    let cancelled = false;
    const previous = autoContext.current;
    const assign = async () => {
      try {
        const value = await window.electron.ai.groups(activeContextGroupId);
        if (cancelled) return;
        setGroupId(value.groupId);
        setGroups(value.groups);
        const tab = await window.electron.ai.attachContext({
          kind: 'tab',
          id: tabId,
        });
        if (cancelled) return;
        autoContext.current = { chatId, tabId };
        setContexts((current) =>
          [
            ...current.filter(
              (ref) =>
                !(
                  ref.kind === 'tab' &&
                  (ref.id === tabId ||
                    (previous?.chatId === chatId && ref.id === previous.tabId))
                )
            ),
            tab,
          ].slice(0, AI_CONTEXT_LIMIT)
        );
      } catch (reason) {
        if (!cancelled) showError(reason as Error);
      }
    };
    assign();
    return () => {
      cancelled = true;
    };
  }, [
    freshChat,
    activeChatId,
    activeContextGroupId,
    activeContextTabId,
    attaching,
    showError,
  ]);
  const saveAttachment = async (file: AIComposerAttachment) => {
    setError('');
    setNotice(`Saving ${file.name}…`);
    setAttaching(true);
    try {
      if (await window.electron.ai.saveAttachment(file.id))
        setNotice(`Saved ${file.name} to Personal Data.`);
      else setNotice('');
    } catch (reason) {
      setNotice('');
      showError(reason as Error);
    } finally {
      setAttaching(false);
    }
  };
  const referenceGroups = groups.filter(
    (group) =>
      contexts.some((ref) => ref.groupId === group.id) ||
      promptAIReferences(prompt).some(
        (reference) => reference.split('/')[0] === group.slug
      )
  );
  const addReference = (reference: AIContextReference) => {
    if (reference.kind === 'tab') {
      const group = groups.find((entry) =>
        entry.tabs.some((tab) => tab.id === reference.id)
      );
      const page = group?.tabs.find((tab) => tab.id === reference.id);
      if (group && page) {
        setContexts((previous) =>
          previous.filter(
            (entry) => entry.kind !== 'group' || entry.id !== group.id
          )
        );
        setPrompt((current) =>
          current.replace(
            new RegExp(`@${group.slug}(?=$|[\\s.,!?;:])`, 'g'),
            `@${group.slug}/${page.slug}`
          )
        );
      }
    }
    addContext(JSON.stringify(reference));
  };
  const removeAttachment = async (id: string) => {
    try {
      await window.electron.ai.removeAttachment(id);
      setAttachments((previous) => previous.filter((file) => file.id !== id));
      setSentFiles((previous) => previous.filter((file) => file.id !== id));
    } catch (reason) {
      showError(reason as Error);
    }
  };
  const attachmentMenu = (file: AIComposerAttachment) => {
    browser
      .nativeMenu([
        ...(file.kind === 'document'
          ? [
              {
                id: 'save',
                label: 'Save to Personal Data…',
                enabled: !busy && !attaching,
              },
            ]
          : []),
        { id: 'remove', label: 'Remove attachment', enabled: !busy },
      ])
      .then((choice) => {
        if (choice === 'save' && !busy && !attaching) saveAttachment(file);
        if (choice === 'remove' && !busy) removeAttachment(file.id);
        return undefined;
      })
      .catch(showError);
  };
  const contextScope =
    !blockedMention &&
    contexts.length &&
    contexts.every((ref) => ref.groupId === contexts[0].groupId)
      ? contexts[0].groupId
      : 'all';
  const submit = async () => {
    if (submitting.current) return;
    if (feedbackId) {
      if (!prompt.trim() || changingChat) return;
      const answer = prompt.trim();
      try {
        await window.electron.ai.feedback(feedbackId, answer);
        setEvents((previous) => [...previous, { type: 'user', text: answer }]);
        setPrompt('');
        setFeedbackId(undefined);
        setError('');
      } catch (reason) {
        showError(reason as Error);
      }
      return;
    }

    let task = prompt.trim();
    if (!task && contexts.length) task = 'Review the attached browser context.';
    if (!task && attachments.length) task = 'Review the attached files.';
    if (
      !task ||
      attaching ||
      changingChat ||
      !aiConnected ||
      unavailable ||
      blockedMention ||
      blockedContext
    )
      return;
    if (
      !busy &&
      !queue.messages.length &&
      resumable &&
      !attachments.length &&
      !contexts.length &&
      /^(?:please\s+)?(?:resume|continue)(?:\s+(?:(?:the|my|this|original)\s+)?task)?(?:\s+please)?[.!]?$/i.test(
        task
      )
    ) {
      if (await continueTask()) {
        setPrompt('');
        setEvents((previous) => [...previous, { type: 'user', text: task }]);
      }
      return;
    }
    submitting.current = true;
    if (!busy && !queue.messages.length) setBusy(true);
    if (!busy && !queue.messages.length) setResumable(false);
    setError('');
    const usedSkills = skillCommands(chatSkills).filter(
      (skill) => skill.enabled && task.split(/\s+/).includes(skill.command)
    );
    if (usedSkills.length)
      task += `\n\nUse the following enabled skills for this request. Load their instructions with read_skill (discover the skills tools first if needed): ${usedSkills
        .map((skill) => `${skill.command}: skillId=${JSON.stringify(skill.id)}`)
        .join(', ')}.`;
    const sentPrompt = prompt;
    followLog.current = true;
    const sentAttachments = attachments;
    const sentContexts = contexts;
    try {
      const accepted = await window.electron.ai.run(
        sentAttachments.length || sentContexts.length
          ? {
              prompt: task,
              attachmentIds: sentAttachments.map((file) => file.id),
              ...(sentContexts.length
                ? {
                    contextReferences: sentContexts.map(({ kind, id }) => ({
                      kind,
                      id,
                    })),
                  }
                : {}),
            }
          : task
      );
      if (accepted !== false)
        setEvents((previous) => [
          ...previous,
          {
            type: 'user',
            text: task,
            attachments: sentAttachments.map(({ id, name, kind }) => ({
              id,
              name,
              kind,
            })),
            contexts: sentContexts.map(({ id, name, kind }) => ({
              id,
              name,
              kind,
            })),
          },
        ]);
      if (accepted !== false)
        setSentFiles((current) => [...current, ...sentAttachments]);
      refreshChats();
      if (chatState)
        window.electron.ai
          .conversations?.({
            action: 'draft',
            id: chatState.selectedId,
            draft: '',
          })
          .catch(showError);
      setPrompt((current) => (current === sentPrompt ? '' : current));
      setContexts((current) =>
        current.filter(
          (ref) =>
            !sentContexts.some(
              (sent) => sent.kind === ref.kind && sent.id === ref.id
            )
        )
      );
      setAttachments((current) =>
        current.filter(
          (file) => !sentAttachments.some((sent) => sent.id === file.id)
        )
      );
    } catch (reason) {
      if (!busy) setBusy(false);
      showError(reason as Error);
    } finally {
      submitting.current = false;
    }
  };
  const assistantActions = (
    <div className="ai-compact-actions">
      <button
        type="button"
        className="ai-history-toggle"
        aria-label={showTasks ? 'Back to Assistant' : 'Saved AI tasks'}
        title={showTasks ? 'Back to Assistant' : 'Saved AI tasks'}
        onClick={() => setShowTasks(!showTasks)}
      >
        {showTasks ? <Sparkles size={15} /> : <ListTodo size={15} />}
      </button>
      {(busy || (external?.running && external?.paused)) && (
        <button
          type="button"
          aria-label={
            external?.paused && !busy ? 'Resume external AI' : 'Take control'
          }
          title={
            external?.paused && !busy ? 'Resume external AI' : 'Take control'
          }
          onClick={() =>
            (external?.paused && !busy
              ? window.electron.ai.resumeExternal()
              : window.electron.ai.takeOver()
            ).catch(showError)
          }
        >
          {external?.paused && !busy ? <Play size={17} /> : <Hand size={17} />}
        </button>
      )}
      <button
        type="button"
        aria-label="Open Developer"
        title="Developer"
        onClick={() => setPane('developer')}
      >
        <Code2 size={17} />
      </button>
      <button
        type="button"
        aria-label="AI settings"
        title="Connection settings"
        onClick={openSettings}
      >
        <Settings2 size={17} />
      </button>
    </div>
  );
  return createElement(
    PanelOverlayContext.Provider,
    { value: overlayContainer },
    <aside
      className="ai-sidebar"
      aria-label="Assistant"
      onContextMenu={(event) => {
        if (
          (event.target as HTMLElement).closest(
            'input,textarea,[contenteditable=true],.ai-markdown,.ai-task-row,.developer-sidebar-page'
          )
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        browser
          .nativeMenu([
            {
              id: 'assistant',
              label: 'Assistant',
              enabled: pane !== 'assistant',
            },
            { id: 'tasks', label: 'Tasks', enabled: pane !== 'tasks' },
            {
              id: 'developer',
              label: 'Developer',
              enabled: pane !== 'developer',
            },
            { id: 'notes', label: 'Notes', enabled: pane !== 'notes' },
            { id: 'activity', label: 'Activity', enabled: pane !== 'activity' },
            { type: 'separator' },
            { id: 'settings', label: 'AI settings…' },
          ])
          .then((choice) => {
            if (
              choice === 'assistant' ||
              choice === 'tasks' ||
              choice === 'developer' ||
              choice === 'notes' ||
              choice === 'activity'
            )
              setPane(choice);
            if (choice === 'settings') openSettings();
            return undefined;
          })
          .catch(showError);
      }}
      onDragOver={(event) => {
        if (
          event.dataTransfer.types.includes(AI_CONTEXT_MIME) ||
          event.dataTransfer.types.includes('Files')
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = busy || attaching ? 'none' : 'copy';
          setDragging(!busy && !attaching);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        const payload = event.dataTransfer.getData(AI_CONTEXT_MIME);
        if (!payload && !event.dataTransfer.files.length) return;
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        if (busy || attaching || changingChat) return;
        if (payload) {
          addContext(payload);
        } else addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <AssistantPanelHost panel="activity" active={pane === 'activity'}>
        <div
          className="ai-sidebar-pane ai-activity-pane"
          role="region"
          id="ai-activity-panel"
          aria-label="Activity"
        >
          <ActivityPage
            active
            onAskAI={() => {
              const text =
                'Help me set up a page hook that creates an Activity alert when something changes. Ask which website and change I want to monitor, then help me configure and enable the hook.';
              setPane('assistant');
              focusAssistantPanel('assistant');
              setPrompt(text);
              setCursor(text.length);
              requestAnimationFrame(() => taskInput.current?.focus());
            }}
          />
        </div>
      </AssistantPanelHost>
      <AssistantPanelHost panel="notes" active={pane === 'notes'}>
        <div
          className="ai-sidebar-pane ai-notes-pane"
          role="region"
          id="ai-notes-panel"
          aria-label="Notes workspace"
        >
          <NotesPage tabs={allContextTabs} />
        </div>
      </AssistantPanelHost>
      <AssistantPanelHost panel="developer" active={pane === 'developer'}>
        <DeveloperSidebar
          onManageGroup={onManageGroup}
          active
          focusedTabId={focusedTabId}
          onFocusTab={onFocusTab}
          onTabContextMenu={onTabContextMenu}
          onGroupContextMenu={onGroupContextMenu}
        />
      </AssistantPanelHost>
      <AssistantPanelHost panel="tasks" active={showTasks}>
        <div
          className="ai-sidebar-pane"
          role="region"
          id="ai-tasks-panel"
          aria-label="Tasks"
        >
          <AssistantPageHeader className="ai-conversation-toolbar">
            {assistantActions}
          </AssistantPageHeader>
          <AITasksPanel busy={busy} resumable={resumable} />
        </div>
      </AssistantPanelHost>
      <AssistantPanelHost panel="assistant" active={pane === 'assistant'}>
        <div
          className={`ai-sidebar-pane ai-assistant-layout${
            historyOpen ? ' ai-history-open' : ''
          }${historyPinned ? ' ai-history-pinned' : ''}`}
          role="region"
          id="ai-assistant-panel"
          aria-label="Assistant"
        >
          <AssistantPageHeader className="ai-conversation-toolbar">
            {chatState && !historyOpen && (
              <HistoryToolbar
                toggleRef={historyToggle}
                open={historyOpen}
                label="Chat history"
                panelId="ai-chat-history-panel"
                busy={
                  busy || attaching || changingChat || !!queue.messages.length
                }
                onOpen={() => {
                  setHistoryOpen(true);
                  refreshChats();
                }}
                onNew={() => changeChat({ action: 'create' })}
                newLabel="Start new chat"
              />
            )}
            {assistantActions}
          </AssistantPageHeader>
          {chatState && historyOpen && (
            <div id="ai-chat-history-panel" className="ai-chat-history-panel">
              <AIChatSwitcher
                state={chatState}
                busy={busy || attaching || !!queue.messages.length}
                changing={changingChat}
                onChange={changeChat}
                pinned={historyPinned}
                onPin={() => setHistoryPinned((value) => !value)}
                onClose={closeHistory}
              />
            </div>
          )}
          <div
            className="ai-log"
            ref={log}
            role="log"
            aria-live="polite"
            onScroll={(event) => {
              const node = event.currentTarget;
              followLog.current =
                node.scrollHeight - node.scrollTop - node.clientHeight < 80;
            }}
          >
            {connecting && (
              <div className="ai-empty" role="status">
                Loading assistant…
              </div>
            )}
            {!connecting && !events.length && (
              <div className="ai-empty">
                <h3>
                  {external?.running ? 'External AI ready' : 'How can I help?'}
                </h3>
                {!aiConnected && (
                  <button
                    className="ai-connect-button"
                    type="button"
                    onClick={openSettings}
                  >
                    Connect AI
                  </button>
                )}
                <AIStarterActions
                  disabled={changingChat || busy}
                  onChoose={(text) => {
                    setPrompt(text);
                    setCursor(text.length);
                    requestAnimationFrame(() => taskInput.current?.focus());
                  }}
                />
              </div>
            )}
            {chatState?.taskMemory &&
              Object.values(chatState.taskMemory).some(
                (entries) => entries.length
              ) && (
                <details className="ai-execution-details">
                  <summary>Task notes</summary>
                  <p>
                    Working notes from the assistant. They may need checking.
                  </p>
                  {(['decisions', 'unfinished', 'sources'] as const).map(
                    (key) =>
                      chatState.taskMemory![key].length ? (
                        <div key={key}>
                          <strong>
                            {
                              {
                                decisions: 'Decisions',
                                unfinished: 'Unfinished work',
                                sources: 'Sources',
                              }[key]
                            }
                          </strong>
                          <ul>
                            {chatState.taskMemory![key].map((text, index) => (
                              <li key={index}>{text}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null
                  )}
                  <button
                    type="button"
                    disabled={busy || changingChat}
                    onClick={() => {
                      window.electron.ai
                        .conversations({
                          action: 'clear-memory',
                          id: chatState.selectedId,
                        })
                        .then(setChatState)
                        .catch(showError);
                    }}
                  >
                    Clear task notes
                  </button>
                </details>
              )}
            {events
              .filter((event) => event.type !== 'status')
              .map((event, index) => (
                <div key={index} className={`ai-message ai-${event.type}`}>
                  <AIMessage
                    text={event.text}
                    followUps={event.type === 'message'}
                    onSuggestion={
                      event === latestReply &&
                      event.type === 'message' &&
                      !busy &&
                      !changingChat &&
                      !attaching &&
                      !resumable &&
                      !unavailable &&
                      !external?.running
                        ? (text) => {
                            setPrompt((current) =>
                              current.trim() ? `${current}\n${text}` : text
                            );
                            requestAnimationFrame(() =>
                              taskInput.current?.focus()
                            );
                          }
                        : undefined
                    }
                    groups={groups}
                    onReference={addReference}
                    onTabContextMenu={onTabContextMenu}
                    onGroupContextMenu={onGroupContextMenu}
                  />
                  {event.type === 'message' && event.suggestions?.length ? (
                    <div className="ai-feedback-suggestions">
                      {event.suggestions.map((suggestion, optionIndex) => (
                        <button
                          type="button"
                          key={optionIndex}
                          disabled={
                            feedbackId !== event.feedbackId || changingChat
                          }
                          onClick={() => {
                            setPrompt(suggestion);
                            requestAnimationFrame(() =>
                              taskInput.current?.focus()
                            );
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {showStats &&
                    event.type === 'message' &&
                    (event.usage || event.execution) && (
                      <details className="ai-stats-details">
                        <summary>Stats</summary>
                        <div className="ai-stats-content">
                          {event.usage && (
                            <AIUsageDetails usage={event.usage} />
                          )}
                          {event.execution && (
                            <AIExecutionDetails execution={event.execution} />
                          )}
                        </div>
                      </details>
                    )}
                  {event.type !== 'user' && event.contextNotice && (
                    <p className="ai-context-notice">{event.contextNotice}</p>
                  )}
                  {event.type === 'user' &&
                    !!(event.attachments?.length || event.contexts?.length) && (
                      <div className="ai-message-assets">
                        {event.contexts?.map((ref) => (
                          <button
                            type="button"
                            key={`${ref.kind}-${ref.id}`}
                            title={ref.name}
                            onClick={() => addReference(ref)}
                          >
                            <Layers size={12} />
                            <span>{ref.name}</span>
                          </button>
                        ))}
                        {event.attachments?.map((file) => (
                          <span
                            className="ai-message-file"
                            key={file.id}
                            title={`${file.name} · Temporary attachment: available for up to 24 hours; reattach after browser restart`}
                          >
                            <FileText size={12} />
                            <span>{file.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                </div>
              ))}
            {streamingText && (
              <div
                className="ai-message ai-message-streaming"
                aria-label="AI reply in progress"
                aria-live="off"
              >
                <AIMessage text={streamingText} groups={groups} />
              </div>
            )}
            {notice && (
              <p className="ai-save-notice" role="status">
                {notice}
              </p>
            )}
            {error && !unavailable && (
              <p className="ai-error" role="alert">
                {error}
                <StorageRecoveryAction message={error} />
              </p>
            )}
          </div>
          {busy && latestAction && (
            <div className="ai-current-action" role="status">
              {latestAction.text}
            </div>
          )}
          {resumable && !busy && (
            <button
              type="button"
              className="ai-retry"
              disabled={!aiConnected || unavailable}
              onClick={continueTask}
            >
              <Play size={14} /> Continue task
            </button>
          )}
          {!!sentFiles.length && (
            <div className="ai-sent-files">
              <details>
                <summary>
                  {sentFiles.length} temporary{' '}
                  {sentFiles.length === 1 ? 'file' : 'files'}
                </summary>
                <p className="ai-chat-history-note">
                  Available for up to 24 hours or until the browser closes.
                </p>
                {sentFiles.map((file) => (
                  <div
                    key={file.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      attachmentMenu(file);
                    }}
                  >
                    <span title={file.name}>{file.name}</span>
                    {file.kind === 'document' && (
                      <button
                        type="button"
                        disabled={changingChat || busy || attaching}
                        onClick={() => saveAttachment(file)}
                        title="Save to Personal Data"
                      >
                        <Save size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={changingChat || busy}
                      onClick={() => removeAttachment(file.id)}
                      aria-label={`Forget ${file.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={changingChat || busy}
                  onClick={async () => {
                    try {
                      await window.electron.ai.clearAttachments();
                      setSentFiles([]);
                      setAttachments([]);
                    } catch (reason) {
                      showError(reason as Error);
                    }
                  }}
                >
                  <Trash2 size={14} />
                  Forget files
                </button>
              </details>
            </div>
          )}
          <form
            className={`ai-composer${dragging ? ' ai-composer-dragging' : ''}`}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <AIWorkingTabsBadge
              tabs={workingTabs}
              activeTabId={activeTabId}
              onSelect={(id) => onFocusTab?.(id)}
            />
            {(blockedMention || blockedContext) && (
              <div className="ai-scope-notice">
                {blockedContext
                  ? 'Attached context is outside the selected group.'
                  : `@${blockedMention?.slug} is outside scope.`}
                <button
                  type="button"
                  disabled={changingChat || busy}
                  onClick={() => changeScope(contextScope)}
                >
                  {contextScope === 'all'
                    ? 'Use All groups'
                    : `Use ${
                        groups.find((group) => group.id === contextScope)
                          ?.name || 'attached group'
                      }`}
                </button>
              </div>
            )}
            {(!!attachments.length || !!contexts.length) && (
              <div
                className="ai-attachments"
                role="list"
                aria-label="Attached files and browser context"
              >
                {contexts.map((ref) => {
                  const item = contextTabs.find((tab) =>
                    ref.kind === 'group'
                      ? aiGroupId(tab) === ref.id
                      : tab.id === ref.id
                  );
                  return (
                    <div
                      className="ai-attachment ai-context-attachment"
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (ref.kind === 'group') onGroupContextMenu?.(ref.id);
                        else onTabContextMenu?.(ref.id);
                      }}
                      key={`${ref.kind}-${ref.id}`}
                      role="listitem"
                      aria-label={`${ref.kind === 'group' ? 'Group' : 'Tab'}: ${
                        ref.name
                      }`}
                      title={`${ref.name} · ${
                        ref.kind === 'group' ? `${ref.tabCount} tabs` : 'Tab'
                      } · Read on demand`}
                    >
                      {ref.kind === 'group' && item ? (
                        <GroupIcon item={item} tabs={contextTabs} />
                      ) : (
                        <AppIcon icon={ref.icon} title={ref.name} />
                      )}
                      <span className="ai-attachment-type">
                        {ref.kind === 'group' ? 'Group' : 'Tab'}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${ref.name} context`}
                        title={`Remove ${ref.name} context`}
                        disabled={changingChat || busy}
                        onClick={() =>
                          setContexts((previous) =>
                            previous.filter(
                              (entry) =>
                                entry.kind !== ref.kind || entry.id !== ref.id
                            )
                          )
                        }
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                {attachments.map((file) => (
                  <div
                    className="ai-attachment"
                    key={file.id}
                    data-attachment-id={file.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      attachmentMenu(file);
                    }}
                    role="listitem"
                    aria-label={file.name}
                    title={`${file.name} · ${Math.max(
                      1,
                      Math.round(file.size / 1024)
                    )} KB`}
                  >
                    {file.preview ? (
                      <img src={file.preview} alt="" />
                    ) : (
                      <FileText size={18} />
                    )}
                    {!file.preview && (
                      <span className="ai-attachment-type">
                        {file.name.split('.').pop()?.slice(0, 5).toUpperCase()}
                      </span>
                    )}
                    {file.kind === 'document' && (
                      <button
                        type="button"
                        className="ai-attachment-save"
                        disabled={changingChat || busy || attaching}
                        onClick={() => saveAttachment(file)}
                        aria-label={`Save ${file.name} to Personal Data`}
                        title="Save to Personal Data"
                      >
                        <Save size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      title={`Remove ${file.name}`}
                      disabled={changingChat || busy}
                      onClick={() => removeAttachment(file.id)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!!queue.messages.length && (
              <div className="ai-message-queue" aria-label="Queued messages">
                <div className="ai-message-queue-heading">
                  <span>
                    {queue.paused ? 'Queue paused' : 'Queued'} ·{' '}
                    {queue.messages.length}
                  </span>
                  {queue.paused && (
                    <button
                      type="button"
                      disabled={busy || resumable || changingChat}
                      onClick={() => changeQueue({ action: 'resume' })}
                    >
                      Send queued messages
                    </button>
                  )}
                </div>
                {queue.messages.map((message) => (
                  <div className="ai-message-queue-row" key={message.id}>
                    <span title={message.prompt}>{message.prompt}</span>
                    <button
                      type="button"
                      aria-label={`Remove queued message: ${message.prompt}`}
                      onClick={() =>
                        changeQueue({ action: 'remove', id: message.id })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={taskInput}
              onFocus={refreshSkills}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (files.length) {
                  event.preventDefault();
                  addFiles(files);
                }
              }}
              rows={3}
              aria-label="Task for AI"
              placeholder={
                (feedbackId && 'Reply to the question…') ||
                (busy && 'Write a message to queue…') ||
                'Ask anything, / for skills or files, @ for tabs…'
              }
              value={prompt}
              maxLength={12000}
              disabled={changingChat}
              onChange={(event) => {
                setSlashDismissed(false);
                setPrompt(event.target.value);
                setCursor(event.target.selectionStart);
                setMentionIndex(0);
              }}
              onSelect={(event) =>
                setCursor(event.currentTarget.selectionStart)
              }
              aria-controls={
                skillSuggestions.length
                  ? 'ai-skill-commands'
                  : (suggestions.length && 'ai-mentions') || undefined
              }
              aria-activedescendant={
                skillSuggestions.length
                  ? `ai-skill-command-${mentionIndex}`
                  : (suggestions.length && `ai-mention-${mentionIndex}`) ||
                    undefined
              }
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (
                  slash &&
                  projectFiles.loading &&
                  !skillSuggestions.length &&
                  !event.shiftKey &&
                  ['Enter', 'Tab'].includes(event.key)
                ) {
                  event.preventDefault();
                  return;
                }
                if (
                  skillSuggestions.length &&
                  !event.shiftKey &&
                  ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key)
                ) {
                  event.preventDefault();
                  if (event.key === 'Enter' || event.key === 'Tab')
                    insertSkill(
                      (skillSuggestions[mentionIndex] || skillSuggestions[0])
                        .command
                    );
                  else
                    setMentionIndex(
                      (previous) =>
                        (previous +
                          (event.key === 'ArrowDown'
                            ? 1
                            : skillSuggestions.length - 1)) %
                        skillSuggestions.length
                    );
                  return;
                }
                if (
                  suggestions.length &&
                  ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(
                    event.key
                  ) &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  if (event.key === 'Enter' || event.key === 'Tab')
                    insertMention(
                      suggestions[mentionIndex]?.reference ||
                        suggestions[0].reference
                    );
                  else
                    setMentionIndex(
                      (previous) =>
                        (previous +
                          (event.key === 'ArrowDown'
                            ? 1
                            : suggestions.length - 1)) %
                        suggestions.length
                    );
                  return;
                }
                if (event.key === 'Escape') {
                  setSlashDismissed(true);
                  setCursor(0);
                  return;
                }
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            {!!referenceGroups.length && (
              <div className="ai-draft-references">
                {referenceGroups.map((group) => (
                  <AIReferencePicker
                    key={group.id}
                    group={group}
                    disabled={changingChat || busy}
                    onAdd={addReference}
                    onTabContextMenu={onTabContextMenu}
                    onGroupContextMenu={onGroupContextMenu}
                  />
                ))}
              </div>
            )}
            {!!(skillSuggestions.length || suggestions.length || slash) && (
              <AIComposerSuggestions
                input={taskInput}
                cursor={cursor}
                value={prompt}
                selectedIndex={mentionIndex}
              >
                {slash && projectFiles.loading && (
                  <small className="ai-context-notice">
                    Finding project files…
                  </small>
                )}
                {slash && !projectFiles.loading && !skillSuggestions.length && (
                  <small className="ai-context-notice" role="status">
                    {slash[1]
                      ? 'No matching skills or project files. Try a name or folder path.'
                      : 'No skills or project files available. Enable a skill in AI settings, or choose a group with a linked project folder.'}
                  </small>
                )}
                {!!skillSuggestions.length && (
                  <div
                    className="ai-mentions"
                    id="ai-skill-commands"
                    role="listbox"
                    aria-label="Skills and project files"
                  >
                    {skillSuggestions.map((skill, index) => (
                      <button
                        type="button"
                        role="option"
                        id={`ai-skill-command-${index}`}
                        aria-selected={index === mentionIndex}
                        key={skill.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertSkill(skill.command)}
                      >
                        {skill.kind === 'skill' ? (
                          <Sparkles size={14} />
                        ) : (
                          <FileText size={14} />
                        )}
                        <span>
                          <strong>{skill.command}</strong>
                          <small>{skill.description || skill.name}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!!suggestions.length && (
                  <div
                    className="ai-mentions"
                    id="ai-mentions"
                    role="listbox"
                    aria-label="Group and page references"
                  >
                    {suggestions.map((item, index) => (
                      <button
                        type="button"
                        role="option"
                        id={`ai-mention-${index}`}
                        aria-selected={index === mentionIndex}
                        key={item.reference}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertMention(item.reference)}
                      >
                        {item.kind === 'group' &&
                        contextTabs.find(
                          (tab) => aiGroupId(tab) === item.id
                        ) ? (
                          <GroupIcon
                            item={
                              contextTabs.find(
                                (tab) => aiGroupId(tab) === item.id
                              )!
                            }
                            tabs={contextTabs}
                          />
                        ) : (
                          <AppIcon icon={item.icon || ''} title={item.name} />
                        )}
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.detail}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </AIComposerSuggestions>
            )}
            <div className="ai-composer-controls">
              <AIContextPicker
                groups={groups}
                tabs={contextTabs}
                activeTabId={focusedTabId || activeTabId}
                disabled={busy || attaching || unavailable || changingChat}
                filesDisabled={attachments.length >= AI_ATTACHMENT_LIMIT}
                onAttach={(reference) => addContext(JSON.stringify(reference))}
                onFiles={pickAttachments}
              />
              <div className="ai-context-pickers">
                <GroupPicker
                  label="AI permissions"
                  triggerClassName="ai-access-picker"
                  contentClassName="ai-access-popover"
                  searchable={false}
                  triggerContent={<ShieldCheck size={15} />}
                  optionIcon={accessIcon}
                  placeholder="Search access modes…"
                  disabled={
                    changingChat ||
                    busy ||
                    !!queue.messages.length ||
                    unavailable
                  }
                  options={AI_ACCESS_MODES.map((mode) => ({
                    id: mode.id,
                    name: `${mode.name}${
                      permissions.taskOnly &&
                      permissions.effectiveMode === mode.id
                        ? ' · Task'
                        : ''
                    }`,
                    detail: {
                      ask: 'Review every action',
                      standard: 'Read freely, review interactions',
                      full: 'Approve supported actions in scope',
                    }[mode.id],
                    hint: mode.detail,
                  }))}
                  value={permissions.effectiveMode}
                  onChange={changePermissions}
                />

                <GroupPicker
                  label="AI scope"
                  onContextMenu={onGroupContextMenu}
                  triggerClassName="ai-group-picker"
                  placeholder="Search groups…"
                  disabled={
                    changingChat ||
                    busy ||
                    !!queue.messages.length ||
                    unavailable ||
                    !!external?.paused
                  }
                  options={[
                    {
                      id: 'all',
                      name: 'All groups',
                      leadingIcon: <Layers size={14} />,
                    },
                    ...groups.map((group) => ({
                      id: group.id,
                      name: group.name,
                      detail: `@${group.slug}`,
                      icon: group.tabs[0]?.icon,
                    })),
                  ]}
                  value={groupId ?? 'all'}
                  onChange={changeScope}
                />
              </div>
              {aiConnected && (
                <GroupPicker
                  label="AI model"
                  triggerClassName="ai-model-picker"
                  contentClassName="ai-model-popover"
                  optionIcon={noPickerIcon}
                  placeholder="Search models or enter ID…"
                  allowCustom
                  disabled={
                    changingChat ||
                    busy ||
                    !!queue.messages.length ||
                    unavailable
                  }
                  options={[...new Set([settings.model, ...models])].map(
                    (model) => ({
                      id: model,
                      name: model.replace(/^models\//, ''),
                    })
                  )}
                  value={settings.model}
                  onChange={changeModel}
                  triggerDetail={
                    thinkingChoices.length > 1
                      ? selectedThinking.name.replace('Thinking: ', '')
                      : undefined
                  }
                  footer={
                    thinkingChoices.length > 1 && (
                      <AIThinkingSlider
                        key={`${settings.endpoint}:${settings.model}`}
                        options={thinkingChoices}
                        value={selectedThinking.id}
                        disabled={
                          changingChat ||
                          busy ||
                          !!queue.messages.length ||
                          unavailable
                        }
                        onChange={changeThinking}
                      />
                    )
                  }
                />
              )}
              <span className="ai-composer-state" role="status">
                {attaching && 'Adding…'}
                {!attaching &&
                  busy &&
                  (feedbackId ? 'Waiting for your reply…' : 'Working…')}
              </span>
              {busy && !feedbackId ? (
                <button
                  type="button"
                  className="ai-send-button"
                  aria-label="Stop AI task"
                  title="Stop AI task"
                  onClick={() =>
                    window.electron.ai
                      .stop()
                      .catch((reason) => setError(reason.message))
                  }
                >
                  <Square size={14} />
                </button>
              ) : null}
              <button
                type="submit"
                className="ai-send-button"
                title={
                  feedbackId
                    ? 'Send reply'
                    : busy
                    ? 'Queue message'
                    : 'Send task'
                }
                disabled={
                  changingChat ||
                  (!feedbackId && !aiConnected) ||
                  (!prompt.trim() && !attachments.length && !contexts.length) ||
                  attaching ||
                  (!feedbackId && unavailable) ||
                  (!feedbackId && !!blockedMention) ||
                  (!feedbackId && blockedContext)
                }
                aria-label={
                  feedbackId
                    ? 'Send reply'
                    : busy
                    ? 'Queue message'
                    : 'Send AI task'
                }
              >
                <ArrowUp size={17} />
              </button>
            </div>
          </form>
        </div>
      </AssistantPanelHost>
      {chatState?.undoDeletion && (
        <div className="ai-chat-undo-fab" role="status">
          <span>Chat deleted</span>
          <button
            type="button"
            disabled={changingChat || busy || attaching}
            onClick={() =>
              changeChat({
                action: 'undo-delete',
                id: chatState.undoDeletion!.id,
              })
            }
          >
            Undo
          </button>
        </div>
      )}
      <div className="ai-overlay-layer" ref={setOverlayContainer} />
    </aside>
  );
}
