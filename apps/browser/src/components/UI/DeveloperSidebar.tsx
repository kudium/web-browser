/* Optional interaction callbacks use parameter defaults. */
/* eslint-disable react/require-default-props */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Search,
  Settings2,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Play,
} from 'lucide-react';
import { TextField, IconButton, Switch } from '@radix-ui/themes';
import { HookIcon } from './HookIcon';
import { AppIcon } from './AppIcon/AppIcon';
import { AssistantPageHeader } from './AssistantPageHeader';
import { GroupPicker } from './GroupPicker';
import { useAppList } from '../../utils/hooks/useAppList';
import { ScreenManager } from '../../utils/AppManager';
import { lockedGroup, useGroupAccess } from '../../utils/groupAccess';
import { aiGroupId } from '../../browser/aiGroups';
import { browser } from '../../browser/client';
import { developerPagesStore } from '../../browser/developerPagesStore';
import { DeveloperProjectSection } from './DeveloperProjectSection';
import { DeveloperTerminal } from './DeveloperTerminal';
import { projectErrorMessage } from '../../browser/developerProject';

export function DeveloperSidebar({
  active,
  focusedTabId,
  onFocusTab,
  onTabContextMenu,
  onGroupContextMenu,
  onManageGroup,
}: {
  active: boolean;
  focusedTabId?: string;
  onFocusTab?: (id: string) => void;
  onTabContextMenu?: (id: string) => void;
  onGroupContextMenu?: (id: string) => void;
  onManageGroup?: (id: string) => void;
}) {
  const { appList } = useAppList();
  const access = useGroupAccess();
  const tabsById = useMemo(
    () => new Map(appList.map((tab) => [tab.id, tab])),
    [appList]
  );
  const options = useMemo(() => {
    const seen = new Set<string>();
    return appList
      .filter((tab) => {
        const id = aiGroupId(tab);
        if (tab.archived || lockedGroup(tab, access) || seen.has(id))
          return false;
        seen.add(id);
        return true;
      })
      .map((tab) => ({
        id: aiGroupId(tab),
        name: tab.sessionName || tab.name,
        detail: `@${tab.sessionSlug || ''}`,
        group: tab,
      }));
  }, [appList, access]);
  const [selected, setSelected] = useState(() => {
    const focused = appList.find(
      (tab) => tab.id === ScreenManager.getLastAppId()
    );
    return focused ? aiGroupId(focused) : '';
  });
  const focused = appList.find(
    (tab) => tab.id === (focusedTabId ?? ScreenManager.getLastAppId())
  );
  const selectedGroup = focused ? aiGroupId(focused) : selected;
  const source = options.find((option) => option.id === selectedGroup)?.group;
  const [views, setViews] = useState<Record<string, 'pages' | 'files'>>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('kudiumbrowser.developer.views') || '{}'
      );
      return Object.fromEntries(
        Object.entries(saved).filter(
          ([, value]) => value === 'pages' || value === 'files'
        )
      ) as Record<string, 'pages' | 'files'>;
    } catch {
      return {};
    }
  });
  const view = views[selectedGroup] || 'pages';
  const selectView = (next: 'pages' | 'files') => {
    const updated = { ...views, [selectedGroup]: next };
    setViews(updated);
    try {
      localStorage.setItem(
        'kudiumbrowser.developer.views',
        JSON.stringify(updated)
      );
    } catch {
      /* Keep the view usable if storage is unavailable. */
    }
  };
  const pageSourceId = source?.id || '';
  const pageSnapshot = useSyncExternalStore(
    useMemo(
      () => (listener: () => void) =>
        developerPagesStore.subscribe(pageSourceId, listener),
      [pageSourceId]
    ),
    () => developerPagesStore.getSnapshot(pageSourceId)
  );
  const { pages, loading } = pageSnapshot;
  const error = pageSnapshot.error
    ? projectErrorMessage(pageSnapshot.error)
    : '';
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pendingHook = useRef<{ pageId: string; hookId: string; name: string; acknowledged?: boolean } | undefined>(undefined);
  const [hookFeedback, setHookFeedback] = useState('');
  useEffect(() => browser.onState((state) => {
    const pending = pendingHook.current;
    if (!pending || state.id !== pending.pageId) return;
    const developer = state.siteSettings?.developer;
    const status = developer?.hookStatuses?.[pending.hookId];
    if (status === 'running') pending.acknowledged = true;
    if (status === 'success' || status === 'error') {
      const detail = status === 'error' ? developer?.logs.slice().reverse().find((log) => log.level === 'error' && log.hookId === pending.hookId)?.message : undefined;
      setHookFeedback(`${pending.name}: ${status === 'success' ? 'Completed successfully' : detail || 'Failed'}`);
      pendingHook.current = undefined;
    }
  }), []);
  useEffect(() => {
    const pending = pendingHook.current;
    if (!pending) return undefined;
    const timer = setTimeout(() => {
      if (pendingHook.current !== pending || pending.acknowledged) return;
      pendingHook.current = undefined;
      setHookFeedback(`${pending.name}: No response from the hook runtime. Reopen this tab to load the updated runtime.`);
    }, 5000);
    return () => clearTimeout(timer);
  }, [hookFeedback]);
  const [shortcutError, setShortcutError] = useState('');
  const [terminalRequest, setTerminalRequest] = useState({
    group: '',
    count: 0,
  });
  const [terminalReset, setTerminalReset] = useState(0);
  const hideTerminal = () => {
    window.electron.siteDeveloper
      .terminal(selectedGroup, { action: 'preferences', open: false })
      .catch(() => {})
      .finally(() => setTerminalReset((value) => value + 1))
      .catch(() => {});
    setTerminalRequest({ group: '', count: 0 });
  };
  useEffect(() => {
    if (!source || !active || view !== 'pages') return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      developerPagesStore.refresh(source.id);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    };
    refresh();
    const pagesInGroup = new Set(
      appList
        .filter((tab) => aiGroupId(tab) === aiGroupId(source))
        .map((tab) => tab.id)
    );
    const offState = browser.onState((state) => {
      if (pagesInGroup.has(state.id)) schedule();
    });
    const offChanges = window.electron.siteDeveloper.onPagesChanged(schedule);
    window.addEventListener('focus', schedule);
    return () => {
      clearTimeout(timer);
      offState();
      offChanges();
      window.removeEventListener('focus', schedule);
    };
  }, [source, appList, active, view]);
  useEffect(() => setQuery(''), [selectedGroup]);
  const showSearch = pages.length > 5;
  useEffect(() => {
    if (!showSearch) setQuery('');
  }, [showSearch]);
  const matches = pages.filter((page) =>
    `${page.name} ${page.url} ${(page.hooks || [])
      .map((hook) => `${hook.name} ${hook.path}`)
      .join(' ')}`
      .toLocaleLowerCase()
      .includes(showSearch ? query.toLocaleLowerCase() : '')
  );
  return (
    <section
      hidden={!active}
      className="developer-sidebar"
      id="ai-developer-panel"
      aria-label="Developer"
    >
      <AssistantPageHeader className="developer-sidebar-toolbar">
        <GroupPicker
          options={options}
          value={source ? selectedGroup : ''}
          onChange={(id) => {
            setSelected(id);
            const target = options.find((option) => option.id === id)?.group;
            if (target) onFocusTab?.(target.id);
            setQuery('');
          }}
          label="Developer group"
          onContextMenu={onGroupContextMenu}
          disabled={!options.length}
        />
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          aria-label="Manage developer group"
          title="Manage group"
          disabled={!source || !onManageGroup}
          onClick={() => source && onManageGroup?.(source.id)}
        >
          <Settings2 size={16} />
        </IconButton>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          aria-label="Global hooks"
          title="Global hooks"
          onClick={() => {
            setShortcutError('');
            browser
              .preferences('open', { section: 'hooks' })
              .catch((reason) =>
                setShortcutError(String(reason).replace(/^Error: /, ''))
              );
          }}
        >
          <HookIcon size={16} aria-hidden="true" />
        </IconButton>
      </AssistantPageHeader>
      {shortcutError && <p role="alert">{shortcutError}</p>}
      <div className="developer-sidebar-pages" aria-busy={loading && !!source}>
        {!source ? (
          <div className="developer-sidebar-empty">
            <HookIcon size={24} />
            <h3>Manage site hooks</h3>
            <p>
              {options.length
                ? 'Choose a group to see its pages and scripts.'
                : 'Create or unlock a group to manage its scripts.'}
            </p>
          </div>
        ) : (
          <>
            <DeveloperProjectSection
              key={source.id}
              sourceId={source.id}
              active={active}
              view={view}
              onViewChange={selectView}
              onOpenTerminal={() =>
                setTerminalRequest((value) => ({
                  group: selectedGroup,
                  count: value.count + 1,
                }))
              }
              onProjectChange={hideTerminal}
            />
            <div
              hidden={view !== 'pages'}
              className="developer-pages-view"
              aria-label="Group pages"
            >
              {showSearch && (
                <TextField.Root
                  placeholder="Search pages…"
                  aria-label="Search developer pages"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                >
                  <TextField.Slot>
                    <Search size={14} />
                  </TextField.Slot>
                </TextField.Root>
              )}
              {error && <p role="alert">{error}</p>}
              {loading && (
                <p className="developer-sidebar-feedback">Loading pages…</p>
              )}
              {!loading && !error && (
                <p className="developer-sidebar-count">
                  {pages.length} {pages.length === 1 ? 'page' : 'pages'} ·{' '}
                  {pages.filter((page) => page.hasHooks && page.enabled).length}{' '}
                  with active hooks
                </p>
              )}
              {matches.slice(0, 100).map((page) => {
                const tab = tabsById.get(page.id);
                let domain = page.url;
                try {
                  domain = new URL(page.url).hostname || page.url;
                } catch {
                  /* Keep labels for internal pages. */
                }
                const hasHookItems = !!page.hooks?.length;
                const open = expanded[page.id] ?? false;
                const editHook = (hookId: string) =>
                  browser.command({
                    id: page.id,
                    action: 'open-site-developer',
                    url: page.origin,
                    hookId,
                  });
                return (
                  <div
                    key={page.id}
                    className="developer-page-card"
                    data-active={page.id === focused?.id ? 'true' : undefined}
                  >
                    <div className="developer-page-heading">
                      <button
                        type="button"
                        className="developer-sidebar-page"
                        onContextMenu={(event) => {
                          if (!tab || !onTabContextMenu) return;
                          event.preventDefault();
                          event.stopPropagation();
                          onTabContextMenu(tab.id);
                        }}
                        onKeyDown={(event) => {
                          if (
                            tab &&
                            onTabContextMenu &&
                            (event.key === 'ContextMenu' ||
                              (event.shiftKey && event.key === 'F10'))
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            onTabContextMenu(tab.id);
                          }
                        }}
                        disabled={!onFocusTab && !page.origin}
                        aria-label={`Focus tab ${page.name}`}
                        aria-current={page.id === focused?.id ? 'page' : undefined}
                        title={`Focus ${page.name}`}
                        onClick={() => onFocusTab?.(page.id)}
                      >
                        <span
                          className="developer-page-icon"
                          aria-hidden="true"
                        >
                          <AppIcon icon={tab?.icon || ''} title="" />
                        </span>
                        <span className="developer-sidebar-page-copy">
                          <strong>{page.name}</strong>
                          <span className="developer-page-details">
                            <span
                              className="developer-page-hook-count"
                              data-state={hasHookItems ? 'success' : 'empty'}
                              title={
                                page.status === 'error'
                                  ? 'Hook error: open the editor for details'
                                  : 'Saved hooks'
                              }
                            >
                              <HookIcon size={10} aria-hidden="true" />
                              {page.hooks?.length || 0}{' '}
                              {page.hooks?.length === 1 ? 'hook' : 'hooks'}
                              {page.status === 'error' ? ' · Error' : ''}
                            </span>
                            <small title={page.url}>{domain}</small>
                          </span>
                        </span>
                      </button>
                      {hasHookItems && (
                        <button
                          type="button"
                          className="developer-page-expand"
                          aria-label={`${open ? 'Collapse' : 'Expand'} hooks for ${page.name}`}
                          aria-expanded={open}
                          onClick={() => setExpanded((previous) => ({
                            ...previous,
                            [page.id]: !open,
                          }))}
                        >
                          {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                        </button>
                      )}
                      <button
                        type="button"
                        className="developer-page-add-hook"
                        title="Add hook"
                        disabled={
                          !page.origin ||
                          (page.hooks?.filter((hook) => hook.id).length || 0) >=
                            20
                        }
                        onClick={() => editHook('__new__')}
                        aria-label={`Add hook for ${page.name}`}
                      >
                        <Plus size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="developer-page-manage"
                        disabled={!page.origin}
                        aria-label={`Open hook developer for ${page.name}`}
                        title="Manage site hooks"
                        onClick={() =>
                          browser.command({
                            id: page.id,
                            action: 'open-site-developer',
                            url: page.origin,
                          })
                        }
                      >
                        <Settings2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                    {open && hasHookItems && page.origin && (
                      <ul
                        className="developer-page-hooks"
                        aria-label={`Hooks for ${page.name}`}
                      >
                        {(page.hooks || []).map((hook) => {
                          const status = pendingHook.current?.pageId === page.id && pendingHook.current?.hookId === hook.id ? 'running' : hook.status;
                          return (
                          <li key={hook.id} className="developer-page-hook-row">
                            <button
                              type="button"
                              className="developer-page-hook-link"
                              title={`${hook.name} · ${hook.path}`}
                              aria-label={`Edit ${hook.name} for ${page.name}`}
                              onClick={() => editHook(hook.id)}
                            >
                              <HookIcon size={12} aria-hidden="true" />
                              <span className="developer-page-hook-name">
                                {hook.name.trim() || 'Untitled hook'}
                              </span>
                            </button>
                            <span
                              className="developer-hook-status"
                              data-status={hook.enabled ? status || 'waiting' : 'disabled'}
                              role="status"
                              aria-label={`${hook.name}: ${!hook.enabled ? 'Disabled' : status === 'running' ? 'Running' : status === 'success' ? 'Success' : status === 'error' ? 'Failed' : 'Waiting'}`}
                              title={!hook.enabled ? 'Disabled' : status === 'running' ? 'Running' : status === 'success' ? 'Success' : status === 'error' ? 'Failed' : 'Waiting'}
                            >
                              <span className="developer-hook-status-dot" aria-hidden="true" />
                              <span>{!hook.enabled ? 'Disabled' : status === 'running' ? 'Running' : status === 'success' ? 'Success' : status === 'error' ? 'Failed' : 'Waiting'}</span>
                            </span>
                            <Switch
                              size="1"
                              checked={hook.enabled}
                              aria-label={`Enable ${hook.name} for ${page.name}`}
                              onCheckedChange={() =>
                                browser.command({
                                  id: page.id,
                                  action: 'toggle-site-hook',
                                  url: page.origin,
                                  hookId: hook.id,
                                })
                              }
                            />
                            <IconButton
                              size="1"
                              variant="ghost"
                              color="gray"
                              disabled={!hook.enabled || status === 'running'}
                              aria-label={`Run ${hook.name} for ${page.name}`}
                              title="Run hook again without reloading"
                              onClick={() => {
                                pendingHook.current = { pageId: page.id, hookId: hook.id, name: hook.name };
                                setHookFeedback(`${hook.name}: Running…`);
                                browser.command({ id: page.id, action: 'run-site-hook', url: page.origin, hookId: hook.id });
                              }}
                            >
                              <Play size={12} />
                            </IconButton>
                            <IconButton
                              size="1"
                              variant="ghost"
                              color="gray"
                              aria-label={`Open editor for ${hook.name}`}
                              onClick={() => editHook(hook.id)}
                            >
                              <Pencil size={12} />
                            </IconButton>
                          </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
              {!loading && !error && !matches.length && (
                <p className="developer-sidebar-feedback">No matching pages.</p>
              )}
              {matches.length > 100 && (
                <p className="developer-sidebar-feedback">
                  Showing 100 of {matches.length}. Refine your search.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {source && (
        <DeveloperTerminal
          key={`${selectedGroup}-${terminalReset}`}
          openRequest={
            terminalRequest.group === selectedGroup ? terminalRequest.count : 0
          }
          group={selectedGroup}
          active={active}
        />
      )}
    </section>
  );
}
