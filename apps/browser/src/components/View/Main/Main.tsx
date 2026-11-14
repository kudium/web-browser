import { resolveAppTheme, appThemeStyle } from '../../../utils/appTheme';
import { SpaceThemeContext } from '../../../utils/spaceTheme';
import { websiteThemeStyle } from '../../../utils/websiteTheme';
import { BrowserOptionsMenu } from '../../UI/BrowserOptionsMenu';
import {
  CSSProperties,
  useContext,
  useCallback,
  DragEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Dialog,
  Heading,
  IconButton,
  Popover,
  Text,
  TextField,
  Tooltip,
} from '@radix-ui/themes';
import {
  LockKeyhole,
  Library,
  FolderPlus,
  ArrowLeft,
  ArrowRight,
  Volume2,
  VolumeX,
  Play,
  Code2,
  StickyNote,
  Bell,
  Brush,
  ArrowDownToLine,
  ChevronDown,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCw,
  Sparkles,
  MessageCircle,
  Square,
  X,
} from 'lucide-react';
import { HorizontalTabList } from '../../UI/HorizontalTabList';
import { FindBar } from '../../UI/FindBar';
import { useSidebarPaneToggle } from '../../../utils/hooks/useSidebarPaneToggle';
import { useArchiveRetention } from '../../../utils/hooks/useArchiveRetention';
import { Archive } from '../Settings/tabs/Archive';
import { spaceFooterMenu } from '../../../browser/spaceFooterMenu';
import { StorageRecoveryBanner } from '../../UI/StorageRecoveryBanner';
import { AppUpdateBanner } from '../../UI/AppUpdateBanner';
import { SpaceSettingsForm } from '../../UI/SpaceSettingsForm';
import { EmptySpaceWelcome } from '../../UI/EmptySpaceWelcome';
import { BrowserWelcome } from '../../UI/BrowserWelcome';
import { AccountSyncPublisher } from '../../UI/AccountSyncPublisher';
import { BrowserImportSuggestion } from '../../UI/BrowserImportSuggestion';
import { FirstGroupSyncSuggestion } from '../../UI/FirstGroupSyncSuggestion';
import { TabSwitcher } from '../../UI/TabSwitcher';
import { useTabSwitcher } from '../../../utils/hooks/useTabSwitcher';
import { useNativeOverlay } from '../../../utils/hooks/useNativeOverlay';
import {
  groupAccessAction,
  lockedGroup,
  useGroupAccess,
} from '../../../utils/groupAccess';
import { GroupAccessGate } from '../../UI/GroupAccessGate';
import {
  personalDataScope,
  groupKey,
  loginProfileKey,
  tabGroups as getTabGroups,
  groupTabs,
  newGroupName,
} from '../../../utils/groups';
import {
  OPEN_TERMINAL_LINK,
  terminalLinkTab,
} from '../../../browser/terminalLinks';
import { commandDestination } from '../../../utils/commandNavigation';
import {
  rememberGroupTab,
  rememberedGroupTab,
} from '../../../browser/groupFocus';
import { aiGroupId } from '../../../browser/aiGroups';
import type { DownloadRecord } from '../../../browser/downloads';
import type { AIContextReference } from '../../../browser/aiContext';
import { AI_CONTEXT_MIME } from '../../../browser/aiContext';
import { nextGroupTab, insertTabAfter } from '../../../utils/tabNeighbors';
import {
  validTabDefaultURL,
  savedNavigationURL,
} from '../../../browser/tabDefaults';
import { AISidebar } from '../../UI/AISidebar';
import { hasFloatingAssistantPanels } from '../../../utils/assistantPanelPlacement';
import { ChromeIconButton } from '../../UI/ChromeIconButton';
import { PictureInPictureButton } from '../../UI/PictureInPictureButton';
import { useCollapsedItems } from '../../../utils/useCollapsedItems';
import { CollectionIcon } from '../../UI/CollectionIcon';
import { folderLinks, moveFolder } from '../../../utils/folderActions';
import {
  hasStorageRecovery,
  recoveryData,
} from '../../../utils/storageRecovery';
import { AddressBar } from '../../UI/AddressBar';
import { AnchoredTabPreview } from '../../UI/AnchoredTabPreview';
import { BrowserCaptureImage } from '../../UI/BrowserCaptureImage';
import { useAnchoredPreview } from '../../../utils/useAnchoredPreview';
import {
  DOWNLOADS_PAGE,
  HISTORY_PAGE,
  ARCHIVE_PAGE,
  adjacentSidebarPage,
} from '../../../utils/sidebarNavigation';
import { SidebarPager } from '../../UI/SidebarPager';
import {
  moveGroupToFolder,
  removeGroupFolder,
} from '../../../utils/sessionFolders';
import { nativeMenuLabels } from '../../../browser/menuLabels';
import {
  SplitView,
  SplitSide,
  selectSplitTab,
  repairSplitView,
} from '../../../utils/splitView';
import { SpaceIcon } from '../../UI/SpaceIcon';
import type { SpaceIconName } from '../../../utils/SpaceManager';
import {
  NativeContextMenu as ContextMenu,
  showNativeContextMenu,
} from '../../UI/NativeContextMenu';
import {
  SidebarResizeHandle,
  savedSidebarWidth,
} from '../../UI/SidebarResizeHandle';
import { browser } from '../../../browser/client';
import { History } from '../Downloads/History';
import { Downloads } from '../Downloads/Downloads';
import { smartTabLabels } from '../../../utils/smartTabLabels';
import { GroupIcon } from '../../UI/GroupIcon';
import { GroupPicker } from '../../UI/GroupPicker';
import { SpaceDownloadsButton } from '../../UI/SpaceDownloadsButton';
import { SidebarFileDropHint } from '../../UI/SidebarFileDropHint';
import type { SidebarDropResult } from '../../../browser/sidebarDrop';
import { GroupEditor } from '../../UI/GroupEditor';
import { PanelDialogHeader } from '../../UI/PanelDialog';
import { PageStatus } from '../../UI/PageStatus';
import { PageLoading, LoadingIcon } from '../../UI/PageLoading';
import { SiteSettingsDialog } from '../../UI/SiteSettingsDialog';
import { PageCaptureDialog } from '../../UI/PageCaptureDialog';
import type { PageCaptureMode } from '../../../browser/pageCapture';
import { ExtensionToolbar } from '../../../browser/ExtensionToolbar';
import { resolveAddress } from '../../../utils/navigation';
import {
  moveTab,
  reorderTabs,
  moveGroupToSection,
  SidebarSection,
} from '../../../utils/tabMoves';
import { InlineTabName } from '../../UI/InlineTabName';
import { CommandPalette } from '../../UI/CommandPalette';
import {
  SpaceManager,
  useSpaces,
  SpaceColor,
} from '../../../utils/SpaceManager';
import { AppIcon } from '../../UI/AppIcon/AppIcon';
import { useAppList } from '../../../utils/hooks/useAppList';
import { AppManager, ScreenManager } from '../../../utils/AppManager';
import { WINDOW_DRAG_MIME } from '../../../browser/windows';
import { windowWorkspace } from '../../../utils/windowWorkspace';
import { BrowserSnapshot, BrowserState, IApp } from '../../../types';
import { eventBus } from '../../../utils/EventBus';
import { EVENT_KEY } from '../../../utils/constant';

import { useAIPagePreference } from '../../../utils/useAIPagePreference';

export function Main() {
  const groupAccess = useGroupAccess();
  useArchiveRetention();
  const [aiActivityTab, setAIActivityTab] = useState<string>();
  const [aiWorkingTabIds, setAIWorkingTabIds] = useState<string[]>([]);
  useEffect(() => {
    let activityReceived = false;
    window.electron.ai
      .taskStatus()
      .then((status) => {
        if (!activityReceived) {
          setAIActivityTab(status.activeTabId);
          setAIWorkingTabIds(status.workingTabIds || []);
        }
        return undefined;
      })
      .catch(() => {});
    return window.electron.ai.onEvent((event) => {
      if (event.type === 'activity') {
        activityReceived = true;
        setAIActivityTab(event.active ? event.tabId : undefined);
        setAIWorkingTabIds(event.workingTabIds || []);
      }
    });
  }, []);
  const [aiContextRequest, setAIContextRequest] = useState<{
    reference: AIContextReference;
    mode?: 'scope';
    token: number;
  }>();
  const [aiOpen, setAIOpen] = useAIPagePreference('open', false);
  const [aiPane, setAIPane] = useAIPagePreference('pane', 'assistant');

  const [aiMounted, setAIMounted] = useState(
    () => aiOpen || hasFloatingAssistantPanels()
  );
  const [unreadNotes, setUnreadNotes] = useState(0);
  const [unreadActivity, setUnreadActivity] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      window.electron
        .activity?.({ action: 'list' })
        .then((entries) => {
          if (active)
            setUnreadActivity(
              (entries || []).filter((entry) => !entry.asRead).length
            );
        })
        .catch(() => {});
    refresh();
    const stop = window.electron.onActivityChanged?.(refresh);
    const open = () => {
      setAIMounted(true);
      setAIOpen(true);
      setMenuPaneRequest((previous) => ({
        pane: 'activity',
        token: (previous?.token || 0) + 1,
      }));
    };
    window.addEventListener('kudiumbrowser-open-activity', open);
    return () => {
      active = false;
      stop?.();
      window.removeEventListener('kudiumbrowser-open-activity', open);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      window.electron
        .passwordManager({ action: 'notes' })
        .then((result) => {
          if (active)
            setUnreadNotes(
              (
                result as import('../../../browser/passwordManager').VaultSummary[]
              ).filter((note) => note.asRead === false).length
            );
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 3000);
    const open = () => {
      setAIMounted(true);
      setAIOpen(true);
      setMenuPaneRequest((previous) => ({
        pane: 'notes',
        token: (previous?.token || 0) + 1,
      }));
    };
    window.addEventListener('kudiumbrowser-open-note', open);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('kudiumbrowser-open-note', open);
    };
  }, []);
  const [developerRequest, setDeveloperRequest] = useState(0);
  const [menuPaneRequest, setMenuPaneRequest] = useState<{
    pane: 'assistant' | 'tasks' | 'developer' | 'notes' | 'activity';
    token: number;
  }>();
  const toggleSidebarPane = useSidebarPaneToggle(
    aiOpen,
    aiPane,
    setAIOpen,
    setAIPane,
    setAIMounted
  );
  const addToAI = (reference: AIContextReference, mode?: 'scope') => {
    setAIMounted(true);
    setAIOpen(true);
    setAIContextRequest((previous) => ({
      reference,
      mode,
      token: (previous?.token || 0) + 1,
    }));
  };
  const [aiWidth, setAIWidth] = useState(() => {
    const saved = Number(
      localStorage.getItem('kudiumbrowser-ai-sidebar-width')
    );
    return saved >= 240 && Number.isFinite(saved) ? Math.min(saved, 1200) : 368;
  });
  const [aiResizing, setAIResizing] = useState(false);
  const [bodyWidth, setBodyWidth] = useState(800);
  const body = useRef<HTMLDivElement>(null);
  const aiMaxWidth = Math.max(240, Math.min(1200, Math.floor(bodyWidth - 248)));
  const effectiveAIWidth = Math.min(aiWidth, aiMaxWidth);
  useEffect(() => {
    if (!aiResizing)
      localStorage.setItem('kudiumbrowser-ai-sidebar-width', String(aiWidth));
  }, [aiWidth, aiResizing]);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return undefined;
    const measure = () => setBodyWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const { appList, lastIndex } = useAppList();
  const aiWorkingTabs = appList.filter(
    (tab) => !tab.archived && aiWorkingTabIds.includes(tab.id)
  );
  const { spaces, active } = useSpaces();
  const [translucentChrome, setTranslucentChrome] = useState(true);
  const [translucentAI, setTranslucentAI] = useState(false);
  const [showExtensionIcons, setShowExtensionIcons] = useState(true);
  const [tabOverflowMode, setTabOverflowMode] = useState<'dropdown' | 'scroll'>(
    'scroll'
  );
  const [tabDisplayMode, setTabDisplayMode] = useState<
    'horizontal' | 'hover' | 'click'
  >('horizontal');
  const [folderHoverPreviews, setFolderHoverPreviews] = useState(true);
  const [showUnpinnedGroups, setShowUnpinnedGroups] = useState(false);
  const preview = useAnchoredPreview();
  const { target: previewTarget, close: closePreview } = preview;
  const [preferredAddressBarPlacement, setAddressBarPlacement] = useState<
    'sidebar' | 'header'
  >('sidebar');
  const [addressBarFullUrl, setAddressBarFullUrl] = useState(false);
  const [autofillExcludedSites, setAutofillExcludedSites] = useState<string[]>([]);
  const [addressBarExtensionsExpanded, setAddressBarExtensionsExpanded] =
    useState(false);
  const [extensionToolbarOrder, setExtensionToolbarOrder] = useState<
    string[] | null
  >(null);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [recoveryCopyStatus, setRecoveryCopyStatus] =
    useState('Copy recovery data');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteGroup, setPaletteGroup] = useState<IApp>();
  useEffect(() => {
    if (paletteOpen) window.electron?.telemetry?.feature('command_opened');
  }, [paletteOpen]);
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [editingSpace, setEditingSpace] = useState<string>();
  const [collapsedSpaces, setCollapsedSpaces] = useCollapsedItems(
    'kudiumbrowser-collapsed-spaces'
  );
  const [spaceName, setSpaceName] = useState('');
  const [spaceIcon, setSpaceIcon] = useState<SpaceIconName>('layers');
  const [spaceIconImage, setSpaceIconImage] = useState('');
  const [spaceEmoji, setSpaceEmoji] = useState('');
  const [spaceCustomColor, setSpaceCustomColor] = useState('');
  const [spaceFrameTint, setSpaceFrameTint] = useState('');
  const [spaceUseWebsiteColors, setSpaceUseWebsiteColors] = useState(false);
  const [spaceColor, setSpaceColor] = useState<SpaceColor>('iris');
  const openCreateSpace = () => {
    setEditingSpace(undefined);
    setSpaceName('');
    setSpaceIcon('layers');
    setSpaceIconImage('');
    setSpaceEmoji('');
    setSpaceColor('iris');
    setSpaceCustomColor('');
    setSpaceFrameTint('');
    setSpaceUseWebsiteColors(false);
    setSpaceDialog(true);
  };
  const [favoriteRename, setFavoriteRename] = useState<IApp>();
  const [favoriteName, setFavoriteName] = useState('');
  const [folderDialog, setFolderDialog] = useState(false);
  const [deletingCollection, setDeletingCollection] = useState<{
    id: string;
    name: string;
    spaceId: string;
  }>();
  const [folderName, setFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<string>();

  const [folderFeedback, setFolderFeedback] = useState<{
    id: string;
    text: string;
  }>();
  const [collapsedFolders, setCollapsedFolders] = useCollapsedItems(
    'kudiumbrowser-collapsed-folders'
  );
  const favorites = useMemo(
    () =>
      appList.filter(
        (item, index, all) =>
          item.favorite &&
          !item.archived &&
          all.findIndex(
            (entry) =>
              entry.favorite &&
              !entry.archived &&
              groupKey(entry) === groupKey(item)
          ) === index
      ),
    [appList]
  );
  const spaceApps = useMemo(
    () =>
      appList.filter(
        (item) =>
          (item.spaceId || 'default') === active.id &&
          !item.archived &&
          !item.favorite
      ),
    [appList, active.id]
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(
    appList[Math.max(0, lastIndex)]?.id
  );
  const [split, setSplit] = useState<SplitView | null>(null);
  const [snapshots, setSnapshots] = useState<BrowserSnapshot[]>([]);
  const [windowMirrors, setWindowMirrors] = useState<BrowserSnapshot[]>([]);
  const windowDrag = useRef<{
    token: string;
    handled: boolean;
    cancelled: boolean;
  }>();
  const [states, setStates] = useState<Record<string, BrowserState>>({});
  useEffect(() => {
    setStates((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([id]) => {
          const item = AppManager.getBy('id', id);
          return item && !lockedGroup(item);
        })
      )
    );
  }, [groupAccess]);

  const [address, setAddress] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [smartLabelsEnabled, setSmartLabelsEnabled] = useState(true);
  const [editingGroup, setEditingGroup] = useState<IApp>();
  const [droppedProject, setDroppedProject] =
    useState<Extract<SidebarDropResult, { kind: 'project' }>>();
  const [fileDragging, setFileDragging] = useState(false);
  const [newGroupSpace, setNewGroupSpace] = useState<string>();
  const openNewGroup = useCallback((spaceId: string) => {
    setDroppedProject(undefined);
    setNewGroupSpace(spaceId);
    setEditingGroup({
      id: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      name: '',
      sessionName: '',
      url: 'about:blank',
      icon: '',
      spaceId,
      pinned: true,
    });
  }, []);
  const sidebarDropBusy = useRef(false);
  const [groupPersonalData, setGroupPersonalData] = useState(false);
  useEffect(() => setGroupPersonalData(false), [editingGroup?.id]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarBoundary, setSidebarBoundary] = useState<HTMLElement | null>(
    null
  );
  const [pageCapture, setPageCapture] = useState<{
    tabId: string;
    mode: PageCaptureMode;
  }>();
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false);
  const [extensionPickerOpen, setExtensionPickerOpen] = useState(false);
  const closeExtensionPicker = useCallback(
    () => setExtensionPickerOpen(false),
    []
  );
  const [dragged, setDragged] = useState<{
    id: string;
    axis: 'vertical' | 'horizontal';
  }>();
  const [dropTarget, setDropTarget] = useState<string>();
  const [moveMessage, setMoveMessage] = useState('');
  const [closedGroupUndo, setClosedGroupUndo] = useState<{
    kind: 'group' | 'tab';
    ids: string[];
    selectedId: string;
    name: string;
  }>();
  useEffect(() => {
    if (!closedGroupUndo) return undefined;
    const timer = setTimeout(() => setClosedGroupUndo(undefined), 10000);
    return () => clearTimeout(timer);
  }, [closedGroupUndo]);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    axis: 'vertical' | 'horizontal' | 'folder';
  }>();
  const [findOpen, setFindOpen] = useState(false);
  const [aiPromptRequest, setAIPromptRequest] = useState<{
    text: string;
    token: number;
    append?: boolean;
  }>();
  useEffect(
    () =>
      browser.onAISelection?.((text) => {
        setAIMounted(true);
        setAIOpen(true);
        setAIPane('assistant');
        setAIPromptRequest((previous) => ({
          text,
          append: true,
          token: (previous?.token || 0) + 1,
        }));
      }),
    [setAIOpen, setAIPane]
  );
  useEffect(
    () =>
      window.electron.siteDeveloper?.onAskAI?.((text) => {
        setAIMounted(true);
        setAIOpen(true);
        setAIPromptRequest((previous) => ({
          text,
          token: (previous?.token || 0) + 1,
        }));
      }),
    [setAIOpen]
  );
  useEffect(() => {
    const reference = (event: Event) => {
      const { detail } = event as CustomEvent;
      if (
        !detail ||
        typeof detail.sourceId !== 'string' ||
        typeof detail.path !== 'string' ||
        !detail.path ||
        detail.path.length > 4000
      )
        return;
      const source = AppManager.getAll().find(
        (tab) => tab.id === detail.sourceId && !tab.archived
      );
      if (!source || lockedGroup(source)) return;
      setAIMounted(true);
      setAIOpen(true);
      setAIContextRequest((previous) => ({
        reference: { kind: 'tab', id: source.id },
        token: (previous?.token || 0) + 1,
      }));
      setAIPromptRequest((previous) => ({
        text: `Help me edit the project file ${JSON.stringify(
          detail.path
        )} in the attached group’s linked folder. Read its current contents using project_files before making changes.\n\nMy changes: `,
        token: (previous?.token || 0) + 1,
      }));
    };
    window.addEventListener('kudiumbrowser-reference-project-file', reference);
    return () =>
      window.removeEventListener(
        'kudiumbrowser-reference-project-file',
        reference
      );
  }, [setAIOpen]);
  const [findValue, setFindValue] = useState('');
  const [libraryTab, setLibraryTab] = useState<
    'downloads' | 'history' | 'archive'
  >('downloads');
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecord[]>([]);
  useEffect(() => {
    let alive = true;
    let updated = false;
    const updateCount = (records: DownloadRecord[]) => {
      if (alive) {
        setDownloadRecords(records);
      }
    };
    const stop = browser.onDownloads((records) => {
      updated = true;
      updateCount(records);
    });
    browser
      .downloads('get')
      .then((records) => {
        if (!updated) updateCount(records);
        return null;
      })
      .catch(() => {});
    return () => {
      alive = false;
      stop();
    };
  }, []);
  const systemSpacesLabel = 'System spaces';
  const [compact, updateCompact] = useState(() => {
    try {
      return (
        localStorage.getItem('kudiumbrowser-sidebar-visible-mode') === 'compact'
      );
    } catch {
      return false;
    }
  });
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    try {
      return localStorage.getItem('kudiumbrowser-sidebar-hidden') === 'true';
    } catch {
      return false;
    }
  });
  const addressBarPlacement =
    sidebarHidden || compact ? 'header' : preferredAddressBarPlacement;
  const setCompact = useCallback((value: boolean) => {
    updateCompact(value);
    setSidebarHidden(false);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        'kudiumbrowser-sidebar-visible-mode',
        compact ? 'compact' : 'expanded'
      );
      localStorage.setItem(
        'kudiumbrowser-sidebar-hidden',
        String(sidebarHidden)
      );
    } catch {
      /* Keep layout usable when storage is unavailable. */
    }
  }, [compact, sidebarHidden]);
  const [sidebarDirection, setSidebarDirection] = useState(1);
  const libraryPages = {
    downloads: DOWNLOADS_PAGE,
    history: HISTORY_PAGE,
    archive: ARCHIVE_PAGE,
  };
  const libraryPage = libraryPages[libraryTab];
  const sidebarPage = downloadsOpen ? libraryPage : active.id;
  const sidebarPages = useMemo(
    () => [
      DOWNLOADS_PAGE,
      HISTORY_PAGE,
      ARCHIVE_PAGE,
      ...spaces.map((space) => space.id),
    ],
    [spaces]
  );
  const activateSidebarPage = useCallback(
    (page: string) => {
      setSidebarDirection(
        sidebarPages.indexOf(page) >= sidebarPages.indexOf(sidebarPage) ? 1 : -1
      );
      setCompact(false);
      if (
        page === DOWNLOADS_PAGE ||
        page === HISTORY_PAGE ||
        page === ARCHIVE_PAGE
      ) {
        let nextLibraryTab: typeof libraryTab = 'archive';
        if (page === DOWNLOADS_PAGE) nextLibraryTab = 'downloads';
        else if (page === HISTORY_PAGE) nextLibraryTab = 'history';
        setLibraryTab(nextLibraryTab);
        setDownloadsOpen(true);
      } else {
        setDownloadsOpen(false);
        SpaceManager.select(page);
      }
    },
    [sidebarPages, sidebarPage, setCompact]
  );
  const showSystemMenu = async () => {
    const choice = await browser.nativeMenu([
      { id: 'downloads', label: 'Downloads' },
      { id: 'history', label: 'History' },
      { id: 'archive', label: 'Archive' },
      { type: 'separator' },
      { id: 'browse', label: 'Return to browsing', enabled: downloadsOpen },
      { id: 'new-tab', label: 'New tab or group' },
      { id: 'new-space', label: 'Create space…' },
      { id: 'settings', label: 'Settings…' },
    ]);
    if (choice === 'downloads') activateSidebarPage(DOWNLOADS_PAGE);
    if (choice === 'history') activateSidebarPage(HISTORY_PAGE);
    if (choice === 'archive') activateSidebarPage(ARCHIVE_PAGE);
    if (choice === 'browse') activateSidebarPage(active.id);
    if (choice === 'new-tab') setPaletteOpen(true);
    if (choice === 'new-space') openCreateSpace();
    if (choice === 'settings') browser.preferences('open');
  };
  const swipeSidebar = useCallback(
    (direction: number) => {
      activateSidebarPage(
        adjacentSidebarPage(sidebarPages, sidebarPage, direction)
      );
      setSidebarDirection(direction);
    },
    [activateSidebarPage, sidebarPages, sidebarPage]
  );
  const [sidebarWidth, setSidebarWidth] = useState(savedSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  useEffect(() => {
    if (!sidebarResizing)
      localStorage.setItem('kudiumbrowser-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth, sidebarResizing]);
  const viewport = useRef<HTMLDivElement>(null);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [closedTabs, setClosedTabs] = useState<Set<string>>(() => new Set());
  const availableTabs = appList.filter(
    (item) => !closedGroups.has(aiGroupId(item)) && !closedTabs.has(item.id)
  );
  const selected =
    availableTabs.find(
      (item) =>
        item.id === selectedId &&
        !item.archived &&
        ((item.spaceId || 'default') === active.id || item.favorite)
    ) ||
    nextGroupTab(availableTabs, selectedId) ||
    spaceApps.find(
      (item) => !closedGroups.has(aiGroupId(item)) && !closedTabs.has(item.id)
    ) ||
    favorites.find(
      (item) => !closedGroups.has(aiGroupId(item)) && !closedTabs.has(item.id)
    );
  const externalSource = useRef(selected);
  externalSource.current = selected;
  const tabGroups = useMemo(
    () => getTabGroups(appList, active.id),
    [appList, active.id]
  );
  const previewIndex = useMemo(() => {
    const byId = new Map<string, IApp>();
    const tabs = new Map<string, IApp[]>();
    const folders = new Map<string, IApp[]>();
    appList.forEach((item) => {
      byId.set(item.id, item);
      if (item.archived) return;
      const key = `${item.spaceId || 'default'}:${groupKey(item)}`;
      const group = tabs.get(key) || [];
      group.push(item);
      tabs.set(key, group);
    });
    tabGroups.forEach((item) => {
      if (!item.folderId) return;
      const group = folders.get(item.folderId) || [];
      group.push(item);
      folders.set(item.folderId, group);
    });
    return { byId, tabs, folders };
  }, [appList, tabGroups]);
  const tabsForPreview = (item: IApp) =>
    previewIndex.tabs.get(`${item.spaceId || 'default'}:${groupKey(item)}`) ||
    [];
  const previewItems = useMemo(() => {
    const target = previewTarget;
    if (!target) return [];
    if (target.kind === 'folder')
      return previewIndex.folders.get(target.id) || [];
    const item = previewIndex.byId.get(target.id);
    return item
      ? previewIndex.tabs.get(
          `${item.spaceId || 'default'}:${groupKey(item)}`
        ) || []
      : [];
  }, [previewTarget, previewIndex]);
  const previewEntries = useMemo(
    () =>
      previewItems
        .filter(
          (item) =>
            preview.target?.kind === 'folder' || !lockedGroup(item, groupAccess)
        )
        .map((item) => ({
          id: item.id,
          title:
            preview.target?.kind === 'folder'
              ? item.sessionName || item.name
              : item.customName || item.name,
          detail:
            preview.target?.kind === 'folder'
              ? `${
                  (
                    previewIndex.tabs.get(
                      `${item.spaceId || 'default'}:${groupKey(item)}`
                    ) || []
                  ).length
                } tabs`
              : item.url,
          group: preview.target?.kind === 'folder' ? item : undefined,
          icon:
            preview.target?.kind === 'folder'
              ? item.sessionIconImage || item.icon
              : item.icon,
        })),
    [previewItems, preview.target?.kind, previewIndex, groupAccess]
  );
  useEffect(() => {
    if (
      previewTarget &&
      (!previewTarget.anchor.isConnected ||
        !previewItems.length ||
        (previewTarget.kind === 'session' && previewItems.length < 1))
    )
      closePreview();
  }, [previewTarget, previewItems, closePreview]);
  useEffect(
    () => closePreview(),
    [active.id, tabDisplayMode, folderHoverPreviews, closePreview]
  );
  const activeGroupTabs = useMemo(
    () => (selected ? groupTabs(appList, selected) : []),
    [appList, selected]
  );
  useEffect(() => {
    const scrollTabs = (event: WheelEvent) => {
      if (event.ctrlKey || !(event.target instanceof Element)) return;
      const list = event.target.closest<HTMLElement>('.horizontal-tabs');
      if (!list || list.scrollWidth <= list.clientWidth) return;
      if (list.dataset.overflow === 'dropdown') {
        event.preventDefault();
        return;
      }
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      const scale =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
          ? list.clientWidth
          : 1;
      event.preventDefault();
      event.stopPropagation();
      list.scrollLeft = Math.max(
        0,
        Math.min(
          list.scrollWidth - list.clientWidth,
          list.scrollLeft + delta * scale
        )
      );
    };
    document.addEventListener('wheel', scrollTabs, { passive: false });
    return () => document.removeEventListener('wheel', scrollTabs);
  }, []);
  useEffect(() => {
    const ids = split
      ? [`left-${split.left}`, `right-${split.right}`]
      : [selected?.id];
    const observers: ResizeObserver[] = [];
    ids.forEach((id) => {
      const tab = id
        ? document.getElementById(`page-tab-${id}`)?.closest('.horizontal-tab')
        : null;
      if (!tab || tabOverflowMode === 'dropdown') return;
      const reveal = () =>
        tab.scrollIntoView?.({
          block: 'nearest',
          inline: 'nearest',
        });
      reveal();
      const list = tab.closest('.horizontal-tabs');
      if (list) {
        const observer = new ResizeObserver(reveal);
        observer.observe(list);
        observers.push(observer);
      }
    });
    return () => observers.forEach((observer) => observer.disconnect());
  }, [selected?.id, split, activeGroupTabs.length, tabOverflowMode]);
  const select = useCallback(
    (item: IApp, side?: SplitSide) => {
      if (lockedGroup(item)) {
        groupAccessAction('unlock', item)
          .then(() => {
            if (!lockedGroup(item)) select(item, side);
            return undefined;
          })
          .catch((error) => setMoveMessage(String(error)));
        return;
      }
      setClosedTabs((previous) => {
        if (!previous.has(item.id)) return previous;
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
      setClosedGroups((previous) => {
        if (!previous.has(aiGroupId(item))) return previous;
        const next = new Set(previous);
        next.delete(aiGroupId(item));
        return next;
      });
      setSplit((previous) =>
        previous ? selectSplitTab(previous, item.id, side) : null
      );
      window.electron?.telemetry?.feature('tab_selected');
      setSelectedId(item.id);
      rememberGroupTab(item);
      ScreenManager.saveLastAppUrl(item.url);
      ScreenManager.saveLastAppId(item.id);
      const destination = item.favorite ? active.id : item.spaceId || 'default';
      SpaceManager.update(destination, { selectedAppId: item.id });
      if (destination !== active.id) SpaceManager.select(destination);
    },
    [active.id]
  );
  useEffect(() => {
    if (
      selected &&
      selected.id !== selectedId &&
      // A restore can select its ID before the subscribed list has rendered.
      // Consult the authoritative list so the old archived snapshot cannot
      // replace that selection with a neighboring tab.
      AppManager.getAll().some((tab) => tab.id === selectedId && tab.archived)
    ) {
      select(selected);
    }
  }, [appList, selected, selectedId, select]);
  const applySpaceMenuChoice = async (choice: string, target = active) => {
    if (choice && ['icon', 'rename', 'color', 'manage'].includes(choice)) {
      setEditingSpace(target.id);
      setSpaceName(target.name);
      setSpaceIcon(target.icon || 'layers');
      setSpaceIconImage(target.iconImage || '');
      setSpaceEmoji(target.iconEmoji || '');
      setSpaceUseWebsiteColors(target.useWebsiteColors === true);
      setSpaceColor(target.color);
      setSpaceCustomColor(target.customColor || '');
      setSpaceFrameTint(target.frameColor || '');
      setSpaceDialog(true);
    }
    if (choice === 'import-group') {
      const imported = await window.electron.siteDeveloper.transfer(
        'import',
        target.id
      );
      if (imported) {
        AppManager.set([...AppManager.getAll(), ...imported.tabs]);
        const first = imported.tabs[0];
        select(first);
        setEditingGroup(first);
        if (imported.reviewHooks)
          window.dispatchEvent(
            new CustomEvent('kudiumbrowser-open-group-developer', {
              detail: first.id,
            })
          );
      }
    }
    if (choice === 'new-group') openNewGroup(target.id);
    if (choice === 'new-tab') setPaletteOpen(true);
    if (choice === 'sort')
      AppManager.set(
        [...appList].sort((a, b) =>
          (a.sessionName || a.name).localeCompare(b.sessionName || b.name)
        )
      );
    if (choice === 'archive')
      AppManager.set(
        appList.map((item) =>
          !item.favorite &&
          item.pinned === false &&
          (item.spaceId || 'default') === target.id
            ? { ...item, archived: true }
            : item
        )
      );
    if (choice === 'folder') {
      setEditingFolder(undefined);
      setFolderName('');
      setFolderDialog(true);
    }
    if (choice === 'create') openCreateSpace();
    if (choice === 'delete' && spaces.length > 1) {
      if (
        await browser.confirm({
          message: `Delete “${target.name}”?`,
          detail:
            'Apps and tabs will move to another space. Their groups stay intact.',
          confirm: 'Delete space',
        })
      )
        SpaceManager.remove(target.id);
    }
  };
  const showSpaceMenu = async () => {
    const choice = await browser.nativeMenu([
      { id: 'new-tab', label: 'New Tab…' },
      { id: 'new-group', label: 'Create Group…' },
      { id: 'import-group', label: 'Import Group…' },
      { id: 'folder', label: 'New Collection' },
      { id: 'sort', label: 'Sort Groups by Name' },
      {
        id: 'archive',
        label: 'Archive Unpinned Groups',
        enabled:
          (showUnpinnedGroups ||
            windowWorkspace.state()?.kind === 'temporary') &&
          appList.some(
            (item) =>
              !item.archived &&
              (item.spaceId || 'default') === active.id &&
              item.pinned === false &&
              !item.favorite
          ),
      },
      { id: 'create', label: 'New Space…' },
      { id: 'manage', label: 'Manage Space…' },
      { type: 'separator' },
      { id: 'delete', label: 'Delete Space…', enabled: spaces.length > 1 },
    ]);
    if (choice) await applySpaceMenuChoice(choice);
  };
  const showFooterMenu = async (spaceId?: string) => {
    const target = spaces.find((space) => space.id === spaceId) || active;
    const choice = await browser.nativeMenu(
      spaceFooterMenu(spaces, sidebarPage, compact)
    );
    if (!choice) return;
    if (choice.startsWith('space:')) {
      const id = choice.slice('space:'.length);
      if (spaces.some((space) => space.id === id)) activateSidebarPage(id);
    } else if (choice === 'system:downloads')
      activateSidebarPage(DOWNLOADS_PAGE);
    else if (choice === 'system:history') activateSidebarPage(HISTORY_PAGE);
    else if (choice === 'system:archive') activateSidebarPage(ARCHIVE_PAGE);
    else if (choice === 'sidebar-mode') setCompact(!compact);
    else if (choice === 'sidebar-hide') setSidebarHidden(true);
    else if (choice === 'settings') await browser.preferences('open');
    else {
      if (['new-tab', 'new-group', 'folder', 'import-group'].includes(choice))
        activateSidebarPage(target.id);
      await applySpaceMenuChoice(choice, target);
    }
  };
  const closePageTab = useCallback((item: IApp) => {
    const current = AppManager.getBy('id', item.id);
    if (!current || current.archived) return;
    AppManager.update('id', current.id, { ...current, archived: true });
    setClosedGroupUndo({
      kind: 'tab',
      ids: [current.id],
      selectedId: current.id,
      name: current.customName || current.name,
    });
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          '.horizontal-tab.active .horizontal-tab-select'
        )
        ?.focus();
    });
  }, []);
  const selectGroup = useCallback(
    (item: IApp) => select(rememberedGroupTab(appList, item)),
    [appList, select]
  );

  useEffect(() => {
    if (selected) rememberGroupTab(selected);
  }, [selected]);
  const openGroupTab = (item: IApp, side?: SplitSide) => {
    if (lockedGroup(item)) return;
    setPaletteGroup(item);
    if (side) select(item, side);
    else selectGroup(item);
    preview.close();
    setPaletteOpen(true);
  };
  const switchableTabs = availableTabs.filter(
    (tab) =>
      !tab.archived &&
      !lockedGroup(tab) &&
      ((tab.spaceId || 'default') === active.id || tab.favorite)
  );
  const tabSwitcher = useTabSwitcher(
    switchableTabs,
    selected?.id,
    select,
    active.id
  );
  const tabSwitcherRef = useRef(tabSwitcher);
  tabSwitcherRef.current = tabSwitcher;
  const unloadPageTab = (item: IApp) => {
    tabSwitcherRef.current.remove([item.id]);
    setClosedTabs((previous) => new Set([...previous, item.id]));
    setSplit((previous) =>
      previous && [previous.left, previous.right].includes(item.id)
        ? null
        : previous
    );
    browser.command({ id: item.id, action: 'unload-tab' });
  };
  const tabSwitcherOpen = !!tabSwitcher.shown;
  useEffect(() => {
    if (tabSwitcherOpen) browser.command({ id: '', action: 'focus-chrome' });
  }, [tabSwitcherOpen]);
  useEffect(() => {
    const open = async (event: Event) => {
      const { detail } = event as CustomEvent;
      if (
        !detail ||
        typeof detail.sourceId !== 'string' ||
        typeof detail.path !== 'string'
      )
        return;
      const source = AppManager.getAll().find(
        (tab) => tab.id === detail.sourceId && !tab.archived
      );
      if (!source || lockedGroup(source)) return;
      try {
        const result = await window.electron.siteDeveloper.files(source.id, {
          action: 'open-tab',
          path: detail.path,
        });
        if (
          !result.url ||
          !AppManager.getAll().some(
            (tab) => tab.id === source.id && !tab.archived && !lockedGroup(tab)
          )
        )
          return;
        const destination = commandDestination(
          AppManager.getAll(),
          source,
          result.url,
          false,
          source.spaceId || active.id
        );
        const tab = destination.existing || destination.app;
        if (!tab) return;
        const item = {
          ...tab,
          name: detail.path.split(/[\\/]/).pop() || 'File',
        };
        if (!destination.existing) AppManager.add(item);
        select(item);
      } catch (reason) {
        setMoveMessage(String(reason));
      }
    };
    window.addEventListener('kudiumbrowser-open-project-file', open);
    return () =>
      window.removeEventListener('kudiumbrowser-open-project-file', open);
  }, [active.id, select]);
  useEffect(() => {
    const open = (event: Event) => {
      const { detail } = event as CustomEvent;
      if (
        !detail ||
        typeof detail.group !== 'string' ||
        typeof detail.url !== 'string'
      )
        return;
      const item = terminalLinkTab(
        AppManager.getAll(),
        detail.group,
        detail.url,
        active.id
      );
      if (!item || lockedGroup(item)) return;
      AppManager.add(item);
      select(item);
    };
    window.addEventListener(OPEN_TERMINAL_LINK, open);
    return () => window.removeEventListener(OPEN_TERMINAL_LINK, open);
  }, [active.id, select]);
  const openWhatsNew = (url: string) => {
    if (!selected || lockedGroup(selected)) return false;
    const item = commandDestination([], selected, url, false, selected.spaceId || active.id).app;
    if (!item) return false;
    AppManager.add(item);
    select(item);
    return true;
  };
  const nativeOverlayOpen = useNativeOverlay();
  const overlayOpen =
    !!tabSwitcher.shown ||
    nativeOverlayOpen ||
    !!editingGroup ||
    !!droppedProject ||
    !!newGroupSpace ||
    siteSettingsOpen ||
    !!pageCapture ||
    paletteOpen ||
    spaceDialog ||
    folderDialog ||
    !!favoriteRename ||
    sidebarResizing ||
    aiResizing ||
    !!dragged;
  const state = selected && states[selected.id];
  const spaceThemeColor = split
    ? states[split[split.focused]]?.themeColor
    : state?.themeColor;
  const setSpaceTheme = useContext(SpaceThemeContext);
  useEffect(() => {
    setSpaceTheme({ spaceId: active.id, color: spaceThemeColor });
    return () => setSpaceTheme(undefined);
  }, [setSpaceTheme, active.id, spaceThemeColor]);
  const theme = resolveAppTheme(active, spaceThemeColor);

  useEffect(() => {
    if (state?.pictureInPicture?.error)
      setMoveMessage(state.pictureInPicture.error);
  }, [state?.pictureInPicture?.error]);
  useEffect(() => {
    setSiteSettingsOpen(false);
    setExtensionPickerOpen(false);
  }, [selectedId, state?.siteSettings?.origin]);
  useEffect(() => {
    const save = (preferences: {
      searchEngine: string;
      searchEngines: unknown;
      smartTabLabels: boolean;
      translucentChrome?: boolean;
      translucentAI?: boolean;
      showExtensionIcons?: boolean;
      tabOverflowMode?: 'dropdown' | 'scroll';
      tabDisplayMode?: 'horizontal' | 'hover' | 'click';
      folderHoverPreviews?: boolean;
      showUnpinnedGroups?: boolean;
      addressBarPlacement?: 'sidebar' | 'header';
      addressBarFullUrl?: boolean;
      personalDataAutofillExcludedSites?: string[];
      addressBarExtensionsExpanded?: boolean;
      extensionToolbarOrder?: string[] | null;
    }) => {
      setShowExtensionIcons(preferences.showExtensionIcons !== false);
      setTabOverflowMode(preferences.tabOverflowMode || 'scroll');
      setTabDisplayMode(preferences.tabDisplayMode || 'horizontal');
      setFolderHoverPreviews(preferences.folderHoverPreviews !== false);
      setShowUnpinnedGroups(
        preferences.showUnpinnedGroups === true ||
          windowWorkspace.state()?.kind === 'temporary'
      );
      setAddressBarPlacement(preferences.addressBarPlacement || 'sidebar');
      setAddressBarFullUrl(preferences.addressBarFullUrl === true);
      setAutofillExcludedSites(preferences.personalDataAutofillExcludedSites || []);
      setAddressBarExtensionsExpanded(
        preferences.addressBarExtensionsExpanded !== false
      );
      setExtensionToolbarOrder(preferences.extensionToolbarOrder ?? null);
      setTranslucentChrome(preferences.translucentChrome !== false);
      setTranslucentAI(preferences.translucentAI === true);
      setSmartLabelsEnabled(preferences.smartTabLabels !== false);
      localStorage.setItem(
        'kudiumbrowser-search-engine',
        preferences.searchEngine
      );
      localStorage.setItem(
        'kudiumbrowser-search-engines',
        JSON.stringify(preferences.searchEngines)
      );
    };
    let live = true;
    Promise.all([
      browser.preferences('get'),
      browser.preferenceAction('info').catch(() => null),
    ])
      .then(([preferences, info]) => {
        if (!live) return null;
        save(preferences);
        if (
          info &&
          'extensionCatalog' in info &&
          info.extensionCatalog?.length === 0
        )
          setAddressBarExtensionsExpanded(false);
        return null;
      })
      .catch(() => {});
    const unsubscribe = browser.onPreferences(save);
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => browser.onSnapshots(setSnapshots), []);
  useEffect(
    () => window.electron.browser.onWindowMirrors?.(setWindowMirrors),
    []
  );

  useEffect(() => {
    setSelectedId(active.selectedAppId);
  }, [active.id, active.selectedAppId]);
  useEffect(() => setSplit(null), [active.id]);
  useEffect(
    () =>
      browser.onShortcut((action) => {
        if (tabSwitcherRef.current.handle(action)) return;
        if (
          action === 'sidebar-or-save' &&
          document.activeElement?.closest('.developer-files')
        ) {
          window.dispatchEvent(new Event('developer-save-file'));
          return;
        }
        if (action === 'new-window')
          window.electron.browser
            .windowRequest({ action: 'new-window' })
            .catch((error) => setMoveMessage(String(error)));
        if (action === 'command') setPaletteOpen(true);
        if (action === 'new-session') openNewGroup(active.id);
        if (action === 'new-space') openCreateSpace();
        if (action === 'group-settings' && selected) setEditingGroup(selected);
        if (action === 'site-settings' && selected) setSiteSettingsOpen(true);
        if (['assistant', 'ai-tasks', 'developer'].includes(action)) {
          setAIMounted(true);
          setAIOpen(true);
          setMenuPaneRequest((previous) => ({
            pane: (
              {
                assistant: 'assistant',
                'ai-tasks': 'tasks',
                developer: 'developer',
              } as const
            )[action as 'assistant' | 'ai-tasks' | 'developer'],
            token: (previous?.token || 0) + 1,
          }));
        }
        if (action === 'export-group' && selected) {
          window.electron.siteDeveloper
            .transfer('export', selected.id)
            .catch((error) => setMoveMessage(String(error)));
        }
        if (action === 'import-group') {
          window.electron.siteDeveloper
            .transfer('import', active.id)
            .then((imported) => {
              if (!imported) return undefined;
              AppManager.set([...AppManager.getAll(), ...imported.tabs]);
              select(imported.tabs[0]);
              setEditingGroup(imported.tabs[0]);
              if (imported.reviewHooks)
                window.dispatchEvent(
                  new CustomEvent('kudiumbrowser-open-group-developer', {
                    detail: imported.tabs[0].id,
                  })
                );
              return undefined;
            })
            .catch((error) => setMoveMessage(String(error)));
        }
        if (action === 'find' && !downloadsOpen) setFindOpen(true);
        if (action === 'history')
          activateSidebarPage(
            sidebarPage === HISTORY_PAGE ? active.id : HISTORY_PAGE
          );
        if (action === 'downloads')
          activateSidebarPage(
            sidebarPage === DOWNLOADS_PAGE ? active.id : DOWNLOADS_PAGE
          );
        if (action === 'preferences') browser.preferences('open');
        if (action === 'extensions') {
          if (addressBarPlacement === 'sidebar') {
            setCompact(false);
            activateSidebarPage(active.id);
          }
          browser
            .preferences('update', { addressBarExtensionsExpanded: true })
            .catch(() => {});
          setAddressBarExtensionsExpanded(true);
          setExtensionPickerOpen((open) => !open);
        }
        if (
          selected &&
          [
            'back',
            'forward',
            'reload',
            'reload-ignore-cache',
            'print',
            'zoom-in',
            'zoom-out',
            'zoom-reset',
          ].includes(action)
        ) {
          browser.command({
            id: selected.id,
            action: action as
              | 'back'
              | 'forward'
              | 'reload'
              | 'reload-ignore-cache'
              | 'print'
              | 'zoom-in'
              | 'zoom-out'
              | 'zoom-reset',
          });
        }
        if (action === 'reopen-tab') {
          const closed = [...AppManager.getAll()]
            .reverse()
            .find(
              (item) =>
                item.archived && (item.spaceId || 'default') === active.id
            );
          if (closed) {
            select(AppManager.restore(closed));
          }
        }
        if (action === 'sidebar' || action === 'sidebar-or-save') {
          setDownloadsOpen(false);
          setSidebarHidden((previous) => !previous);
        }
        if (action === 'ai-sidebar') {
          setAIMounted(true);
          setAIOpen((previous) => !previous);
        }
        if (action === 'next-tab' || action === 'previous-tab') {
          tabSwitcherRef.current.handle(
            action === 'next-tab'
              ? 'tab-switcher-next'
              : 'tab-switcher-previous'
          );
          tabSwitcherRef.current.handle('tab-switcher-commit');
        }
        if (action === 'close-tab' && selected) unloadPageTab(selected);
        if (action === 'remove-tab' && selected) {
          try {
            AppManager.set(
              AppManager.getAll().filter((tab) => tab.id !== selected.id)
            );
            tabSwitcherRef.current.remove([selected.id]);
          } catch (error) {
            setMoveMessage(String(error));
          }
        }
        if (action === 'next-space' || action === 'previous-space') {
          swipeSidebar(action === 'next-space' ? 1 : -1);
        }
      }),
    [
      spaces,
      active.id,
      openNewGroup,
      selected,
      addressBarPlacement,
      switchableTabs,
      select,
      downloadsOpen,
      activateSidebarPage,
      sidebarPage,
      swipeSidebar,
      setCompact,
      setAIOpen,
    ]
  );
  useEffect(
    () =>
      browser.onState((next) => {
        if (next.discarded) tabSwitcherRef.current.remove([next.id]);
        setStates((previous) => ({ ...previous, [next.id]: next }));
        const item = AppManager.getBy('id', next.id);
        if (
          item &&
          (savedNavigationURL(item, next) !== item.url ||
            (next.title && next.title !== item.name) ||
            (next.icon !== undefined && next.icon !== item.icon))
        ) {
          AppManager.update('id', item.id, {
            ...item,
            name: next.title || item.name,
            url: savedNavigationURL(item, next),
            sessionName:
              !item.customName && item.sessionName === item.name
                ? next.title || item.name
                : item.sessionName,
            icon: next.icon !== undefined ? next.icon : item.icon,
          });
        }
      }),
    []
  );
  useEffect(() => {
    setAddress(
      selected && lockedGroup(selected) ? '' : state?.url || selected?.url || ''
    );
  }, [state?.url, selected, groupAccess]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    const sync = () => {
      const bounds = element.getBoundingClientRect();
      const ids = (split ? [split.left, split.right] : [selected?.id]).filter(
        (id, index, all) =>
          id &&
          all.indexOf(id) === index &&
          appList.some((item) => item.id === id)
      ) as string[];
      browser.sync({
        suspended: overlayOpen,
        tabSwitcher: !!tabSwitcher.shown,
        focusedId: selected?.id,
        apps: appList
          .filter((item) => !item.archived)
          .map((item) => ({
            ...item,
            collectionName: spaces
              .find((space) => space.id === (item.spaceId || 'default'))
              ?.folders.find((folder) => folder.id === item.folderId)?.name,
          })),
        visible: overlayOpen
          ? []
          : ids.map((id, index) => ({
              id,
              x:
                bounds.x +
                ((bounds.width + (ids.length > 1 ? 2 : 0)) / ids.length) *
                  index,
              y: bounds.y,
              width: (bounds.width - (ids.length > 1 ? 2 : 0)) / ids.length,
              height: bounds.height,
            })),
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    window.addEventListener('resize', sync);
    sync();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [
    appList,
    selected?.id,
    split,
    overlayOpen,
    tabSwitcher.shown,
    spaces,
    compact,
    sidebarHidden,
    active.id,
    spaceApps,
    groupAccess,
  ]);
  useEffect(() => () => browser.sync({ apps: [], visible: [] }), []);
  const closeGroupPreview = preview.close;
  const closeGroup = useCallback(
    (item: IApp) => {
      closeGroupPreview();
      tabSwitcherRef.current.remove(
        appList
          .filter((tab) => aiGroupId(tab) === aiGroupId(item))
          .map((tab) => tab.id)
      );
      setClosedGroups((previous) =>
        previous.has(aiGroupId(item))
          ? previous
          : new Set([...previous, aiGroupId(item)])
      );

      if (
        split &&
        [split.left, split.right].some((id) =>
          appList.some(
            (tab) => tab.id === id && aiGroupId(tab) === aiGroupId(item)
          )
        )
      )
        setSplit(null);
      browser.command({ id: item.id, action: 'close-group' });
    },
    [closeGroupPreview, split, appList]
  );
  useEffect(
    () =>
      browser.onTabRequest((request) => {
        if (request.action === 'open-external' && request.url) {
          try {
            const url = new URL(request.url);
            if (!['http:', 'https:'].includes(url.protocol)) return;
            const apps = AppManager.getAll();
            const activeSpace = SpaceManager.getAll().find(
              (space) => space.id === SpaceManager.activeId()
            );
            const activeId =
              activeSpace?.selectedAppId || externalSource.current?.id;
            const source = apps.find(
              (item) =>
                item.id === activeId &&
                !item.archived &&
                !closedGroups.has(aiGroupId(item))
            );
            const destination = commandDestination(
              apps,
              source,
              url.href,
              !source,
              SpaceManager.activeId()
            );
            const item = destination.existing || destination.app;
            if (!item) return;
            if (destination.app) {
              if (source)
                Object.assign(item, {
                  favorite: source.favorite,
                  pinned: source.pinned,
                  sessionSlug: source.sessionSlug,
                });
              AppManager.add(item);
            }
            // Update synchronously so several queued links share one group.
            externalSource.current = item;
            select(item);
          } catch {
            /* Ignore malformed external links. */
          }
          return;
        }
        if (request.action === 'store') {
          const existing = AppManager.getAll().find((app) => {
            try {
              return (
                new URL(app.url).origin === 'https://chromewebstore.google.com'
              );
            } catch {
              return false;
            }
          });
          const store: IApp = existing
            ? {
                ...existing,
                archived: false,
                extensionInstallTarget: request.profileId,
              }
            : {
                id: crypto.randomUUID(),
                sessionId: crypto.randomUUID(),
                name: 'Chrome Web Store',
                sessionName: 'Chrome Web Store',
                url: 'https://chromewebstore.google.com/',
                icon: '',
                extensionInstallTarget: request.profileId,
              };
          if (existing) AppManager.update('id', existing.id, store);
          else AppManager.add(store);
          select(store);
        }
        if (request.action === 'create' && request.app) {
          AppManager.add(request.app);
          if (!request.background) select(request.app);
        }
        const item = request.id && AppManager.getBy('id', request.id);
        if (request.action === 'remove' && request.ids) {
          try {
            AppManager.removeDeleted(request.ids);
          } catch (error) {
            setMoveMessage(String(error));
          }
          return;
        }
        if (request.action === 'unload-group' && item) {
          if (!closedGroups.has(aiGroupId(item))) closeGroup(item);
          return;
        }
        if (item && request.action === 'select') select(item);
        if (request.action === 'select-group' && request.groupId) {
          const group = AppManager.getAll().find(
            (entry) => !entry.archived && groupKey(entry) === request.groupId
          );
          if (group) selectGroup(group);
        }
        if (item && request.action === 'close') closePageTab(item);
      }),
    [select, selectGroup, closedGroups, closeGroup, closePageTab]
  );
  const closeGroupConfirming = useRef(new Set<string>());
  const closeGroupButton = async (item: IApp) => {
    const group = aiGroupId(item);
    const name = item.sessionName || item.name;
    if (closedGroups.has(group)) {
      if (closeGroupConfirming.current.has(group)) return;
      closeGroupConfirming.current.add(group);
      try {
        const result = await browser.removeGroup(item.id, true);
        if (result.removed) {
          AppManager.removeDeleted(result.ids || []);
          setClosedGroupUndo(undefined);
          return;
        }
        if (!result.archive) return;
      } finally {
        closeGroupConfirming.current.delete(group);
      }
    } else {
      const ids = AppManager.getAll()
        .filter((tab) => !tab.archived && aiGroupId(tab) === group)
        .map((tab) => tab.id);
      closeGroup(item);
      setClosedGroupUndo({
        kind: 'group',
        ids,
        selectedId:
          selected && ids.includes(selected.id) ? selected.id : item.id,
        name,
      });
      return;
    }
    const ids = AppManager.getAll()
      .filter((tab) => !tab.archived && aiGroupId(tab) === aiGroupId(item))
      .map((tab) => tab.id);
    closeGroup(item);
    AppManager.set(
      AppManager.getAll().map((tab) =>
        aiGroupId(tab) === aiGroupId(item) ? { ...tab, archived: true } : tab
      )
    );
    setClosedGroupUndo({
      kind: 'group',
      ids,
      selectedId: selected && ids.includes(selected.id) ? selected.id : item.id,
      name: item.sessionName || item.name,
    });
  };
  const undoCloseGroup = () => {
    if (!closedGroupUndo) return;
    const ids = new Set(closedGroupUndo.ids);
    const restored = AppManager.getAll().map((tab) =>
      ids.has(tab.id) && tab.archived
        ? { ...tab, archived: false, restorationId: crypto.randomUUID() }
        : tab
    );
    AppManager.set(restored);
    const target = restored.find(
      (tab) => tab.id === closedGroupUndo.selectedId && !tab.archived
    );
    setClosedGroupUndo(undefined);
    if (target) {
      select(target);
      if (closedGroupUndo.kind === 'tab')
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLButtonElement>(
              '.horizontal-tab.active .horizontal-tab-select'
            )
            ?.focus();
        });
    }
  };
  const duplicate = (item: IApp, share: boolean) => {
    const copy = {
      ...item,
      customName: undefined,
      tabPinned: share ? item.tabPinned : false,
      id: crypto.randomUUID(),
      name: item.name,
      sessionId: share ? item.sessionId : crypto.randomUUID(),
      sessionProfileId: share ? item.sessionProfileId : undefined,
      spaceId: active.id,
      favorite: false,
      archived: false,
      sessionName: share
        ? item.sessionName || item.name
        : newGroupName(
            AppManager.getAll(),
            item.sessionName || item.name,
            item.sessionNameCustom
          ),
      sessionNameCustom: share ? item.sessionNameCustom : false,
      sessionNameGenerated: share ? item.sessionNameGenerated : true,
    };
    const apps = AppManager.getAll();
    AppManager.set(insertTabAfter(apps, item.id, copy));
    select(copy);
  };
  const command = (
    action: import('../../../types').BrowserCommand['action'],
    url?: string
  ) => {
    if (selected) browser.command({ id: selected.id, action, url });
  };
  const rename = (item: IApp, axis: 'vertical' | 'horizontal' | 'folder' = 'vertical') => {
    if (axis === 'vertical' && item.favorite) {
      setFavoriteName(item.sessionName || item.name);
      setFavoriteRename(item);
      return;
    }
    if (axis === 'vertical') setCompact(false);
    setRenameTarget({ id: item.id, axis });
  };
  const saveName = (
    item: IApp,
    axis: 'vertical' | 'horizontal' | 'folder',
    name: string
  ) => {
    AppManager.set(
      AppManager.getAll().map((entry) => {
        if (
          axis === 'vertical' &&
          groupKey(entry) === groupKey(item) &&
          (entry.spaceId || 'default') === (item.spaceId || 'default')
        )
          return {
            ...entry,
            sessionName: name || item.name,
            sessionNameCustom: Boolean(name),
            sessionNameGenerated: false,
          };
        if (axis !== 'vertical' && entry.id === item.id)
          return { ...entry, customName: name || undefined };
        return entry;
      })
    );
    setRenameTarget(undefined);
  };
  const deleteCollection = (deleteGroups: boolean) => {
    if (!deletingCollection) return;
    const { id, spaceId } = deletingCollection;
    if (
      deleteGroups &&
      AppManager.getAll().some(
        (tab) =>
          (tab.spaceId || 'default') === spaceId &&
          tab.folderId === id &&
          lockedGroup(tab)
      )
    ) {
      setMoveMessage(
        'Unlock the groups in this collection before deleting them.'
      );
      return;
    }
    AppManager.set(
      removeGroupFolder(AppManager.getAll(), spaceId, id, deleteGroups)
    );
    const space = SpaceManager.getAll().find((entry) => entry.id === spaceId);
    if (space)
      SpaceManager.update(spaceId, {
        folders: space.folders.filter((folder) => folder.id !== id),
      });
    setDeletingCollection(undefined);
    setFolderDialog(false);
  };
  const edit = (item: IApp) => setEditingGroup(item);
  useEffect(() => {
    if (!split) return;
    // Workspace events may arrive after selecting a freshly created tab.
    const latest = AppManager.getAll();
    const repaired = repairSplitView(split, latest);
    if (!repaired) {
      const survivor = latest.find(
        (item) =>
          !item.archived && (item.id === split.left || item.id === split.right)
      );
      setSplit(null);
      if (survivor) select(survivor);
    } else if (repaired.left !== split.left || repaired.right !== split.right) {
      setSplit(repaired);
      setSelectedId(repaired[repaired.focused]);
    }
  }, [appList, split, select]);
  const openBeside = (item: IApp, side: SplitSide) => {
    if (!selected) {
      select(item);
      return;
    }
    let target = item;
    if (!split && item.id === selected.id) {
      target = {
        ...item,
        id: crypto.randomUUID(),
        pinned: false,
        favorite: false,
        archived: false,
      };
      const apps = AppManager.getAll();
      AppManager.set([...apps, { ...target, position: apps.length + 1 }]);
    }
    const next: SplitView = split
      ? selectSplitTab(split, target.id, side)
      : {
          left: side === 'left' ? target.id : selected.id,
          right: side === 'right' ? target.id : selected.id,
          focused: side,
        };
    setSplit(next);
    setSelectedId(target.id);
    ScreenManager.saveLastAppId(target.id);
    SpaceManager.update(active.id, { selectedAppId: target.id });
  };
  const closeSide = (side: SplitSide) => {
    if (!split) return;
    const other = side === 'left' ? split.right : split.left;
    setSplit(null);
    const item = appList.find((entry) => entry.id === other);
    if (item) select(item);
  };
  const dragPreview = useRef<HTMLElement>();
  const previousTabBounds = useRef(new Map<string, DOMRect>());
  const tabMotion = useRef(new Map<string, Animation>());
  const dragMotionPending = useRef(false);
  useLayoutEffect(() => {
    tabMotion.current.forEach((animation) => animation.cancel());
    tabMotion.current.clear();
    const animateDrop = dragMotionPending.current && !dragged;
    if (!dragged) dragMotionPending.current = false;
    const next = new Map<string, DOMRect>();
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    document
      .querySelectorAll<HTMLElement>('[data-tab-motion]')
      .forEach((element) => {
        const key = element.dataset.tabMotion || '';
        const bounds = element.getBoundingClientRect();
        const previous = previousTabBounds.current.get(key);
        next.set(key, bounds);
        if (
          animateDrop &&
          !reducedMotion &&
          previous &&
          bounds.width &&
          bounds.height
        ) {
          const x = previous.x - bounds.x;
          const y = previous.y - bounds.y;
          if (Math.abs(x) > 1 || Math.abs(y) > 1)
            tabMotion.current.set(
              key,
              element.animate(
                [
                  { transform: `translate(${x}px, ${y}px)` },
                  { transform: 'translate(0, 0)' },
                ],
                { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }
              )
            );
        }
      });
    previousTabBounds.current = next;
  }, [appList, dragged]);
  useEffect(() => () => dragPreview.current?.remove(), []);
  const startDrag = (
    event: DragEvent,
    item: IApp,
    axis: 'vertical' | 'horizontal'
  ) => {
    if (renameTarget) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('application/x-kudiumbrowser-tab', item.id);
    const token = crypto.randomUUID();
    windowDrag.current = { token, handled: false, cancelled: false };
    event.dataTransfer.setData(WINDOW_DRAG_MIME, token);
    window.electron.browser
      .windowRequest({
        action: 'begin-drag',
        token,
        id: item.id,
        kind: axis === 'vertical' ? 'group' : 'tab',
      })
      .catch((error) => setMoveMessage(String(error)));
    event.dataTransfer.setData(
      AI_CONTEXT_MIME,
      JSON.stringify({
        kind: axis === 'vertical' ? 'group' : 'tab',
        id: axis === 'vertical' ? aiGroupId(item) : item.id,
      })
    );
    event.dataTransfer.effectAllowed = 'copyMove';
    dragPreview.current?.remove();
    const dragImage = document.createElement('div');
    dragImage.className = 'tab-drag-preview';
    dragImage.textContent =
      axis === 'vertical'
        ? item.sessionName || item.name
        : item.customName || states[item.id]?.title || item.name;
    document.body.appendChild(dragImage);
    dragPreview.current = dragImage;
    event.dataTransfer.setDragImage(dragImage, 20, 18);
    dragMotionPending.current = true;
    setDragged({ id: item.id, axis });
    setMoveMessage('');
  };
  const finishDrag = () => {
    if (windowDrag.current) windowDrag.current.handled = true;
    dragPreview.current?.remove();
    dragPreview.current = undefined;
    setDragged(undefined);
    setDropTarget(undefined);
  };
  const endWindowDrag = () => {
    const drag = windowDrag.current;
    if (drag) {
      window.electron.browser
        .windowRequest(
          drag.handled
            ? { action: 'cancel-drag', token: drag.token }
            : {
                action: 'finish-drag',
                token: drag.token,
                cancelled: drag.cancelled,
              }
        )
        .catch((error) => setMoveMessage(String(error)));
    }
    windowDrag.current = undefined;
    finishDrag();
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && windowDrag.current)
        windowDrag.current.cancelled = true;
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, []);
  const transferTab = async (source: IApp, target?: IApp) => {
    const url = states[source.id]?.url || source.url;
    const approved =
      target && loginProfileKey(source) === loginProfileKey(target)
        ? true
        : await browser.confirm({
            message: target
              ? `Move this tab to ${target.sessionName || target.name}?`
              : 'Move this tab to a new group?',
            detail: target
              ? 'This tab will move out of its current group and reload using the selected group’s cookies and login state.'
              : 'This tab will move out of its current group and reload with separate cookies and login state. You may need to sign in again.',
            confirm: 'Move tab',
          });
    if (!approved) return;
    if (
      target &&
      !AppManager.getAll().some((app) => app.id === target.id && !app.archived)
    ) {
      setMoveMessage('This group is no longer open. Choose another group.');
      return;
    }
    const next = moveTab(
      AppManager.getAll(),
      source.id,
      url,
      target
        ? { ...target, url: states[target.id]?.url || target.url }
        : undefined,
      active.id
    );
    AppManager.set(next);
    const moved = next.find((item) => item.id === source.id);
    if (moved) select(moved);
    setMoveMessage(
      target
        ? `Moved to ${target.sessionName || target.name}`
        : 'Opened in a new group'
    );
  };
  useEffect(() => {
    if (!moveMessage) return undefined;
    const timer = setTimeout(() => setMoveMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [moveMessage]);
  const sectionOf = (item: IApp): SidebarSection => {
    if (item.favorite) return 'favorites';
    return (showUnpinnedGroups ||
      windowWorkspace.state()?.kind === 'temporary') &&
      item.pinned === false
      ? 'regular'
      : 'pinned';
  };
  const dropSidebarFile = async (file: File) => {
    if (sidebarDropBusy.current) return;
    sidebarDropBusy.current = true;
    try {
      const result = await window.electron.siteDeveloper.drop(file, active.id);
      if (result.kind === 'project') {
        setDroppedProject(result);
        setNewGroupSpace(active.id);
        setEditingGroup({
          id: crypto.randomUUID(),
          sessionId: crypto.randomUUID(),
          name: result.name,
          sessionName: result.name,
          sessionSlug: result.slug,
          url: 'about:blank',
          icon: '',
          spaceId: active.id,
          pinned: true,
        });
      } else if (result.imported) {
        const { imported } = result;
        AppManager.set([...AppManager.getAll(), ...imported.tabs]);
        const first = imported.tabs[0];
        select(first);
        setEditingGroup(first);
        if (imported.reviewHooks)
          window.dispatchEvent(
            new CustomEvent('kudiumbrowser-open-group-developer', {
              detail: first.id,
            })
          );
      }
    } catch (error) {
      setMoveMessage(error instanceof Error ? error.message : String(error));
    } finally {
      sidebarDropBusy.current = false;
    }
  };
  const sectionDropProps = (section: SidebarSection) => ({
    'data-drop-target': dropTarget === `section-${section}` || undefined,
    onDragOver: (event: DragEvent) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(`section-${section}`);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        if (
          dragged &&
          event.dataTransfer.getData('application/x-kudiumbrowser-tab') ===
            dragged.id
        ) {
          AppManager.set(
            moveGroupToSection(
              AppManager.getAll(),
              dragged.id,
              section,
              active.id
            )
          );
        }
      } catch (error) {
        setMoveMessage(error instanceof Error ? error.message : String(error));
      }
      finishDrag();
    },
  });
  const dropTab = (
    event: DragEvent,
    target?: IApp,
    axis: 'vertical' | 'horizontal' = 'vertical'
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const token = event.dataTransfer.getData(WINDOW_DRAG_MIME);
    if (token && (!windowDrag.current || token !== windowDrag.current.token)) {
      window.electron.browser
        .windowRequest({ action: 'drop', token, targetId: target?.id })
        .catch((error) => setMoveMessage(String(error)));
      finishDrag();
      return;
    }
    if (
      !dragged ||
      event.dataTransfer.getData('application/x-kudiumbrowser-tab') !==
        dragged.id
    )
      return;
    const apps = AppManager.getAll();
    const source = apps.find((item) => item.id === dragged.id);
    if (!source) {
      finishDrag();
      return;
    }
    try {
      if (
        target &&
        ((dragged.axis === 'vertical' && axis === 'vertical') ||
          groupKey(source) === groupKey(target))
      ) {
        const movingGroup = dragged.axis === 'vertical' && axis === 'vertical';
        let destination = apps;
        if (movingGroup) {
          destination = target.folderId
            ? moveGroupToFolder(apps, source, active.id, target.folderId)
            : moveGroupToSection(apps, source.id, sectionOf(target), active.id);
        }
        AppManager.set(
          reorderTabs(destination, source.id, target.id, movingGroup)
        );
      } else if (dragged.axis === 'horizontal' || target) {
        finishDrag();
        transferTab(source, target).catch((error) =>
          setMoveMessage(String(error))
        );
      }
    } catch (error) {
      setMoveMessage((error as Error).message);
    }
    finishDrag();
  };
  const renderGroupMenu = (item: IApp) => {
    const locked = lockedGroup(item);
    const protectedGroup = groupAccess.protected.includes(groupKey(item));
    return (
      <ContextMenu.Content>
        <ContextMenu.Label>{item.sessionName || item.name}</ContextMenu.Label>
        {!locked && (
          <ContextMenu.Item
            onSelect={() =>
              window.electron.browser
                .windowRequest({ action: 'open-group', id: item.id })
                .catch((error) => setMoveMessage(String(error)))
            }
          >
            Open group in new window
          </ContextMenu.Item>
        )}
        {locked ? (
          <ContextMenu.Item
            onSelect={() =>
              groupAccessAction('unlock', item).catch((error) =>
                setMoveMessage(String(error))
              )
            }
          >
            Unlock group
          </ContextMenu.Item>
        ) : (
          <>
            <ContextMenu.Item
              onSelect={() => addToAI({ kind: 'group', id: aiGroupId(item) })}
            >
              Add to AI
            </ContextMenu.Item>
            <ContextMenu.Item
              onSelect={() => {
                openGroupTab(item);
              }}
            >
              New Tab…
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => closeGroup(item)}>
              {nativeMenuLabels.closeGroup}
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger>Split View</ContextMenu.SubTrigger>
              <ContextMenu.SubContent>
                <ContextMenu.Item onSelect={() => openBeside(item, 'left')}>
                  {nativeMenuLabels.openOnLeft}
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => openBeside(item, 'right')}>
                  {nativeMenuLabels.openOnRight}
                </ContextMenu.Item>
              </ContextMenu.SubContent>
            </ContextMenu.Sub>
            <ContextMenu.Item
              onSelect={() =>
                AppManager.set(
                  appList.map((tab) =>
                    groupKey(tab) === groupKey(item)
                      ? {
                          ...tab,
                          groupDisplay:
                            item.groupDisplay === 'folder' ? 'stack' : 'folder',
                        }
                      : tab
                  )
                )
              }
            >
              {item.groupDisplay === 'folder'
                ? 'Display as stack'
                : 'Display as folder'}
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => edit(item)}>
              {nativeMenuLabels.groupSettings}
            </ContextMenu.Item>
            <ContextMenu.Item
              onSelect={() =>
                window.electron.siteDeveloper
                  .transfer('export', item.id)
                  .catch((error) => setMoveMessage(String(error)))
              }
            >
              {nativeMenuLabels.exportGroup}
            </ContextMenu.Item>
            <ContextMenu.Item
              onSelect={() => {
                try {
                  AppManager.set(
                    moveGroupToSection(
                      AppManager.getAll(),
                      item.id,
                      item.favorite ? 'pinned' : 'favorites',
                      item.spaceId || 'default'
                    )
                  );
                } catch (error) {
                  setMoveMessage(
                    error instanceof Error ? error.message : String(error)
                  );
                }
              }}
            >
              {item.favorite ? 'Remove from Favorites' : 'Pin to Favorites'}
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item
              onSelect={() =>
                AppManager.set(
                  appList.map((entry) =>
                    groupKey(entry) === groupKey(item) &&
                    (entry.spaceId || 'default') === (item.spaceId || 'default')
                      ? { ...entry, archived: true }
                      : entry
                  )
                )
              }
            >
              Archive Group
            </ContextMenu.Item>
            <ContextMenu.Item
              color="red"
              onSelect={() => {
                window.electron
                  .passwordManager({
                    action: 'removeScope',
                    scope: personalDataScope(item),
                    disposition: 'ask',
                  })
                  .then((result) => {
                    if ((result as { removed: boolean }).removed)
                      AppManager.set(
                        AppManager.getAll().filter(
                          (entry) =>
                            !(
                              groupKey(entry) === groupKey(item) &&
                              (entry.spaceId || 'default') ===
                                (item.spaceId || 'default')
                            )
                        )
                      );
                    return undefined;
                  })
                  .catch((error) => setMoveMessage(String(error)));
              }}
            >
              {nativeMenuLabels.removeGroup}
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item
              disabled={!groupAccess.available}
              onSelect={() =>
                groupAccessAction(
                  protectedGroup ? 'lock' : 'protect',
                  item
                ).catch((error) => setMoveMessage(String(error)))
              }
            >
              {protectedGroup ? 'Lock now' : 'Lock group'}
            </ContextMenu.Item>
            {protectedGroup && (
              <ContextMenu.Item
                onSelect={() =>
                  groupAccessAction('unprotect', item).catch((error) =>
                    setMoveMessage(String(error))
                  )
                }
              >
                Remove group lock
              </ContextMenu.Item>
            )}
          </>
        )}
      </ContextMenu.Content>
    );
  };
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const renderApp = (item: IApp) => {
    const folderView = item.groupDisplay === 'folder' && !item.favorite;
    const expansionKey = JSON.stringify([
      item.spaceId || 'default',
      groupKey(item),
    ]);
    const expanded = expandedGroups.includes(expansionKey);
    const renaming =
      renameTarget?.id === item.id && renameTarget.axis === 'vertical';
    const Row = renaming ? 'div' : 'button';
    const locked = lockedGroup(item);
    const protectedGroup = groupAccess.protected.includes(groupKey(item));
    const slug = item.sessionSlug || '';
    const tooltip = `${item.sessionName || item.name}${
      slug ? `\n@${slug.length > 36 ? `${slug.slice(0, 35)}…` : slug}` : ''
    }${locked ? '\nLocked group' : ''}`;
    const hasPreview = !locked && tabsForPreview(item).length > 0;
    let ariaExpanded: boolean | undefined;
    if (folderView) ariaExpanded = expanded && !locked;
    else if (hasPreview)
      ariaExpanded =
        preview.target?.kind === 'session' && preview.target.id === item.id;
    return (
      <ContextMenu.Root key={item.id} onOpenChange={setMenuOpen}>
        <div
          className="sidebar-group"
          data-folder-view={folderView || undefined}
          data-expanded={
            (folderView && expanded && !locked && !item.favorite) || undefined
          }
        >
          <ContextMenu.Trigger>
            <div
              className={item.favorite ? undefined : 'sidebar-app-row'}
              data-tab-motion={`sidebar-${item.id}`}
              data-dragging={dragged?.id === item.id || undefined}
            >
              <Row
                type="button"
                className={`sidebar-app ${
                  selected && groupKey(selected) === groupKey(item)
                    ? 'active'
                    : ''
                }`}
                title={
                  hasPreview && tabDisplayMode !== 'click' ? undefined : tooltip
                }
                aria-haspopup={hasPreview ? 'dialog' : undefined}
                aria-expanded={ariaExpanded}
                aria-controls={folderView ? `group-tabs-${item.id}` : undefined}
                onMouseEnter={(event) => {
                  if (hasPreview && !renaming && !dragged && !menuOpen)
                    preview.open({
                      kind: 'session',
                      id: item.id,
                      anchor: event.currentTarget,
                      interaction: 'hover',
                    });
                }}
                onMouseLeave={preview.leave}
                onKeyDown={(event) => {
                  if (hasPreview && event.key === 'ArrowRight') {
                    event.preventDefault();
                    preview.open({
                      kind: 'session',
                      id: item.id,
                      anchor: event.currentTarget,
                      interaction: 'keyboard',
                    });
                  }
                }}
                aria-label={item.sessionName || item.name}
                aria-current={
                  selected && groupKey(selected) === groupKey(item)
                    ? 'page'
                    : undefined
                }
                onClick={(event) => {
                  if (renaming) return;
                  if (folderView && !locked) {
                    closePreview();
                    setExpandedGroups((previous) =>
                      expanded
                        ? previous.filter((id) => id !== expansionKey)
                        : [...previous, expansionKey]
                    );
                    return;
                  }
                  selectGroup(item);
                  if (hasPreview && tabDisplayMode === 'click') {
                    if (
                      preview.target?.anchor === event.currentTarget &&
                      preview.target.kind === 'session' &&
                      preview.target.id === item.id
                    )
                      preview.close();
                    else
                      preview.open({
                        kind: 'session',
                        id: item.id,
                        anchor: event.currentTarget,
                        interaction: 'click',
                      });
                  }
                }}
                draggable={!renaming && !locked}
                onDragStart={(event) => {
                  preview.close();
                  startDrag(event, item, 'vertical');
                }}
                onDragEnd={endWindowDrag}
                onDragOver={(event) => {
                  if (
                    dragged ||
                    event.dataTransfer.types.includes(WINDOW_DRAG_MIME)
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    setDropTarget(item.id);
                  }
                }}
                onDrop={(event) => dropTab(event, item)}
                data-drop-target={dropTarget === item.id || undefined}
                onDoubleClick={() => {
                  if (!locked) rename(item);
                }}
              >
                <GroupIcon
                  item={item}
                  tabs={appList}
                  compact={!!item.favorite}
                  expanded={expanded}
                />
                {protectedGroup && (
                  <LockKeyhole
                    size={12}
                    className="sidebar-group-lock"
                    aria-label={
                      locked
                        ? 'Group locked'
                        : 'Group unlocked for this session'
                    }
                  />
                )}
                <span className="sidebar-app-copy">
                  {renaming ? (
                    <InlineTabName
                      name={item.sessionName || item.name}
                      save={(name) => saveName(item, 'vertical', name)}
                      cancel={() => setRenameTarget(undefined)}
                    />
                  ) : (
                    <strong>
                      {item.sessionName ||
                        (item.sessionId ? item.name : 'Saved group')}
                    </strong>
                  )}
                </span>
                {folderView && !item.favorite && !locked && (
                  <ChevronDown
                    size={14}
                    className="sidebar-group-chevron"
                    data-expanded={expanded || undefined}
                    aria-hidden="true"
                  />
                )}
              </Row>
              {!item.favorite && !renaming && !locked && (
                <button
                  type="button"
                  className="sidebar-app-add"
                  aria-label={`New tab in ${item.sessionName || item.name}`}
                  title="New tab in this group"
                  onClick={(event) => {
                    event.stopPropagation();
                    openGroupTab(item);
                  }}
                >
                  <Plus size={13} />
                </button>
              )}
              {!item.favorite && !renaming && !locked && (
                <button
                  type="button"
                  className="sidebar-app-close"
                  aria-label={`Close ${item.sessionName || item.name}`}
                  title={
                    closedGroups.has(aiGroupId(item))
                      ? 'Archive or delete group…'
                      : 'Unload group'
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    closeGroupButton(item).catch((error) =>
                      setMoveMessage(String(error))
                    );
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </ContextMenu.Trigger>
          {folderView && !locked && !item.favorite && (
            <div
              id={`group-tabs-${item.id}`}
              className="sidebar-group-content"
              data-expanded={expanded || undefined}
              aria-hidden={!expanded}
              aria-label={`Tabs in ${item.sessionName || item.name}`}
            >
              <div className="sidebar-group-content-inner">
                <div className="sidebar-group-tabs">
                  {tabsForPreview(item).map((tab) => (
                    <div
                      key={tab.id}
                      className={`sidebar-group-tab ${
                        selected?.id === tab.id ? 'active' : ''
                      }`}
                      draggable={!renameTarget}
                      data-dragging={dragged?.id === tab.id || undefined}
                      data-drop-target={dropTarget === tab.id || undefined}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        closePreview();
                        startDrag(event, tab, 'horizontal');
                      }}
                      onDragEnd={endWindowDrag}
                      onDragOver={(event) => {
                        if (
                          dragged ||
                          event.dataTransfer.types.includes(WINDOW_DRAG_MIME)
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          setDropTarget(tab.id);
                        }
                      }}
                      onDrop={(event) => dropTab(event, tab, 'horizontal')}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        showTabContextMenu(tab.id, false, 'folder');
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'ContextMenu' ||
                          (event.shiftKey && event.key === 'F10')
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          showTabContextMenu(tab.id, false, 'folder');
                        }
                      }}
                    >
                      <div
                        className="sidebar-group-tab-select"
                        role={renameTarget?.id === tab.id && renameTarget.axis === 'folder' ? undefined : 'button'}
                        tabIndex={expanded ? 0 : -1}
                        aria-current={
                          selected?.id === tab.id ? 'page' : undefined
                        }
                        onClick={() => {
                          if (renameTarget?.id === tab.id && renameTarget.axis === 'folder') return;
                          closePreview();
                          select(tab);
                        }}
                        onDoubleClick={() => rename(tab, 'folder')}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            closePreview();
                            select(tab);
                          }
                        }}
                      >
                        <AppIcon
                          icon={tab.icon}
                          title={tab.customName || tab.name}
                        />
                        {renameTarget?.id === tab.id && renameTarget.axis === 'folder' ? (
                          <InlineTabName
                            name={tab.customName || tab.name}
                            save={(name) => saveName(tab, 'folder', name)}
                            cancel={() => setRenameTarget(undefined)}
                          />
                        ) : (
                          <span>{tab.customName || tab.name}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="sidebar-group-tab-close"
                        tabIndex={expanded ? 0 : -1}
                        aria-label={`Close ${tab.customName || tab.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          closePageTab(tab);
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {renderGroupMenu(item)}
      </ContextMenu.Root>
    );
  };
  const renderBrowserTools = () => (
    <>
      {windowWorkspace.state()?.private && (
        <span className="private-browsing-badge" role="status" title="Private browsing — temporary browsing data and chats">
          <LockKeyhole size={14} aria-hidden="true" />
          <span>Private</span>
        </span>
      )}
      <BrowserOptionsMenu
        pageAvailable={!!selected && !lockedGroup(selected)}
        onSelect={(option) => {
          if (option === 'new-tab') setPaletteOpen(true);
          else if (option === 'new-window')
            window.electron.browser
              .windowRequest({ action: 'new-window' })
              .catch((error) => setMoveMessage(String(error)));
          else if (option === 'history') activateSidebarPage(HISTORY_PAGE);
          else if (option === 'downloads') activateSidebarPage(DOWNLOADS_PAGE);
          else if (option === 'find') setFindOpen(true);
          else if (option === 'print') command('print');
          else if (option === 'site-settings') setSiteSettingsOpen(true);
          else if (option === 'extensions') {
            if (addressBarPlacement === 'sidebar') {
              setCompact(false);
              activateSidebarPage(active.id);
            }
            browser
              .preferences('update', { addressBarExtensionsExpanded: true })
              .catch(() => {});
            setAddressBarExtensionsExpanded(true);
            setExtensionPickerOpen(true);
          } else
            browser
              .preferences(
                'open',
                option === 'settings' ? undefined : { section: option }
              )
              .catch((error) => setMoveMessage(String(error)));
        }}
      />
      <ChromeIconButton
        icon={Code2}
        className="ai-toolbar-toggle"
        label="Toggle Developer sidebar"
        aria-expanded={aiOpen && aiPane === 'developer'}
        disabled={!selected || lockedGroup(selected)}
        onClick={() => {
          if (!selected || lockedGroup(selected)) return;
          toggleSidebarPane('developer');
        }}
      />
      <ChromeIconButton
        icon={Bell}
        className="ai-toolbar-toggle"
        label={
          unreadActivity
            ? `Toggle Activity sidebar — ${unreadActivity} unread events`
            : 'Toggle Activity sidebar'
        }
        badgeCount={unreadActivity}
        aria-expanded={aiOpen && aiPane === 'activity'}
        onClick={() => toggleSidebarPane('activity')}
      />
      <ChromeIconButton
        icon={StickyNote}
        className="ai-toolbar-toggle notes-toolbar-button"
        label={
          unreadNotes
            ? `Toggle Notes sidebar — ${unreadNotes} unread notes`
            : 'Toggle Notes sidebar'
        }
        badgeCount={unreadNotes}
        aria-expanded={aiOpen && aiPane === 'notes'}
        onClick={() => toggleSidebarPane('notes')}
      />
      <ChromeIconButton
        icon={MessageCircle}
        text="Chat"
        className="ai-toolbar-toggle chat-toolbar-button"
        label={
          aiWorkingTabs.length
            ? `Toggle Chat sidebar — ${aiWorkingTabs.length} active AI tabs`
            : 'Toggle Chat sidebar'
        }
        badgeCount={aiWorkingTabs.length}
        aria-expanded={aiOpen && aiPane === 'assistant'}
        onClick={() => toggleSidebarPane('assistant')}
      />
    </>
  );
  const renderAddressBar = () => (
    <AddressBar
      placement={addressBarPlacement}
      themeColor={state?.themeColor}
      mediaControl={
        <PictureInPictureButton
          state={state?.pictureInPicture}
          disabled={!selected || lockedGroup(selected)}
          onToggle={() => command('toggle-picture-in-picture')}
        />
      }
      groupBadge={
        (compact || sidebarHidden) && selected ? (
          <GroupPicker
            triggerClassName="address-group-badge"
            showTriggerIcon={false}
            label="Switch group"
            value={aiGroupId(selected)}
            disabled={false}
            options={Array.from(
              new Map(
                appList
                  .filter((item) => !item.archived)
                  .map((item) => [
                    aiGroupId(item),
                    {
                      id: aiGroupId(item),
                      name: item.sessionName || item.name,
                      detail: spaces.find(
                        (space) => space.id === (item.spaceId || 'default')
                      )?.name,
                      group: item,
                    },
                  ])
              ).values()
            )}
            onChange={(id) => {
              if (id === aiGroupId(selected)) return;
              const item = appList.find(
                (tab) => !tab.archived && aiGroupId(tab) === id
              );
              if (item) selectGroup(item);
            }}
          />
        ) : null
      }
      navigation={
        addressBarPlacement === 'header' ? (
          <>
            <ChromeIconButton
              icon={ArrowLeft}
              label="Back"
              disabled={!state?.canGoBack}
              onClick={() => command('back')}
            />
            <ChromeIconButton
              icon={ArrowRight}
              label="Forward"
              disabled={!state?.canGoForward}
              onClick={() => command('forward')}
            />
            <ChromeIconButton
              icon={state?.loading ? Square : RotateCw}
              label={state?.loading ? 'Stop loading' : 'Reload'}
              disabled={!selected}
              onClick={() => command(state?.loading ? 'stop' : 'reload')}
            />
            <ChromeIconButton
              icon={ChevronDown}
              label="Reload options"
              aria-haspopup="menu"
              disabled={!selected}
              onClick={() => command('reload-menu')}
            />
          </>
        ) : null
      }
      insecure={
        !!state?.siteSettings &&
        (state.siteSettings.origin.startsWith('http:') ||
          !!state.siteSettings.certificateError)
      }
      developer={state?.siteSettings?.developer}
      tools={addressBarPlacement === 'header' ? renderBrowserTools() : null}
      toolsDisabled={!selected || lockedGroup(selected)}
      expanded={addressBarExtensionsExpanded}
      onToggleExtensions={() => {
        const expanded = !addressBarExtensionsExpanded;
        setAddressBarExtensionsExpanded(expanded);
        closeExtensionPicker();
        browser
          .preferences('update', { addressBarExtensionsExpanded: expanded })
          .catch((error) => setMoveMessage(String(error)));
      }}
      onCopy={() => {
        if (selected) navigator.clipboard.writeText(state?.url || selected.url);
      }}
      onSiteSettings={() => setSiteSettingsOpen(true)}
      onSubmit={(event) => {
        event.preventDefault();
        const url = resolveAddress(address);
        if (selected) command('navigate', url);
        else {
          const item: IApp = {
            id: crypto.randomUUID(),
            name: new URL(url).hostname,
            url,
            icon: '',
            spaceId: active.id,
          };
          AppManager.add(item);
          select(item);
        }
        setEditingAddress(false);
      }}
      inputProps={{
        value: editingAddress
          ? address
          : (() => {
              if (selected && lockedGroup(selected)) return 'Locked group';
              const url = state?.url || selected?.url || '';
              if (addressBarFullUrl) return url;
              try {
                return new URL(url).hostname.replace(/^www\./, '');
              } catch {
                return '';
              }
            })(),
        readOnly: !!selected && lockedGroup(selected),
        onFocus: (event) => {
          if (selected && lockedGroup(selected)) return;
          setAddress(state?.url || selected?.url || '');
          setEditingAddress(true);
          const input = event.currentTarget;
          requestAnimationFrame(() => input.select());
        },
        onChange: (event) => setAddress(event.target.value),
        onBlur: () => {
          setEditingAddress(false);
          setAddress(state?.url || selected?.url || '');
        },
        onKeyDown: (event) => {
          if (event.key === 'Escape') event.currentTarget.blur();
        },
      }}
      extensions={
        <ExtensionToolbar
          context={state?.extensionContext}
          order={extensionToolbarOrder}
          showPinned={showExtensionIcons}
          open={extensionPickerOpen}
          onOpenChange={setExtensionPickerOpen}
          onClose={closeExtensionPicker}
          onManage={() => {
            closeExtensionPicker();
            browser.command({ id: selected?.id || '', action: 'extensions' });
          }}
          onStore={() => {
            closeExtensionPicker();
            browser
              .preferenceAction(
                'store',
                selected ? loginProfileKey(selected) : undefined
              )
              .catch(() => {});
          }}
        />
      }
    />
  );
  useEffect(() => {
    const focus = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const item = AppManager.getAll().find(
        (tab) => tab.id === id && !tab.archived
      );
      if (item) select(item);
    };
    const openDeveloper = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const item = AppManager.getAll().find(
        (tab) => tab.id === id && !tab.archived
      );
      if (!item || lockedGroup(item)) return;
      select(item);
      setAIMounted(true);
      setAIOpen(true);
      setDeveloperRequest((previous) => previous + 1);
    };
    window.addEventListener('kudiumbrowser-ai-focus-tab', focus);
    window.addEventListener(
      'kudiumbrowser-open-group-developer',
      openDeveloper
    );
    return () => {
      window.removeEventListener('kudiumbrowser-ai-focus-tab', focus);
      window.removeEventListener(
        'kudiumbrowser-open-group-developer',
        openDeveloper
      );
    };
  });
  const renderTabMenu = (
    item: IApp,
    side?: SplitSide,
    fromDeveloper = false,
    renameAxis: 'horizontal' | 'folder' = 'horizontal'
  ) => (
    <ContextMenu.Content>
      {fromDeveloper && (
        <>
          <ContextMenu.Item onSelect={() => select(item)}>
            Open tab
          </ContextMenu.Item>
          <ContextMenu.Separator />
        </>
      )}
      <ContextMenu.Item onSelect={() => addToAI({ kind: 'tab', id: item.id })}>
        Add to AI
      </ContextMenu.Item>
      <ContextMenu.Item
        disabled={!/^https?:\/\//i.test(item.url)}
        onSelect={() =>
          browser.command({
            id: item.id,
            action: 'open-site-developer',
            url: new URL(item.url).origin,
          })
        }
      >
        Manage hooks…
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() =>
          AppManager.update('id', item.id, {
            ...item,
            tabPinned: !item.tabPinned,
            tabDefaultURL: item.tabPinned
              ? item.tabDefaultURL
              : validTabDefaultURL(states[item.id]?.url || item.url) ||
                item.tabDefaultURL,
          })
        }
      >
        {item.tabPinned ? 'Unpin tab' : 'Pin tab'}
      </ContextMenu.Item>
      <ContextMenu.Item
        disabled={
          !validTabDefaultURL(states[item.id]?.url || item.url) ||
          item.tabDefaultURL === (states[item.id]?.url || item.url)
        }
        onSelect={() =>
          AppManager.update('id', item.id, {
            ...item,
            tabDefaultURL: validTabDefaultURL(states[item.id]?.url || item.url),
          })
        }
      >
        Set current URL as default
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger>
          {nativeMenuLabels.moveTabToGroup}
        </ContextMenu.SubTrigger>
        <ContextMenu.SubContent>
          {appList
            .filter(
              (candidate, index, all) =>
                !candidate.archived &&
                groupKey(candidate) !== groupKey(item) &&
                all.findIndex(
                  (entry) => groupKey(entry) === groupKey(candidate)
                ) === index
            )
            .map((candidate) => (
              <ContextMenu.Item
                key={candidate.id}
                onSelect={() => {
                  transferTab(item, candidate).catch((error) =>
                    setMoveMessage(String(error))
                  );
                }}
              >
                {candidate.sessionName || candidate.name}
              </ContextMenu.Item>
            ))}
        </ContextMenu.SubContent>
      </ContextMenu.Sub>
      <ContextMenu.Item
        onSelect={() => {
          transferTab(item).catch((error) => setMoveMessage(String(error)));
        }}
      >
        {nativeMenuLabels.moveTabToANewGroup}
      </ContextMenu.Item>
      <ContextMenu.Label>
        Reloads this tab with separate cookies and login state
      </ContextMenu.Label>
      <ContextMenu.Item
        onSelect={() =>
          window.electron.browser
            .windowRequest({ action: 'open-tab', id: item.id })
            .catch((error) => setMoveMessage(String(error)))
        }
      >
        Open tab in new window
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() => {
          rename(item, renameAxis);
        }}
      >
        {nativeMenuLabels.renameTab}
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() => {
          AppManager.update('id', item.id, {
            ...item,
            customName: undefined,
          });
          select(item, side);
          browser.command({
            id: item.id,
            action: 'reload',
          });
        }}
      >
        {nativeMenuLabels.useWebsiteTitle}
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => openBeside(item, 'left')}>
        {nativeMenuLabels.openOnLeft}
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => openBeside(item, 'right')}>
        {nativeMenuLabels.openOnRight}
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => duplicate(item, true)}>
        {nativeMenuLabels.duplicateTab}
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => duplicate(item, false)}>
        {nativeMenuLabels.openInANewGroup}
      </ContextMenu.Item>
      <ContextMenu.Item color="red" onSelect={() => closePageTab(item)}>
        {nativeMenuLabels.closeTab}
      </ContextMenu.Item>
    </ContextMenu.Content>
  );
  const showTabContextMenu = (id: string, fromDeveloper = true, renameAxis: 'horizontal' | 'folder' = 'horizontal') => {
    const item = AppManager.getAll().find(
      (tab) => tab.id === id && !tab.archived
    );
    if (!item || lockedGroup(item)) return;
    showNativeContextMenu(renderTabMenu(item, undefined, fromDeveloper, renameAxis), () => {
      const current = AppManager.getAll().find(
        (tab) => tab.id === id && !tab.archived
      );
      return !!current && !lockedGroup(current);
    }).catch((error) => setMoveMessage(String(error)));
  };
  const showGroupContextMenu = (id: string) => {
    const item = AppManager.getAll().find(
      (tab) => aiGroupId(tab) === id && !tab.archived
    );
    if (!item) return;
    const wasLocked = lockedGroup(item);
    showNativeContextMenu(renderGroupMenu(item), () => {
      const current = AppManager.getAll().find(
        (tab) => aiGroupId(tab) === id && !tab.archived
      );
      return !!current && lockedGroup(current) === wasLocked;
    }).catch((error) => setMoveMessage(String(error)));
  };
  const openPreviewPane = (pane: 'notes' | 'developer') => {
    if (preview.target?.kind !== 'session') return;
    const item = AppManager.getAll().find(
      (tab) => tab.id === preview.target?.id && !tab.archived
    );
    if (!item || lockedGroup(item)) return;
    selectGroup(item);
    setAIMounted(true);
    setAIOpen(true);
    setMenuPaneRequest((previous) => ({
      pane,
      token: (previous?.token || 0) + 1,
    }));
    closePreview();
  };
  const renderTabStrip = (paneSelected: IApp, side?: SplitSide) => {
    if (lockedGroup(paneSelected)) return null;
    const paneTabs = groupTabs(appList, paneSelected);
    const labels = smartTabLabels(
      paneTabs.map((item) => ({
        id: item.id,
        title: states[item.id]?.title || item.name,
        url: states[item.id]?.url || item.url,
        customName: item.customName,
      })),
      smartLabelsEnabled
    );
    return (
      <div
        className={`session-tab-strip ${
          side
            ? `pane-tab-strip ${split?.focused === side ? 'focused' : ''}`
            : ''
        }`}
        data-pane={side}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('.horizontal-tab')) return;
          event.preventDefault();
          event.stopPropagation();
          const archivedTabs = AppManager.getAll().filter(
            (item) =>
              item.archived &&
              groupKey(item) === groupKey(paneSelected) &&
              (item.spaceId || 'default') ===
                (paneSelected.spaceId || 'default') &&
              !lockedGroup(item)
          );
          const closedTab =
            (closedGroupUndo?.kind === 'tab' &&
              archivedTabs.find(
                (item) => item.id === closedGroupUndo.selectedId
              )) ||
            archivedTabs[archivedTabs.length - 1];
          browser
            .nativeMenu([
              { id: 'new', label: 'New Tab in This Group…' },
              {
                id: 'undo-close',
                label: 'Undo Closed Tab',
                enabled: !!closedTab,
              },
              { id: 'reload', label: 'Reload Tab' },
              { id: 'duplicate', label: 'Duplicate Tab' },
              { type: 'separator' },
              {
                id: 'close-others',
                label: 'Close Other Tabs',
                enabled: paneTabs.length > 1,
              },
              { id: 'close', label: 'Close Tab' },
            ])
            .then((choice) => {
              if (choice === 'new') {
                openGroupTab(paneSelected, side);
              }
              if (choice === 'undo-close' && closedTab) {
                const current = AppManager.getBy('id', closedTab.id);
                if (current?.archived && !lockedGroup(current)) {
                  select(AppManager.restore(current), side);
                  if (closedGroupUndo?.selectedId === current.id)
                    setClosedGroupUndo(undefined);
                }
              }
              if (choice === 'reload')
                browser.command({ id: paneSelected.id, action: 'reload' });
              if (choice === 'duplicate') duplicate(paneSelected, true);
              if (choice === 'close') closePageTab(paneSelected);
              if (choice === 'close-others') {
                const ids = new Set(
                  paneTabs
                    .filter((item) => item.id !== paneSelected.id)
                    .map((item) => item.id)
                );
                AppManager.set(
                  AppManager.getAll().map((item) =>
                    ids.has(item.id) ? { ...item, archived: true } : item
                  )
                );
              }
              return null;
            })
            .catch((error) => setMoveMessage(String(error)));
        }}
        onPointerDown={() => {
          if (side) select(paneSelected, side);
        }}
        style={
          side
            ? websiteThemeStyle(states[paneSelected.id]?.themeColor)
            : undefined
        }
        data-website-color={
          (side && !!websiteThemeStyle(states[paneSelected.id]?.themeColor)) ||
          undefined
        }
        aria-label={side ? `Tabs on ${side}` : 'Tabs in current group'}
      >
        <PageLoading
          loading={!!states[paneSelected.id]?.loading}
          title={
            paneSelected.customName ||
            states[paneSelected.id]?.title ||
            paneSelected.name
          }
        />
        <HorizontalTabList
          mode={tabOverflowMode}
          tabs={paneTabs.map((item) => ({
            id: item.id,
            title: labels.get(item.id) || item.name,
            icon: item.icon,
          }))}
          onSelect={(id) => {
            const item = paneTabs.find((tab) => tab.id === id);
            if (item) select(item, side);
          }}
          className="horizontal-tabs"
          role="tablist"
          tabIndex={-1}
          aria-label={side ? `Group tabs on ${side}` : 'Group pages'}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            const index = paneTabs.findIndex(
              (tab) => tab.id === paneSelected.id
            );
            const next =
              paneTabs[
                (index +
                  (event.key === 'ArrowRight' ? 1 : paneTabs.length - 1)) %
                  paneTabs.length
              ];
            if (next) {
              select(next, side);
              document
                .getElementById(`page-tab-${side ? `${side}-` : ''}${next.id}`)
                ?.focus();
            }
          }}
        >
          {paneTabs.map((item) => {
            const renaming =
              renameTarget?.id === item.id &&
              renameTarget.axis === 'horizontal';
            const tabState = states[item.id];
            let mediaTitle = 'Playing media · Mute site';
            let MediaIcon = Play;
            if (tabState?.audible) {
              mediaTitle = 'Playing audio · Mute site';
              MediaIcon = Volume2;
            }
            if (tabState?.muted) {
              mediaTitle = 'Site muted';
              MediaIcon = VolumeX;
            }
            const TabLabel = renaming ? 'div' : 'button';
            return (
              <ContextMenu.Root key={item.id} onOpenChange={setMenuOpen}>
                <ContextMenu.Trigger>
                  <div
                    className={`horizontal-tab ${
                      paneSelected.id === item.id ? 'active' : ''
                    } ${item.tabPinned && !renaming ? 'icon-only' : ''}`}
                    key={item.id}
                    style={websiteThemeStyle(tabState?.themeColor)}
                    data-website-color={
                      !!websiteThemeStyle(tabState?.themeColor) || undefined
                    }
                    data-tab-motion={`horizontal-${side || 'main'}-${item.id}`}
                    data-dragging={dragged?.id === item.id || undefined}
                    draggable={!renaming}
                    onDragStart={(event) =>
                      startDrag(event, item, 'horizontal')
                    }
                    onDragEnd={endWindowDrag}
                    onDragOver={(event) => {
                      if (
                        dragged ||
                        event.dataTransfer.types.includes(WINDOW_DRAG_MIME)
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        setDropTarget(item.id);
                      }
                    }}
                    onDrop={(event) => dropTab(event, item, 'horizontal')}
                    data-drop-target={dropTarget === item.id || undefined}
                  >
                    <TabLabel
                      type="button"
                      role="tab"
                      id={`page-tab-${side ? `${side}-` : ''}${item.id}`}
                      aria-controls={
                        side ? `browser-content-${side}` : 'browser-content'
                      }
                      tabIndex={paneSelected.id === item.id ? 0 : -1}
                      aria-selected={paneSelected.id === item.id}
                      aria-label={
                        item.customName || states[item.id]?.title || item.name
                      }
                      title={
                        states[item.id]?.discarded
                          ? `${
                              states[item.id]?.title || item.name
                            } — Sleeping tab, reloads when selected`
                          : states[item.id]?.title || item.name
                      }
                      className="horizontal-tab-select"
                      onClick={() => {
                        if (!renaming) select(item, side);
                      }}
                      onDoubleClick={() => rename(item, 'horizontal')}
                    >
                      {aiActivityTab === item.id ? (
                        <Sparkles
                          className="ai-tab-active"
                          size={15}
                          aria-label="AI active on this tab"
                        />
                      ) : null}
                      {aiActivityTab !== item.id &&
                        (states[item.id]?.loading ? (
                          <LoadingIcon />
                        ) : (
                          <AppIcon icon={item.icon} title={item.name} />
                        ))}
                      {renaming ? (
                        <InlineTabName
                          name={
                            item.customName ||
                            states[item.id]?.title ||
                            item.name
                          }
                          save={(name) => saveName(item, 'horizontal', name)}
                          cancel={() => setRenameTarget(undefined)}
                        />
                      ) : (
                        <span className="horizontal-tab-title">
                          {labels.get(item.id)}
                        </span>
                      )}
                    </TabLabel>
                    {(states[item.id]?.muted ||
                      states[item.id]?.audible ||
                      states[item.id]?.mediaPlaying) && (
                      <button
                        type="button"
                        className="tab-media-button"
                        aria-label={
                          states[item.id]?.muted ? 'Unmute site' : 'Mute site'
                        }
                        title={mediaTitle}
                        onClick={() =>
                          browser.command({
                            id: item.id,
                            action: 'toggle-mute',
                          })
                        }
                      >
                        <MediaIcon size={14} />
                      </button>
                    )}

                    <button
                      type="button"
                      aria-label={`Close ${item.name}`}
                      className="horizontal-tab-close"
                      onClick={() => closePageTab(item)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </ContextMenu.Trigger>
                {renderTabMenu(item, side)}
              </ContextMenu.Root>
            );
          })}
        </HorizontalTabList>
        {side && (
          <ChromeIconButton
            icon={X}
            label={`Close ${side} pane`}
            onClick={() => closeSide(side)}
          />
        )}
        <ChromeIconButton
          icon={Plus}
          className="horizontal-tab-add"
          label="New tab in current group"
          onClick={() => {
            openGroupTab(paneSelected, side);
          }}
        />
      </div>
    );
  };
  return (
    <div
      onKeyDownCapture={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'z' &&
          closedGroupUndo &&
          (event.target as HTMLElement).closest('.session-tab-strip') &&
          !(event.target as HTMLElement).closest(
            'input, textarea, [contenteditable="true"]'
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          undoCloseGroup();
        }
      }}
      className={`workspace space-${active.color} ${`${
        compact ? 'compact-sidebar' : ''
      } ${sidebarHidden ? 'hidden-sidebar' : ''}`} ${
        sidebarResizing ? 'sidebar-resizing' : ''
      } ${aiResizing ? 'ai-resizing' : ''}`}
      data-website-space={active.useWebsiteColors || undefined}
      data-glass={translucentChrome}
      data-ai-glass={translucentAI}
      data-private={windowWorkspace.state()?.private || undefined}
      style={
        {
          '--sidebar-width': `${sidebarWidth}px`,
          '--ai-sidebar-width': `${effectiveAIWidth}px`,
          ...appThemeStyle(theme),
        } as CSSProperties
      }
    >
      <aside
        ref={setSidebarBoundary}
        className="workspace-sidebar"
        id="workspace-sidebar"
        hidden={sidebarHidden}
        aria-label="Apps"
        onContextMenu={(event) => {
          if (
            (event.target as HTMLElement).closest(
              'button, input, select, textarea, .sidebar-app, .tab-folder, .space-heading, .sidebar-bottom, .sidebar-library'
            )
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          showSpaceMenu().catch((error) => setMoveMessage(String(error)));
        }}
        onDragOverCapture={(event) => {
          if (!Array.from(event.dataTransfer.types).includes('Files')) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
          setFileDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setFileDragging(false);
        }}
        onDropCapture={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          event.stopPropagation();
          setFileDragging(false);
          if (event.dataTransfer.files.length !== 1) {
            setMoveMessage('Drop one group file or project folder at a time.');
            return;
          }
          dropSidebarFile(event.dataTransfer.files[0]);
        }}
        onDragOver={(event) => {
          if (
            dragged?.axis === 'horizontal' ||
            event.dataTransfer.types.includes(WINDOW_DRAG_MIME)
          ) {
            event.preventDefault();
            setDropTarget('new-session');
          }
        }}
        onDrop={(event) => dropTab(event)}
      >
        {fileDragging && <SidebarFileDropHint />}
        {dragged?.axis === 'horizontal' && (
          <div
            className="session-drop-zone"
            data-active={dropTarget === 'new-session'}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDropTarget('new-session');
            }}
            onDrop={(event) => dropTab(event)}
          >
            Drop here to open in a new group
          </div>
        )}
        <div className="sidebar-navigation">
          <div
            className="navigation-history"
            hidden={addressBarPlacement === 'header'}
          >
            <Tooltip
              collisionBoundary={sidebarBoundary}
              collisionPadding={8}
              className="sidebar-tooltip"
              content="Back"
            >
              <IconButton
                variant="ghost"
                aria-label="Back"
                disabled={!state?.canGoBack}
                onClick={() => command('back')}
              >
                <ArrowLeft size={20} />
              </IconButton>
            </Tooltip>
            <Tooltip
              collisionBoundary={sidebarBoundary}
              collisionPadding={8}
              className="sidebar-tooltip"
              content="Forward"
            >
              <IconButton
                variant="ghost"
                aria-label="Forward"
                disabled={!state?.canGoForward}
                onClick={() => command('forward')}
              >
                <ArrowRight size={20} />
              </IconButton>
            </Tooltip>
            <div className="reload-controls">
              <Tooltip
                collisionBoundary={sidebarBoundary}
                collisionPadding={8}
                className="sidebar-tooltip"
                content={state?.loading ? 'Stop loading' : 'Reload'}
              >
                <IconButton
                  variant="ghost"
                  aria-label={state?.loading ? 'Stop loading' : 'Reload'}
                  disabled={!selected}
                  onClick={() => command(state?.loading ? 'stop' : 'reload')}
                >
                  {state?.loading ? (
                    <Square size={17} />
                  ) : (
                    <RotateCw size={20} />
                  )}
                </IconButton>
              </Tooltip>
              <Tooltip
                collisionBoundary={sidebarBoundary}
                collisionPadding={8}
                className="sidebar-tooltip"
                content="Reload options"
              >
                <IconButton
                  variant="ghost"
                  className="reload-options-button"
                  aria-label="Reload options"
                  aria-haspopup="menu"
                  disabled={!selected}
                  onClick={() => command('reload-menu')}
                >
                  <ChevronDown size={14} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
        <SidebarPager
          page={sidebarPage}
          direction={sidebarDirection}
          onSwipe={swipeSidebar}
        >
          {downloadsOpen ? (
            <div className="browser-sidebar-library">
              <div
                className="system-space-tabs"
                role="tablist"
                aria-label="System spaces"
              >
                {(['downloads', 'history', 'archive'] as const).map((tab) => (
                  <button
                    type="button"
                    role="tab"
                    key={tab}
                    id={`system-${tab}-tab`}
                    aria-controls="system-space-panel"
                    aria-selected={libraryTab === tab}
                    tabIndex={libraryTab === tab ? 0 : -1}
                    onClick={() => activateSidebarPage(libraryPages[tab])}
                    onKeyDown={(event) => {
                      if (
                        !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                          event.key
                        )
                      )
                        return;
                      event.preventDefault();
                      const tabs = ['downloads', 'history', 'archive'] as const;
                      let index =
                        (tabs.indexOf(tab) +
                          (event.key === 'ArrowLeft' ? 2 : 1)) %
                        tabs.length;
                      if (event.key === 'Home') index = 0;
                      else if (event.key === 'End') index = tabs.length - 1;
                      const next = tabs[index];
                      activateSidebarPage(libraryPages[next]);
                      requestAnimationFrame(() =>
                        document.getElementById(`system-${next}-tab`)?.focus()
                      );
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div
                id="system-space-panel"
                role="tabpanel"
                aria-labelledby={`system-${libraryTab}-tab`}
              >
                {libraryTab === 'downloads' && <Downloads embedded />}
                {libraryTab === 'archive' && <Archive embedded />}
                {libraryTab === 'history' && (
                  <History
                    navigate={(url) => {
                      command('navigate', url);
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <>
              {addressBarPlacement === 'sidebar' && renderAddressBar()}
              <nav
                className="favorites-grid"
                aria-label="Favorite groups"
                hidden={favorites.length === 0}
                data-drop-target={
                  dropTarget === 'section-favorites' || undefined
                }
                onDragOver={sectionDropProps('favorites').onDragOver}
                onDrop={sectionDropProps('favorites').onDrop}
              >
                {favorites.map(renderApp)}
              </nav>
              <div
                className="space-heading"
                data-favorite-drop={
                  dropTarget === 'section-favorites' || undefined
                }
                onDragOver={(event) => {
                  if (dragged?.axis === 'vertical')
                    sectionDropProps('favorites').onDragOver(event);
                }}
                onDrop={(event) => {
                  if (dragged?.axis === 'vertical')
                    sectionDropProps('favorites').onDrop(event);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  showSpaceMenu().catch((error) =>
                    setMoveMessage(String(error))
                  );
                }}
              >
                <button
                  type="button"
                  className="space-title-toggle"
                  aria-label={`Toggle ${active.name} space`}
                  aria-expanded={!collapsedSpaces.includes(active.id)}
                  onClick={() =>
                    setCollapsedSpaces((previous) =>
                      previous.includes(active.id)
                        ? previous.filter((id) => id !== active.id)
                        : [...previous, active.id]
                    )
                  }
                >
                  <span className="space-title-icon" aria-hidden="true">
                    <SpaceIcon space={active} />
                    <ChevronDown
                      size={15}
                      className={
                        collapsedSpaces.includes(active.id) ? 'collapsed' : ''
                      }
                    />
                  </span>
                  <span className="space-title-name">{active.name}</span>
                </button>
                <Tooltip
                  collisionBoundary={sidebarBoundary}
                  collisionPadding={8}
                  className="sidebar-tooltip"
                  content={`Customize ${active.name}`}
                >
                  <IconButton
                    className="space-title-menu"
                    size="1"
                    variant="ghost"
                    aria-label={`Space options for ${active.name}`}
                    onClick={() => {
                      showSpaceMenu().catch((error) =>
                        setMoveMessage(String(error))
                      );
                    }}
                  >
                    <MoreHorizontal size={15} />
                  </IconButton>
                </Tooltip>
              </div>
              <nav
                className="sidebar-apps"
                hidden={collapsedSpaces.includes(active.id)}
              >
                {tabGroups.length === 0 && (
                  <EmptySpaceWelcome
                    onAction={(action) => {
                      applySpaceMenuChoice(action).catch((error) =>
                        setMoveMessage(String(error))
                      );
                    }}
                  />
                )}
                <div
                  className="sidebar-section"
                  aria-label="Pinned groups"
                  data-drop-target={
                    dropTarget === 'section-pinned' || undefined
                  }
                  onDragOver={sectionDropProps('pinned').onDragOver}
                  onDrop={sectionDropProps('pinned').onDrop}
                >
                  {tabGroups
                    .filter(
                      (item) =>
                        (!showUnpinnedGroups || item.pinned !== false) &&
                        !item.folderId
                    )
                    .map(renderApp)}
                  {dragged &&
                    !tabGroups.some(
                      (item) =>
                        (!showUnpinnedGroups || item.pinned !== false) &&
                        !item.folderId
                    ) && (
                      <span className="sidebar-section-hint">Drop to pin</span>
                    )}
                </div>
                {active.folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="tab-folder"
                    onDragOver={(event) => {
                      if (dragged?.axis === 'vertical') {
                        event.preventDefault();
                        setDropTarget(folder.id);
                      }
                    }}
                    data-drop-target={dropTarget === folder.id || undefined}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const apps = AppManager.getAll();
                      const source = apps.find(
                        (item) => item.id === dragged?.id
                      );
                      if (
                        source &&
                        dragged?.axis === 'vertical' &&
                        event.dataTransfer.getData(
                          'application/x-kudiumbrowser-tab'
                        ) === source.id
                      ) {
                        AppManager.set(
                          moveGroupToFolder(apps, source, active.id, folder.id)
                        );
                      }
                      finishDrag();
                    }}
                  >
                    <ContextMenu.Root onOpenChange={setMenuOpen}>
                      <ContextMenu.Trigger>
                        <div className="folder-header">
                          <button
                            type="button"
                            className="folder-heading"
                            onMouseEnter={(event) => {
                              if (
                                folderHoverPreviews &&
                                collapsedFolders.includes(folder.id) &&
                                (previewIndex.folders.get(folder.id)?.length ||
                                  0) > 0 &&
                                !dragged &&
                                !menuOpen
                              )
                                preview.open({
                                  kind: 'folder',
                                  id: folder.id,
                                  anchor: event.currentTarget,
                                  interaction: 'hover',
                                });
                            }}
                            onMouseLeave={preview.leave}
                            aria-expanded={
                              !collapsedFolders.includes(folder.id)
                            }
                            aria-controls={`folder-content-${folder.id}`}
                            onKeyDown={(event) => {
                              if (
                                event.key === 'ArrowDown' &&
                                folderHoverPreviews &&
                                collapsedFolders.includes(folder.id) &&
                                (previewIndex.folders.get(folder.id)?.length ||
                                  0) > 0
                              ) {
                                event.preventDefault();
                                preview.open({
                                  kind: 'folder',
                                  id: folder.id,
                                  anchor: event.currentTarget,
                                  interaction: 'keyboard',
                                });
                              } else if (event.key === 'ArrowLeft') {
                                event.preventDefault();
                                setCollapsedFolders((previous) =>
                                  previous.includes(folder.id)
                                    ? previous
                                    : [...previous, folder.id]
                                );
                              } else if (event.key === 'ArrowRight') {
                                event.preventDefault();
                                if (collapsedFolders.includes(folder.id)) {
                                  setCollapsedFolders((previous) =>
                                    previous.filter((id) => id !== folder.id)
                                  );
                                } else {
                                  event.currentTarget
                                    .closest('.tab-folder')
                                    ?.querySelector<HTMLButtonElement>(
                                      '.sidebar-app'
                                    )
                                    ?.focus();
                                }
                              }
                            }}
                            onClick={() => {
                              preview.close();
                              setCollapsedFolders((previous) =>
                                previous.includes(folder.id)
                                  ? previous.filter((id) => id !== folder.id)
                                  : [...previous, folder.id]
                              );
                            }}
                          >
                            <CollectionIcon size={16} strokeWidth={1.5} />
                            <strong>{folder.name}</strong>
                          </button>
                          <ChromeIconButton
                            icon={Plus}
                            className="collection-add"
                            label={`New group in ${folder.name}`}
                            onClick={() => {
                              closePreview();
                              setNewGroupSpace(active.id);
                              setEditingGroup({
                                id: crypto.randomUUID(),
                                sessionId: crypto.randomUUID(),
                                name: '',
                                sessionName: '',
                                url: 'about:blank',
                                icon: '',
                                spaceId: active.id,
                                folderId: folder.id,
                                groupDisplay: 'folder',
                                sessionMode: 'collection',
                                pinned: true,
                              });
                            }}
                          />
                          <ContextMenu.OptionsTrigger>
                            <span className="visually-hidden">
                              Collection options for {folder.name}
                            </span>
                            <MoreHorizontal size={15} />
                          </ContextMenu.OptionsTrigger>
                        </div>
                      </ContextMenu.Trigger>
                      <ContextMenu.Content>
                        {['Copy all links', 'Copy all links as Markdown'].map(
                          (label, index) => (
                            <ContextMenu.Item
                              key={label}
                              disabled={
                                !folderLinks(
                                  appList.filter((item) => !lockedGroup(item)),
                                  active.id,
                                  folder.id
                                )
                              }
                              onSelect={() => {
                                navigator.clipboard
                                  .writeText(
                                    folderLinks(
                                      appList.filter(
                                        (item) => !lockedGroup(item)
                                      ),
                                      active.id,
                                      folder.id,
                                      index === 1
                                    )
                                  )
                                  .then(() =>
                                    setFolderFeedback({
                                      id: folder.id,
                                      text: 'Links copied',
                                    })
                                  )
                                  .catch(() =>
                                    setFolderFeedback({
                                      id: folder.id,
                                      text: 'Could not copy links. Try again.',
                                    })
                                  );
                              }}
                            >
                              {label}
                            </ContextMenu.Item>
                          )
                        )}
                        <ContextMenu.Sub>
                          <ContextMenu.SubTrigger>
                            Move to space
                          </ContextMenu.SubTrigger>
                          <ContextMenu.SubContent>
                            {spaces
                              .filter((space) => space.id !== active.id)
                              .map((space) => (
                                <ContextMenu.Item
                                  key={space.id}
                                  onSelect={() => {
                                    const moved = moveFolder(
                                      appList,
                                      spaces,
                                      active.id,
                                      folder.id,
                                      space.id
                                    );
                                    AppManager.set(moved.apps);
                                    SpaceManager.set(moved.spaces);
                                  }}
                                >
                                  {space.name}
                                </ContextMenu.Item>
                              ))}
                            {spaces.length < 2 && (
                              <ContextMenu.Item disabled>
                                No other spaces
                              </ContextMenu.Item>
                            )}
                          </ContextMenu.SubContent>
                        </ContextMenu.Sub>
                        <ContextMenu.Separator />
                        <ContextMenu.Item
                          onSelect={() => {
                            setEditingFolder(folder.id);
                            setFolderName(folder.name);
                            setFolderDialog(true);
                          }}
                        >
                          Manage collection…
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          color="red"
                          onSelect={() =>
                            setDeletingCollection({
                              id: folder.id,
                              name: folder.name,
                              spaceId: active.id,
                            })
                          }
                        >
                          Delete collection…
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Root>
                    {folderFeedback?.id === folder.id && (
                      <span className="sidebar-section-hint" role="status">
                        {folderFeedback.text}
                      </span>
                    )}
                    <div
                      id={`folder-content-${folder.id}`}
                      className="folder-content"
                      data-collapsed={collapsedFolders.includes(folder.id)}
                      aria-hidden={collapsedFolders.includes(folder.id)}
                      // React 18 types do not yet expose the native inert attribute.
                      // eslint-disable-next-line react/jsx-props-no-spreading
                      {...(collapsedFolders.includes(folder.id)
                        ? { inert: '' }
                        : {})}
                    >
                      <div className="folder-content-inner">
                        {!collapsedFolders.includes(folder.id) &&
                          (previewIndex.folders.get(folder.id) || []).map(
                            renderApp
                          )}
                      </div>
                    </div>
                  </div>
                ))}
                {(showUnpinnedGroups ||
                  windowWorkspace.state()?.kind === 'temporary') && (
                  <div className="session-list-tools">
                    <span className="list-divider" />
                    {!!tabGroups.length && (
                      <>
                        <Tooltip
                          collisionBoundary={sidebarBoundary}
                          collisionPadding={8}
                          className="sidebar-tooltip"
                          content="Sort groups by name"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              AppManager.set(
                                [...appList].sort((a, b) =>
                                  (a.sessionName || a.name).localeCompare(
                                    b.sessionName || b.name
                                  )
                                )
                              )
                            }
                          >
                            <Brush size={13} />
                            Tidy
                          </button>
                        </Tooltip>
                        {(showUnpinnedGroups ||
                          windowWorkspace.state()?.kind === 'temporary') && (
                          <Tooltip
                            collisionBoundary={sidebarBoundary}
                            collisionPadding={8}
                            className="sidebar-tooltip"
                            content="Archive unpinned groups in this space"
                          >
                            <button
                              type="button"
                              disabled={
                                !tabGroups.some((item) => item.pinned === false)
                              }
                              onClick={async () => {
                                const unpinned = new Set(
                                  tabGroups
                                    .filter((item) => item.pinned === false)
                                    .map(groupKey)
                                );
                                if (!unpinned.size) return;
                                const approved = await browser.confirm({
                                  message: 'Clear unpinned groups?',
                                  detail: `Archive ${unpinned.size} group${
                                    unpinned.size === 1 ? '' : 's'
                                  } in this space. You can restore them from Archive.`,
                                  confirm: 'Clear groups',
                                });
                                if (!approved) return;
                                AppManager.set(
                                  AppManager.getAll().map((item) =>
                                    (item.spaceId || 'default') === active.id &&
                                    unpinned.has(groupKey(item))
                                      ? { ...item, archived: true }
                                      : item
                                  )
                                );
                              }}
                            >
                              <ArrowDownToLine size={13} />
                              Clear
                            </button>
                          </Tooltip>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="sidebar-create-actions">
                  <button
                    type="button"
                    className="new-tab-button"
                    aria-label="Add tab"
                    title="Add tab"
                    onClick={() => setPaletteOpen(true)}
                  >
                    <Plus size={16} />
                    <span>Add tab</span>
                  </button>
                  <button
                    type="button"
                    className="new-tab-button"
                    aria-label="Add group"
                    title="Add group"
                    onClick={() => {
                      closePreview();
                      openNewGroup(active.id);
                    }}
                  >
                    <FolderPlus size={16} />
                    <span>Add group</span>
                  </button>
                </div>
                {(showUnpinnedGroups ||
                  windowWorkspace.state()?.kind === 'temporary') && (
                  <div
                    className="sidebar-section"
                    aria-label="Unpinned groups"
                    data-drop-target={
                      dropTarget === 'section-regular' || undefined
                    }
                    onDragOver={sectionDropProps('regular').onDragOver}
                    onDrop={sectionDropProps('regular').onDrop}
                  >
                    {tabGroups
                      .filter((item) => item.pinned === false && !item.folderId)
                      .map(renderApp)}
                    {dragged &&
                      !tabGroups.some(
                        (item) => item.pinned === false && !item.folderId
                      ) && (
                        <span className="sidebar-section-hint">
                          Drop to unpin
                        </span>
                      )}
                  </div>
                )}
              </nav>
            </>
          )}
        </SidebarPager>
        <AccountSyncPublisher tabs={appList} states={states} />
        {!windowWorkspace.state()?.private && <BrowserImportSuggestion />}
        <FirstGroupSyncSuggestion tabs={appList} />
        <AppUpdateBanner compact={compact} onWhatsNew={openWhatsNew} />
        <div
          className="sidebar-bottom"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const spaceId = (event.target as HTMLElement).closest<HTMLElement>(
              '[data-footer-space]'
            )?.dataset.footerSpace;
            showFooterMenu(spaceId).catch((error) =>
              setMoveMessage(String(error))
            );
          }}
        >
          <div
            className="system-space-switcher"
            role="group"
            aria-label="System spaces"
          >
            <Tooltip
              collisionBoundary={sidebarBoundary}
              collisionPadding={8}
              className="sidebar-tooltip"
              content={systemSpacesLabel}
            >
              <IconButton
                variant="ghost"
                aria-label={systemSpacesLabel}
                className="system-space-button"
                aria-pressed={downloadsOpen}
                onClick={() => {
                  if (downloadsOpen) activateSidebarPage(active.id);
                  else activateSidebarPage(libraryPage);
                }}
              >
                <Library size={18} />
              </IconButton>
            </Tooltip>
            {!downloadsOpen && (
              <SpaceDownloadsButton
                records={downloadRecords}
                onOpen={() => activateSidebarPage(DOWNLOADS_PAGE)}
              />
            )}
          </div>
          <div
            className="space-switcher"
            role="group"
            aria-label="Custom spaces"
          >
            {spaces.map((space) => (
              <Tooltip
                collisionBoundary={sidebarBoundary}
                collisionPadding={8}
                className="sidebar-tooltip"
                key={space.id}
                content={space.name}
              >
                <button
                  type="button"
                  className={`space-switch ${space.color} ${
                    sidebarPage === space.id ? 'active' : ''
                  }`}
                  style={
                    /^#[0-9a-f]{6}$/i.test(space.customColor || '')
                      ? { color: space.customColor }
                      : undefined
                  }
                  data-footer-space={space.id}
                  aria-label={`Switch to ${space.name}`}
                  aria-pressed={sidebarPage === space.id}
                  onClick={() => activateSidebarPage(space.id)}
                >
                  <span className="space-switch-icon" aria-hidden="true">
                    <SpaceIcon space={space} />
                  </span>
                  <span className="space-switch-dot" aria-hidden="true" />
                </button>
              </Tooltip>
            ))}
          </div>
          <Tooltip
            collisionBoundary={sidebarBoundary}
            collisionPadding={8}
            className="sidebar-tooltip"
            content="Create space"
          >
            <IconButton
              className="footer-create-space"
              variant="ghost"
              aria-label="Create space"
              onClick={openCreateSpace}
            >
              <Plus size={17} />
            </IconButton>
          </Tooltip>
        </div>
        {!compact && (
          <SidebarResizeHandle
            width={sidebarWidth}
            onChange={setSidebarWidth}
            onResizingChange={setSidebarResizing}
          />
        )}
      </aside>
      <main
        className="browser-shell"
        data-address-placement={addressBarPlacement}
      >
        <div className="browser-chrome">
          <div className="sidebar-header-control">
            {' '}
            <ContextMenu.Root>
              <ContextMenu.Trigger>
                <ChromeIconButton
                  className="sidebar-header-toggle"
                  icon={sidebarHidden ? PanelLeftOpen : PanelLeftClose}
                  label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
                  aria-expanded={!sidebarHidden}
                  aria-controls="workspace-sidebar"
                  onClick={() => setSidebarHidden((previous) => !previous)}
                />
              </ContextMenu.Trigger>
              <ContextMenu.Content>
                <ContextMenu.Item
                  disabled={!sidebarHidden && !compact}
                  onSelect={() => setCompact(false)}
                >
                  Expanded sidebar
                </ContextMenu.Item>
                <ContextMenu.Item
                  disabled={!sidebarHidden && compact}
                  onSelect={() => setCompact(true)}
                >
                  Compact sidebar
                </ContextMenu.Item>
                <ContextMenu.Item
                  disabled={sidebarHidden}
                  onSelect={() => setSidebarHidden(true)}
                >
                  Hidden sidebar
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Root>
          </div>
          {sidebarHidden && <AppUpdateBanner compact onWhatsNew={openWhatsNew} />}
          {selected && tabDisplayMode === 'horizontal' && (
            <div
              className={`pane-tab-strips ${split ? 'split-tab-strips' : ''}`}
            >
              {split
                ? (['left', 'right'] as const).map((side) => {
                    const item = appList.find(
                      (entry) => entry.id === split[side] && !entry.archived
                    );
                    return item ? (
                      <div className="pane-tabs" key={side}>
                        {renderTabStrip(item, side)}
                      </div>
                    ) : null;
                  })
                : selected && renderTabStrip(selected)}
            </div>
          )}
          {!selected && <div className="browser-drag-region" />}
          {addressBarPlacement === 'sidebar' && (
            <div
              className="browser-actions"
              role="group"
              aria-label="Browser tools"
            >
              {renderBrowserTools()}
            </div>
          )}
        </div>
        {addressBarPlacement === 'header' && (
          <div className="browser-address-header">{renderAddressBar()}</div>
        )}
        {!windowWorkspace.state()?.private && <StorageRecoveryBanner />}
        {hasStorageRecovery() && !recoveryDismissed && (
          <div className="tab-move-message" role="status">
            Some saved layout data needed recovery. Your original data is kept
            locally.
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(recoveryData())
                  .then(() => setRecoveryCopyStatus('Recovery data copied'))
                  .catch(() =>
                    setRecoveryCopyStatus('Could not copy recovery data')
                  );
              }}
            >
              {recoveryCopyStatus}
            </button>
            <button type="button" onClick={() => setRecoveryDismissed(true)}>
              Dismiss
            </button>
          </div>
        )}
        {closedGroupUndo?.kind === 'group' && (
          <div className="tab-move-message" role="status">
            Closed “{closedGroupUndo.name}”.
            <button type="button" onClick={undoCloseGroup}>
              Undo
            </button>
            <button
              type="button"
              aria-label="Dismiss undo"
              onClick={() => setClosedGroupUndo(undefined)}
            >
              Dismiss
            </button>
          </div>
        )}
        {moveMessage && (
          <div className="tab-move-message" role="status">
            {moveMessage}
            <button
              type="button"
              aria-label="Dismiss tab move message"
              onClick={() => setMoveMessage('')}
            >
              ×
            </button>
          </div>
        )}
        {findOpen && (
          <FindBar
            value={findValue}
            onChange={(value) => {
              setFindValue(value);
              command('find', value);
            }}
            onNext={() => command('find', findValue)}
            onClose={() => {
              command('find', '');
              setFindOpen(false);
            }}
            onSearchAI={(text) => {
              command('find', '');
              setFindOpen(false);
              setAIMounted(true);
              setAIOpen(true);
              setAIPromptRequest((previous) => ({
                text,
                token: (previous?.token || 0) + 1,
              }));
            }}
          />
        )}
        <div className="browser-body" ref={body}>
          <div
            ref={viewport}
            id="browser-content"
            role={selected && !split ? 'tabpanel' : undefined}
            aria-labelledby={
              selected && !split ? `page-tab-${selected.id}` : undefined
            }
            aria-busy={!split && !!state?.loading}
            className="browser-viewport"
            data-split-dragging={!!dragged || undefined}
          >
            {!split && selected && !lockedGroup(selected) && (
              <PageStatus
                state={state}
                url={selected.url}
                retry={() => command('reload')}
                back={() => command('back')}
              />
            )}
            {split && <div className="split-divider" aria-hidden="true" />}
            {split &&
              (['left', 'right'] as const).map((side) => {
                const item = appList.find((entry) => entry.id === split[side]);
                return (
                  <div
                    key={side}
                    id={`browser-content-${side}`}
                    role="tabpanel"
                    aria-busy={!!states[split[side]]?.loading}
                    aria-labelledby={`page-tab-${side}-${split[side]}`}
                    className={`split-pane-frame ${
                      split.focused === side ? 'focused' : ''
                    }`}
                    style={{ left: side === 'left' ? 0 : '50%', width: '50%' }}
                  >
                    {item && lockedGroup(item) ? (
                      <GroupAccessGate item={item}>
                        <span aria-hidden="true" />
                      </GroupAccessGate>
                    ) : (
                      <PageStatus
                        state={states[split[side]]}
                        url={item?.url || ''}
                        retry={() =>
                          browser.command({ id: split[side], action: 'reload' })
                        }
                        back={() =>
                          browser.command({ id: split[side], action: 'back' })
                        }
                      />
                    )}
                  </div>
                );
              })}
            {dragged && (
              <div className="split-drop-targets">
                {(['left', 'right'] as const).map((side) => (
                  <div
                    key={side}
                    className="split-drop-target"
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const id = event.dataTransfer.getData(
                        'application/x-kudiumbrowser-tab'
                      );
                      const item = appList.find(
                        (entry) => entry.id === id && id === dragged.id
                      );
                      if (item) openBeside(item, side);
                      finishDrag();
                    }}
                  >
                    <span>Open on {side}</span>
                  </div>
                ))}
              </div>
            )}
            {windowMirrors
              .filter(
                (frame) =>
                  appList.some(
                    (tab) => tab.id === frame.id && !lockedGroup(tab)
                  ) &&
                  !!frame.image &&
                  !states[frame.id]?.error
              )
              .map((frame) => (
                <button
                  key={frame.id}
                  type="button"
                  className="browser-window-mirror"
                  aria-label="Continue this tab in this window"
                  onClick={() => window.focus()}
                  style={{
                    left:
                      frame.x -
                      (viewport.current?.getBoundingClientRect().x || 0),
                    top:
                      frame.y -
                      (viewport.current?.getBoundingClientRect().y || 0),
                    width: frame.width,
                    height: frame.height,
                  }}
                >
                  <BrowserCaptureImage src={frame.image} alt="" />
                  <span>Continue here</span>
                </button>
              ))}
            {snapshots
              .filter((frame) => {
                const item = appList.find((tab) => tab.id === frame.id);
                return (
                  item &&
                  !!frame.image &&
                  !states[frame.id]?.error &&
                  !lockedGroup(item) &&
                  !frame.previewOnly &&
                  (split
                    ? [split.left, split.right].includes(frame.id)
                    : selected?.id === frame.id)
                );
              })
              .map((frame) => (
                <BrowserCaptureImage
                  alt=""
                  key={frame.id}
                  className="browser-snapshot"
                  data-presentation-id={frame.presentationId}
                  src={frame.image}
                  style={{
                    left:
                      frame.x -
                      (viewport.current?.getBoundingClientRect().x || 0),
                    top:
                      frame.y -
                      (viewport.current?.getBoundingClientRect().y || 0),
                    width: frame.width,
                    height: frame.height,
                  }}
                />
              ))}
            {!split && selected && lockedGroup(selected) && (
              <GroupAccessGate item={selected}>
                <span aria-hidden="true" />
              </GroupAccessGate>
            )}
            {!selected && <BrowserWelcome privateMode={windowWorkspace.state()?.private} />}
          </div>
          {aiMounted && (
            <div
              className={`ai-panel-slot ${aiOpen ? 'ai-panel-open' : ''}`}
              aria-hidden={!aiOpen}
              ref={(element) => {
                if (element && element.inert !== !aiOpen)
                  element.inert = !aiOpen;
              }}
            >
              <SidebarResizeHandle
                side="right"
                width={effectiveAIWidth}
                minWidth={240}
                maxWidth={aiMaxWidth}
                resetWidth={368}
                onChange={setAIWidth}
                onResizingChange={setAIResizing}
              />
              <AISidebar
                workingTabs={aiWorkingTabs.map((tab) => ({
                  id: tab.id,
                  name: tab.customName || states[tab.id]?.title || tab.name,
                  icon: tab.icon,
                }))}
                activeTabId={aiActivityTab}
                developerRequest={developerRequest}
                menuPaneRequest={menuPaneRequest}
                promptRequest={aiPromptRequest}
                focusedTabId={selected?.id}
                onFocusTab={(id) => {
                  const target = appList.find((item) => item.id === id);
                  if (target) {
                    setDownloadsOpen(false);
                    select(target);
                  }
                }}
                contextRequest={aiContextRequest}
                onTabContextMenu={showTabContextMenu}
                onGroupContextMenu={showGroupContextMenu}
                onManageGroup={(id) => {
                  const group = appList.find((tab) => tab.id === id);
                  if (group) setEditingGroup(group);
                }}
              />
            </div>
          )}
        </div>
      </main>
      <SiteSettingsDialog
        open={siteSettingsOpen}
        onOpenChange={setSiteSettingsOpen}
        addressBarPlacement={preferredAddressBarPlacement}
        onAddressBarPlacementChange={(placement) => {
          setAddressBarPlacement(placement);
          browser.preferences('update', { addressBarPlacement: placement })
            .catch((error) => setMoveMessage(String(error)));
        }}
        siteAutofillEnabled={!autofillExcludedSites.includes(state?.siteSettings?.origin || '')}
        onSiteAutofillChange={(enabled) => {
          const origin = state?.siteSettings?.origin;
          if (!origin?.startsWith('https:')) return;
          const next = enabled ? autofillExcludedSites.filter((site) => site !== origin) : [...new Set([...autofillExcludedSites, origin])];
          setAutofillExcludedSites(next);
          browser.preferences('update', { personalDataAutofillExcludedSites: next })
            .catch((error) => setMoveMessage(String(error)));
        }}
        fullUrl={addressBarFullUrl}
        onFullUrlChange={(enabled) => {
          setAddressBarFullUrl(enabled);
          browser.preferences('update', { addressBarFullUrl: enabled })
            .catch((error) => setMoveMessage(String(error)));
        }}
        state={state || undefined}
        command={browser.command}
        onCapture={(mode) => {
          if (state) {
            setSiteSettingsOpen(false);
            setPageCapture({ tabId: state.id, mode });
          }
        }}
      />
      {pageCapture && (
        <PageCaptureDialog
          tabId={pageCapture.tabId}
          mode={pageCapture.mode}
          onClose={() => setPageCapture(undefined)}
        />
      )}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={(open) => {
          setPaletteOpen(open);
          if (!open) setPaletteGroup(undefined);
        }}
        initialGroup={paletteGroup}
        apps={appList.filter((item) => !lockedGroup(item))}
        select={select}
        groupSource={
          selected && !lockedGroup(selected)
            ? { ...selected, url: state?.url || selected.url }
            : undefined
        }
        newSpace={openCreateSpace}
      />
      <Dialog.Root
        open={!!favoriteRename}
        onOpenChange={(open) => {
          if (!open) setFavoriteRename(undefined);
        }}
      >
        <Dialog.Content className="favorite-rename-dialog" maxWidth="380px">
          <Dialog.Title>Rename favorite</Dialog.Title>
          <Dialog.Description size="2">
            Choose a name for this group.
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (favoriteRename && favoriteName.trim()) {
                saveName(favoriteRename, 'vertical', favoriteName.trim());
                setFavoriteRename(undefined);
              }
            }}
          >
            <TextField.Root
              aria-label="Favorite name"
              value={favoriteName}
              onChange={(event) => setFavoriteName(event.target.value)}
              autoFocus
              maxLength={120}
            />
            <div className="shortcut-controls" style={{ marginTop: 16 }}>
              <Dialog.Close>
                <Button type="button" variant="soft">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!favoriteName.trim()}>
                Save
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>
      <Dialog.Root
        open={!!editingGroup}
        onOpenChange={(open) => {
          if (!open) {
            setEditingGroup(undefined);
            setNewGroupSpace(undefined);
            setDroppedProject(undefined);
          }
        }}
      >
        <Dialog.Content className="session-settings-dialog" maxWidth="540px">
          <PanelDialogHeader
            title={
              newGroupSpace
                ? 'New group'
                : (groupPersonalData && 'Personal Data') || 'Group settings'
            }
            actions={
              <Dialog.Close>
                <IconButton
                  variant="ghost"
                  color="gray"
                  aria-label="Close group settings"
                >
                  <X size={17} />
                </IconButton>
              </Dialog.Close>
            }
          />
          <Dialog.Description size="2" className="group-settings-description">
            {groupPersonalData
              ? 'Saved details for this group.'
              : 'Your workspace, pages and project.'}
          </Dialog.Description>
          {editingGroup && (
            <GroupEditor
              key={editingGroup.id}
              onPersonalDataChange={setGroupPersonalData}
              item={editingGroup}
              creating={!!newGroupSpace}
              droppedProject={droppedProject}
              onCreated={(tab) => {
                setNewGroupSpace(undefined);
                setDroppedProject(undefined);
                setEditingGroup(tab);
                select(tab);
              }}
              close={() => {
                setEditingGroup(undefined);
                setNewGroupSpace(undefined);
                setDroppedProject(undefined);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Root>
      <Dialog.Root open={spaceDialog} onOpenChange={setSpaceDialog}>
        <Dialog.Content maxWidth="420px" className="space-settings-dialog">
          <Dialog.Title>
            {editingSpace ? 'Customize Space' : 'New Space'}
          </Dialog.Title>
          <Dialog.Description className="space-settings-description">
            {editingSpace
              ? 'Make this space feel like yours.'
              : 'A separate space for work, life or a project.'}
          </Dialog.Description>
          <SpaceSettingsForm
            creating={!editingSpace}
            onPreferences={
              editingSpace
                ? () => {
                    browser
                      .preferences('open', { section: 'spaces' })
                      .catch((error) => setMoveMessage(String(error)));
                  }
                : undefined
            }
            value={{
              name: spaceName,
              icon: spaceIcon,
              color: spaceColor,
              iconImage: spaceIconImage,
              iconEmoji: spaceEmoji,
              customColor: spaceCustomColor,
              frameColor: spaceFrameTint,
              useWebsiteColors: spaceUseWebsiteColors,
            }}
            onChange={(patch) => {
              if (patch.useWebsiteColors !== undefined)
                setSpaceUseWebsiteColors(patch.useWebsiteColors);
              if (patch.name !== undefined) setSpaceName(patch.name);
              if (patch.icon) setSpaceIcon(patch.icon);
              if (patch.color) setSpaceColor(patch.color);
              if ('iconImage' in patch)
                setSpaceIconImage(patch.iconImage || '');
              if ('iconEmoji' in patch) setSpaceEmoji(patch.iconEmoji || '');
              if ('frameColor' in patch)
                setSpaceFrameTint(patch.frameColor || '');
              if ('customColor' in patch)
                setSpaceCustomColor(patch.customColor || '');
            }}
            onCancel={() => setSpaceDialog(false)}
            onSave={() => {
              if (spaceName.trim()) {
                const targetId =
                  editingSpace ||
                  SpaceManager.add(spaceName, spaceColor, spaceIcon).id;
                SpaceManager.update(targetId, {
                  name: spaceName.trim(),
                  color: spaceColor,
                  icon: spaceIcon,
                  iconImage: spaceIconImage || undefined,
                  iconEmoji: spaceEmoji || undefined,
                  customColor: spaceCustomColor || undefined,
                  frameColor: spaceFrameTint || undefined,
                  useWebsiteColors: spaceUseWebsiteColors,
                });
                setSpaceName('');
                setSpaceDialog(false);
              }
            }}
          />
        </Dialog.Content>
      </Dialog.Root>
      {tabSwitcher.shown && (
        <TabSwitcher
          tabs={tabSwitcher.shown.tabs.filter((tab) =>
            switchableTabs.some((item) => item.id === tab.id)
          )}
          selectedId={tabSwitcher.shown.tabs[tabSwitcher.shown.index]?.id}
          snapshots={snapshots}
          onSelect={(tab) => {
            tabSwitcher.finish(false);
            select(tab);
          }}
          onCancel={() => tabSwitcher.finish(false)}
        />
      )}
      {preview.target && previewItems.length > 0 && (
        <AnchoredTabPreview
          glass={translucentChrome}
          key={`${preview.target.kind}:${preview.target.id}`}
          target={preview.target}
          title={
            preview.target.kind === 'folder'
              ? active.folders.find(
                  (folder) => folder.id === preview.target?.id
                )?.name || 'Collection'
              : previewIndex.byId.get(preview.target.id)?.sessionName ||
                'Group tabs'
          }
          subtitle={
            preview.target.kind === 'session'
              ? previewIndex.byId.get(preview.target.id)?.sessionSlug
              : undefined
          }
          icon={
            preview.target.kind === 'session'
              ? previewIndex.byId.get(preview.target.id)?.sessionIconImage ||
                previewIndex.byId.get(preview.target.id)?.icon
              : undefined
          }
          group={
            preview.target.kind === 'session'
              ? previewIndex.byId.get(preview.target.id)
              : undefined
          }
          onSelectGroup={
            preview.target.kind === 'session'
              ? () => {
                  if (!preview.target) return;
                  const item = previewIndex.byId.get(preview.target.id);
                  if (!item) return;
                  addToAI({ kind: 'group', id: aiGroupId(item) }, 'scope');
                  closePreview();
                }
              : undefined
          }
          onToggleFavorite={
            preview.target.kind === 'session'
              ? () => {
                  if (!preview.target) return;
                  const item = AppManager.getAll().find(
                    (tab) => tab.id === preview.target?.id && !tab.archived
                  );
                  if (!item || lockedGroup(item)) return;
                  AppManager.set(
                    moveGroupToSection(
                      AppManager.getAll(),
                      item.id,
                      item.favorite ? 'pinned' : 'favorites',
                      item.spaceId || 'default'
                    )
                  );
                  closePreview();
                }
              : undefined
          }
          onNotes={
            preview.target.kind === 'session'
              ? () => openPreviewPane('notes')
              : undefined
          }
          onDeveloper={
            preview.target.kind === 'session'
              ? () => openPreviewPane('developer')
              : undefined
          }
          onEntryContextMenu={(id) => {
            const item = previewIndex.byId.get(id);
            if (!item) return;
            const isCollection = preview.target?.kind === 'folder';
            closePreview();
            if (isCollection) showGroupContextMenu(aiGroupId(item));
            else showTabContextMenu(id, false);
          }}
          onGroupContextMenu={
            preview.target.kind === 'session'
              ? () => {
                  if (!preview.target) return;
                  const item = previewIndex.byId.get(preview.target.id);
                  if (!item) return;
                  closePreview();
                  showGroupContextMenu(aiGroupId(item));
                }
              : undefined
          }
          tabs={appList}
          entries={previewEntries}
          selectedId={
            preview.target.kind === 'folder'
              ? tabGroups.find(
                  (item) => selected && groupKey(item) === groupKey(selected)
                )?.id || ''
              : selected?.id || ''
          }
          onEnter={preview.cancel}
          onLeave={preview.leave}
          onClose={preview.close}
          onBack={() => {
            if (preview.target?.parentFolder)
              preview.open({
                ...preview.target,
                kind: 'folder',
                id: preview.target.parentFolder,
                parentFolder: undefined,
                interaction: 'click',
              });
          }}
          onNewTab={() => {
            const item =
              preview.target && previewIndex.byId.get(preview.target.id);
            if (item) openGroupTab(item);
          }}
          onRemove={(id) => {
            const item = previewIndex.byId.get(id);
            if (item) AppManager.update('id', id, { ...item, archived: true });
          }}
          onSelect={(id) => {
            const item = previewIndex.byId.get(id);
            if (!item) return;
            if (preview.target?.kind === 'folder') {
              selectGroup(item);
              if (
                tabDisplayMode !== 'horizontal' &&
                tabsForPreview(item).length > 1
              ) {
                preview.open({
                  ...preview.target,
                  kind: 'session',
                  id: item.id,
                  parentFolder: preview.target.id,
                  interaction: 'click',
                });
                return;
              }
            } else select(item);
            preview.close();
          }}
        />
      )}
      <Dialog.Root
        open={!!deletingCollection}
        onOpenChange={(open) => {
          if (!open) setDeletingCollection(undefined);
        }}
      >
        <Dialog.Content maxWidth="480px">
          <Dialog.Title>Delete {deletingCollection?.name}?</Dialog.Title>
          <Dialog.Description>
            Keep the groups in the sidebar, or delete the collection and all its
            saved groups and tabs, including archived tabs. Deleting them cannot
            be undone.
          </Dialog.Description>
          <div className="collection-delete-actions">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button variant="soft" onClick={() => deleteCollection(false)}>
              Keep groups
            </Button>
            <Button color="red" onClick={() => deleteCollection(true)}>
              Delete everything
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
      <Dialog.Root open={folderDialog} onOpenChange={setFolderDialog}>
        <Dialog.Content maxWidth={editingFolder ? '560px' : '420px'}>
          <Dialog.Title>
            {editingFolder ? 'Manage collection' : 'New collection'}
          </Dialog.Title>
          <Dialog.Description>
            Group related tabs in {active.name}.
          </Dialog.Description>
          <form
            className="tab-content"
            onSubmit={(event) => {
              event.preventDefault();
              if (folderName.trim()) {
                SpaceManager.update(active.id, {
                  folders: editingFolder
                    ? active.folders.map((folder) =>
                        folder.id === editingFolder
                          ? { ...folder, name: folderName.trim() }
                          : folder
                      )
                    : [
                        ...active.folders,
                        { id: crypto.randomUUID(), name: folderName.trim() },
                      ],
                });
                setFolderName('');
                setFolderDialog(false);
              }
            }}
          >
            <TextField.Root
              required
              autoFocus
              aria-label="Collection name"
              placeholder="Project name…"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
            />
            <Button type="submit">
              {editingFolder ? 'Save collection' : 'Create collection'}
            </Button>
            {editingFolder && (
              <section
                className="collection-management-groups"
                aria-label="Collection groups"
              >
                <Heading size="3">Groups</Heading>
                <Text size="2" color="gray">
                  Choose each group’s presentation or open its settings to
                  customise its tabs and sessions.
                </Text>
                {(previewIndex.folders.get(editingFolder) || []).map((item) => (
                  <div className="collection-management-group" key={item.id}>
                    <GroupIcon item={item} tabs={appList} />
                    <strong>{item.sessionName || item.name}</strong>
                    <Button
                      type="button"
                      size="1"
                      variant="soft"
                      onClick={() => {
                        AppManager.set(
                          AppManager.getAll().map((tab) =>
                            (tab.spaceId || 'default') ===
                              (item.spaceId || 'default') &&
                            groupKey(tab) === groupKey(item)
                              ? {
                                  ...tab,
                                  groupDisplay:
                                    item.groupDisplay === 'folder'
                                      ? 'stack'
                                      : 'folder',
                                }
                              : tab
                          )
                        );
                      }}
                    >
                      {item.groupDisplay === 'folder'
                        ? 'Show as stack'
                        : 'Show as folder'}
                    </Button>
                    <Button
                      type="button"
                      size="1"
                      variant="ghost"
                      onClick={() => {
                        setFolderDialog(false);
                        setEditingGroup(item);
                      }}
                    >
                      Manage group
                    </Button>
                  </div>
                ))}
                {!(previewIndex.folders.get(editingFolder) || []).length && (
                  <Text size="2" color="gray">
                    No groups yet. Use the collection’s plus button to add one.
                  </Text>
                )}
                <Button
                  type="button"
                  color="red"
                  variant="soft"
                  onClick={() => {
                    const collection = active.folders.find(
                      (folder) => folder.id === editingFolder
                    );
                    if (collection)
                      setDeletingCollection({
                        ...collection,
                        spaceId: active.id,
                      });
                  }}
                >
                  Delete collection…
                </Button>
              </section>
            )}
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
