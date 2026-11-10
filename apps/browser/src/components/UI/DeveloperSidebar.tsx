/* Optional interaction callbacks use parameter defaults. */
/* eslint-disable react/require-default-props */
import { useEffect, useMemo, useState } from 'react';
import { Code2, Search, Settings2 } from 'lucide-react';
import { TextField, IconButton } from '@radix-ui/themes';
import { AssistantPageHeader } from './AssistantPageHeader';
import { GroupPicker } from './GroupPicker';
import { useAppList } from '../../utils/hooks/useAppList';
import { ScreenManager } from '../../utils/AppManager';
import { lockedGroup, useGroupAccess } from '../../utils/groupAccess';
import { aiGroupId } from '../../browser/aiGroups';
import { browser } from '../../browser/client';
import type { SiteDeveloperPageSummary } from '../../browser/siteDeveloper';
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
  const [pages, setPages] = useState<SiteDeveloperPageSummary[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
    if (!active || !source) return undefined;
    let live = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout>;
    setPages([]);
    setError('');
    setLoading(true);
    const refresh = () => {
      revision += 1;
      const request = revision;
      window.electron.siteDeveloper
        .pages(source.id)
        .then((value) => {
          if (live && request === revision) {
            setPages(value);
            setError('');
            setLoading(false);
          }
          return undefined;
        })
        .catch((reason) => {
          if (live && request === revision) {
            setError(projectErrorMessage(reason));
            setLoading(false);
          }
        });
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
      live = false;
      clearTimeout(timer);
      offState();
      offChanges();
      window.removeEventListener('focus', schedule);
    };
  }, [active, source, appList]);
  useEffect(() => setQuery(''), [selectedGroup]);
  const showSearch = pages.length > 5;
  useEffect(() => {
    if (!showSearch) setQuery('');
  }, [showSearch]);
  const matches = pages.filter((page) =>
    `${page.name} ${page.url}`
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
      </AssistantPageHeader>
      <div className="developer-sidebar-pages" aria-busy={loading && !!source}>
        {!source ? (
          <div className="developer-sidebar-empty">
            <Code2 size={24} />
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
                let hookLabel = 'No hooks';
                if (page.hasHooks)
                  hookLabel = page.enabled ? 'Hooks active' : 'Hooks disabled';
                return (
                  <button
                    key={page.id}
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
                    disabled={!page.origin}
                    aria-label={`Manage hooks for ${page.name}`}
                    title={
                      page.origin
                        ? `Edit hooks for ${page.url}`
                        : 'Open a website in this tab to add hooks'
                    }
                    onClick={() =>
                      browser.command({
                        id: page.id,
                        action: 'open-site-developer',
                        url: page.origin,
                      })
                    }
                  >
                    <span className="developer-sidebar-page-copy">
                      <strong>{page.name}</strong>
                      <small>{page.url}</small>
                      <span
                        className={`developer-hook-status ${
                          page.hasHooks && page.enabled ? 'enabled' : ''
                        }`}
                      >
                        {hookLabel}
                        {page.enabled &&
                        page.hasHooks &&
                        page.status === 'error'
                          ? ' · Error'
                          : ''}
                      </span>
                      {page.origin && (
                        <span className="developer-hook-hint">
                          {page.hasHooks
                            ? 'Click to edit hooks'
                            : 'Click to add hook'}
                        </span>
                      )}
                    </span>
                  </button>
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
