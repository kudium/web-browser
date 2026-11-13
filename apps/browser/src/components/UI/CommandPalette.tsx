import { Dialog, Kbd, TextField, Text } from '@radix-ui/themes';
import {
  Globe2,
  Layers,
  Plus,
  Search,
  Settings2,
  Blocks,
  ArrowUpRight,
  ArrowLeft,
  X,
  Tag,
  History,
} from 'lucide-react';
import { useEffect, useState, useRef, useMemo, ReactNode } from 'react';
import { CollectionIcon } from './CollectionIcon';
import {
  SearchEngine,
  matchSearchEngines,
  searchUrl,
  validateSearchEngines,
} from '../../browser/searchEngines';
import {
  groupKey,
  groupTabs,
  isGroupHomeTab,
  loginProfileKey,
} from '../../utils/groups';
import { resolveAddress, cachedSearchEngines } from '../../utils/navigation';
import { commandDestination } from '../../utils/commandNavigation';
import { IApp } from '../../types';
import { AppManager } from '../../utils/AppManager';
import { SpaceManager, useSpaces } from '../../utils/SpaceManager';
import { browser } from '../../browser/client';
import { SpaceIcon } from './SpaceIcon';
import { AppIcon } from './AppIcon/AppIcon';
import { GroupIcon } from './GroupIcon';
import { lockedGroup, useGroupAccess } from '../../utils/groupAccess';
import type { HistoryRecord } from '../../browser/history';
import { historySuggestions } from '../../utils/historySuggestions';

interface CommandResult {
  id: string;
  title: string;
  detail: string;
  icon: ReactNode;
  run: () => void;
  engine?: SearchEngine;
  group?: IApp;
}
export function CommandPalette({
  open,
  onOpenChange,
  apps,
  select,
  groupSource,
  initialGroup = undefined,
  newSpace,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  apps: IApp[];
  select: (app: IApp) => void;
  groupSource: IApp | undefined;
  // eslint-disable-next-line react/require-default-props -- Defaults to undefined for ordinary command-bar entry.
  initialGroup?: IApp;
  newSpace: () => void;
}) {
  const [query, setQuery] = useState('');
  const [tagScope, setTagScope] = useState<string | null>(null);
  const [groupScope, setGroupScope] = useState<IApp | null>(null);
  const sourceGroup = groupScope || groupSource;
  const searchInput = useRef<HTMLInputElement>(null);
  const [engines, setEngines] = useState(cachedSearchEngines);
  const [searchScope, setSearchScope] = useState<SearchEngine | null>(null);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState(false);
  const openInNewGroup = !groupScope && (fresh || !groupSource);
  const [activeResult, setActiveResult] = useState(0);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const access = useGroupAccess();
  const { spaces, active } = useSpaces();
  useEffect(
    () =>
      browser.onShortcut((action) => {
        if (action === 'new-session') setFresh(true);
      }),
    []
  );
  useEffect(() => {
    if (!open) {
      setHistory([]);
      return undefined;
    }
    let live = true;
    let changed = false;
    const stop = browser.onHistory((records) => {
      changed = true;
      if (live) setHistory(records);
    });
    browser
      .history('get')
      .then((records) => {
        if (live && !changed) setHistory(records);
        return null;
      })
      .catch(() => {
        // History is optional; navigation and tab suggestions remain available.
      });
    return () => {
      live = false;
      stop();
    };
  }, [open]);
  useEffect(() => {
    if (open && initialGroup) {
      setGroupScope(initialGroup);
      setFresh(false);
      setQuery('');
      setActiveResult(0);
    }
  }, [open, initialGroup]);
  const leaveGroup = () => {
    setGroupScope(null);
    setFresh(true);
    setActiveResult(0);
    setError('');
  };
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSearchScope(null);
      setGroupScope(null);
      setTagScope(null);
      setFresh(false);
      setError('');
      setActiveResult(0);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setEngines(cachedSearchEngines());
    browser
      .preferences('get')
      .then((preferences) => {
        if (live && preferences?.searchEngines)
          setEngines(validateSearchEngines(preferences.searchEngines));
        return null;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);
  const chooseEngine = (engine: SearchEngine) => {
    setSearchScope(engine);
    setQuery('');
    setActiveResult(0);
    setError('');
    searchInput.current?.focus();
  };
  const close = () => onOpenChange(false);
  const navigate = (value: string, createGroup = openInNewGroup) => {
    try {
      const url = searchScope
        ? searchUrl(searchScope, value)
        : resolveAddress(value);
      const source = sourceGroup;
      if (source && lockedGroup(source) && !createGroup)
        throw new Error('Unlock this group before opening tabs.');
      const allApps = AppManager.getAll().filter((app) => !lockedGroup(app));
      const candidates =
        searchScope && source && !createGroup
          ? allApps.filter((app) => groupKey(app) === groupKey(source))
          : allApps;
      const destination = commandDestination(
        candidates,
        source,
        url,
        createGroup,
        active.id
      );
      if (destination.existing) select(destination.existing);
      else if (destination.app) {
        const item = destination.app;
        if (source && !createGroup) {
          const all = AppManager.getAll();
          AppManager.set([...all, { ...item, position: all.length + 1 }]);
        } else AppManager.add(item);
        select(item);
      }
      close();
    } catch (reason) {
      setError(String(reason));
    }
  };
  let resolved = '';
  try {
    if (query.trim())
      resolved = searchScope
        ? searchUrl(searchScope, query)
        : resolveAddress(query);
  } catch {
    /* Input errors appear when activated. */
  }
  const term = query.trim().toLowerCase();
  const matching = useMemo(() => {
    const scopedApps = groupScope ? groupTabs(apps, groupScope) : apps;
    return scopedApps
      .filter((app) => !tagScope || app.tags?.includes(tagScope))
      .filter(
        (app) =>
          !app.archived &&
          !lockedGroup(app, access) &&
          `${app.customName || app.name} ${app.url}`
            .toLowerCase()
            .includes(term)
      )
      .slice(0, 6);
  }, [apps, groupScope, tagScope, term, access]);
  const commands: CommandResult[] = [
    {
      id: 'settings',
      title: 'Settings',
      detail: 'Browser preferences',
      icon: <Settings2 size={18} />,
      run: () => {
        close();
        browser.preferences('open').catch((reason) => setError(String(reason)));
      },
    },
    {
      id: 'space',
      title: 'New space',
      detail: 'Create a workspace',
      icon: <Plus size={18} />,
      run: () => {
        close();
        newSpace();
      },
    },
    ...(groupSource?.sessionId
      ? [
          {
            id: 'extensions',
            title: 'Chrome Web Store',
            detail: 'Find extensions for this app',
            icon: <Blocks size={18} />,
            run: () => {
              browser
                .preferenceAction('store', loginProfileKey(groupSource))
                .then(() => {
                  close();
                  return null;
                })
                .catch((reason) => setError(String(reason)));
            },
          },
        ]
      : []),
  ];
  const commandMatches = commands.filter((item) =>
    `${item.title} ${item.detail}`.toLowerCase().includes(term)
  );
  const destinationSource = sourceGroup;
  const exact =
    resolved &&
    apps.find(
      (app) =>
        !app.archived &&
        app.url === resolved &&
        (!destinationSource ||
          (groupKey(app) === groupKey(destinationSource) &&
            (app.spaceId || 'default') ===
              (destinationSource.spaceId || active.id)))
    );
  const shared = Boolean(resolved && !openInNewGroup && destinationSource);
  const isAddress =
    !searchScope &&
    /^(https?:\/\/|localhost[:/]|[\w-]+\.[\w.-]+)/i.test(query.trim());
  const destinationLabel = shared
    ? `New tab in ${destinationSource?.sessionName || destinationSource?.name}`
    : 'Open in a new group';
  let navigationTitle = `Search for “${query.trim()}”`;
  if (searchScope)
    navigationTitle = `Search ${searchScope.name} for “${query.trim()}”`;
  else if (isAddress) navigationTitle = query.trim();
  const currentChoice: CommandResult = {
    id: 'navigate-current',
    title: navigationTitle,
    detail: `Current group · ${
      exact
        ? 'Switch to open tab'
        : sourceGroup?.sessionName || sourceGroup?.name
    }`,
    icon: sourceGroup ? (
      <GroupIcon item={sourceGroup} tabs={apps} />
    ) : (
      <Globe2 size={18} />
    ),
    run: () => navigate(query, false),
  };
  const newChoice: CommandResult = {
    id: 'navigate-new',
    title: navigationTitle,
    detail: 'New group · Separate cookies and login',
    icon: <Layers size={18} />,
    run: () => navigate(query, true),
  };
  let primary: CommandResult[] = [];
  if (query.trim()) {
    if (groupScope) primary = [currentChoice];
    else if (!groupSource) primary = [newChoice];
    else
      primary = fresh ? [newChoice, currentChoice] : [currentChoice, newChoice];
  }
  if (!query.trim() && !openInNewGroup && sourceGroup?.sessionHomeURL) {
    primary = [
      {
        id: 'group-home',
        title: 'Group home',
        detail: sourceGroup.sessionHomeURL,
        icon: <GroupIcon item={sourceGroup} tabs={apps} />,
        run: () => {
          const home = groupTabs(
            AppManager.getAll().filter((app) => !lockedGroup(app)),
            sourceGroup
          ).find(isGroupHomeTab);
          if (home) {
            select(home);
            close();
          } else navigate(sourceGroup.sessionHomeURL!, false);
        },
      },
    ];
  }
  const tabResults: CommandResult[] = matching.map((item) => {
    let detail = `Switch to tab · ${item.sessionName || item.name}`;
    if (openInNewGroup) detail = 'Open in a new group';
    else if (
      query.trim() &&
      groupSource &&
      groupKey(item) !== groupKey(groupSource)
    )
      detail = destinationLabel;
    return {
      id: item.id,
      title: item.customName || item.name,
      detail,
      icon: <AppIcon icon={item.icon} title={item.name} />,
      run: () => {
        if (!tagScope && !groupScope && (openInNewGroup || query.trim()))
          navigate(item.url);
        else {
          select(item);
          close();
        }
      },
    };
  });
  const historyMatches = useMemo(() => {
    if (searchScope || tagScope) return [];
    const hiddenProfiles = new Set(
      AppManager.getAll()
        .filter((item) => lockedGroup(item, access))
        .map(loginProfileKey)
    );
    return historySuggestions(history, query, {
      excludedURLs: matching.map((item) => item.url),
      hiddenProfiles,
      profile: groupScope ? loginProfileKey(groupScope) : undefined,
    });
  }, [history, query, matching, access, groupScope, searchScope, tagScope]);
  const historyResults: CommandResult[] = historyMatches.map((record) => ({
    id: `history-${record.id}`,
    title: record.title || new URL(record.url).hostname,
    detail: `History · ${record.url}`,
    icon: <History size={18} />,
    run: () => navigate(record.url),
  }));
  const spaceResults: CommandResult[] = spaces
    .filter((space) => space.name.toLowerCase().includes(term))
    .slice(0, 4)
    .map((space) => ({
      id: space.id,
      title: space.name,
      detail: 'Switch space',
      icon: <SpaceIcon space={space} />,
      run: () => {
        SpaceManager.select(space.id);
        close();
      },
    }));
  const enterGroup = (group: IApp) => {
    setGroupScope(group);
    setSearchScope(null);
    setQuery('');
    setActiveResult(0);
    searchInput.current?.focus();
  };
  const groupTerm = term.startsWith('@') ? term.slice(1) : term;
  const seenGroups = new Set<string>();
  const groupResults: CommandResult[] = apps
    .filter((item) => {
      const key = `${item.spaceId || 'default'}:${groupKey(item)}`;
      if (item.archived || lockedGroup(item) || seenGroups.has(key))
        return false;
      seenGroups.add(key);
      return (
        term.startsWith('@')
          ? item.sessionSlug || ''
          : `${item.sessionName || item.name} ${item.sessionSlug || ''}`
      )
        .toLowerCase()
        .includes(groupTerm);
    })
    .slice(0, 6)
    .map((item) => ({
      id: `group-${item.id}`,
      title: item.sessionName || item.name,
      detail: item.sessionSlug ? `Group · @${item.sessionSlug}` : 'Group',
      icon: <GroupIcon item={item} tabs={apps} />,
      group: item,
      run: () => enterGroup(item),
    }));
  const tagResults: CommandResult[] = [
    ...new Set(
      apps
        .filter((app) => !app.archived && !lockedGroup(app))
        .flatMap((app) => app.tags || [])
    ),
  ]
    .filter((tag) => tag.toLowerCase().includes(term.replace(/^#/, '')))
    .slice(0, 6)
    .map((tag) => ({
      id: `tag-${tag}`,
      title: `#${tag}`,
      detail: 'Tag · Browse matching tabs',
      icon: <Tag size={18} />,
      run: () => {
        setTagScope(tag);
        setQuery('');
        setActiveResult(0);
      },
    }));
  const folderResults: CommandResult[] = spaces.flatMap((space) =>
    space.folders
      .filter((folder) => folder.name.toLowerCase().includes(term))
      .map((folder) => ({
        id: `folder-${space.id}-${folder.id}`,
        title: folder.name,
        detail: `Collection · ${space.name}`,
        icon: <CollectionIcon size={18} />,
        run: () => {
          SpaceManager.select(space.id);
          const tab = apps.find(
            (item) =>
              !item.archived &&
              !lockedGroup(item) &&
              item.spaceId === space.id &&
              item.folderId === folder.id
          );
          if (tab) select(tab);
          close();
        },
      }))
  );
  const engineMatches = searchScope ? [] : matchSearchEngines(engines, query);
  const engineResults: CommandResult[] = engineMatches.map((engine) => ({
    id: `search-engine-${engine.id}`,
    title: `Search ${engine.name}`,
    detail: `${engine.keyword || engine.name} · Tab to search`,
    icon: <Search size={18} />,
    engine,
    run: () => chooseEngine(engine),
  }));
  let results = [
    ...groupResults,
    ...folderResults,
    ...tagResults,
    ...engineResults,
    ...primary,
    ...tabResults,
    ...historyResults,
    ...spaceResults,
    ...commandMatches,
  ];
  if (tagScope) results = tabResults;
  else if (term.startsWith('#')) results = tagResults;
  else if (groupScope) results = [...tabResults, ...historyResults, ...primary];
  else if (term.startsWith('@')) results = groupResults;
  else if (searchScope) results = primary;
  else if (!isAddress && term && commandMatches.length)
    results = [
      ...commandMatches,
      ...groupResults,
      ...folderResults,
      ...tagResults,
      ...engineResults,
      ...primary,
      ...tabResults,
      ...historyResults,
      ...spaceResults,
    ];
  const selectedIndex = Math.min(activeResult, Math.max(0, results.length - 1));
  useEffect(() => {
    document
      .getElementById(`command-result-${selectedIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);
  let placeholder = 'Search or enter a URL…';
  let scopeLabel = '';
  let clearScope = () => {};
  let scopeKind = '';
  if (searchScope) {
    placeholder = `Search ${searchScope.name}…`;
    scopeLabel = searchScope.name;
    scopeKind = 'search';
    clearScope = () => setSearchScope(null);
  }
  if (groupScope) {
    placeholder = 'Search tabs or enter a URL…';
    scopeLabel = groupScope.sessionName || groupScope.name;
    scopeKind = 'group';
    clearScope = leaveGroup;
  }
  if (tagScope) {
    placeholder = `Search tabs tagged #${tagScope}…`;
    scopeLabel = `#${tagScope}`;
    scopeKind = 'tag';
    clearScope = () => setTagScope(null);
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        maxWidth="600px"
        className="command-dialog smart-command"
        onEscapeKeyDown={(event) => {
          if (groupScope || searchScope || tagScope) {
            event.preventDefault();
            if (groupScope) leaveGroup();
            setTagScope(null);
            setSearchScope(null);
            setActiveResult(0);
          }
        }}
      >
        <Dialog.Title className="command-accessible-title">
          Open a website or run a command
        </Dialog.Title>
        <Dialog.Description className="command-accessible-title">
          Type a URL, search, or choose an open tab or a page from history. Use
          arrow keys to select and Enter to open. Type @ to find groups by slug,
          then Tab to browse their pages. Type a search engine name and press
          Tab to search that site.
        </Dialog.Description>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            results[selectedIndex]?.run();
          }}
        >
          <TextField.Root
            ref={searchInput}
            autoFocus
            size="3"
            aria-label="Search tabs or enter a website"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="command-results"
            aria-activedescendant={
              results.length ? `command-result-${selectedIndex}` : undefined
            }
            placeholder={placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveResult(0);
              setError('');
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (
                event.key === 'Tab' &&
                !event.shiftKey &&
                !searchScope &&
                !groupScope
              ) {
                const group = results[selectedIndex]?.group;
                if (group) {
                  event.preventDefault();
                  enterGroup(group);
                  return;
                }
                const engine =
                  results[selectedIndex]?.engine || engineMatches[0];
                if (engine) {
                  event.preventDefault();
                  chooseEngine(engine);
                }
              }
              if (event.key === 'Backspace' && tagScope && !query) {
                event.preventDefault();
                setTagScope(null);
              }
              if (event.key === 'Backspace' && groupScope && !query) {
                event.preventDefault();
                leaveGroup();
              }
              if (event.key === 'Backspace' && searchScope && !query) {
                event.preventDefault();
                setQuery(searchScope.keyword || searchScope.name);
                setSearchScope(null);
                setActiveResult(0);
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveResult(
                  (selectedIndex +
                    (event.key === 'ArrowDown' ? 1 : -1) +
                    results.length) %
                    Math.max(1, results.length)
                );
              }
            }}
          >
            <TextField.Slot>
              {scopeLabel ? (
                <span className="command-search-scope">
                  <span>{scopeLabel}</span>
                  <button
                    type="button"
                    aria-label={`Clear ${scopeKind} scope`}
                    title={
                      scopeKind === 'group' ? 'Back · clear group' : undefined
                    }
                    onClick={() => {
                      clearScope();
                      setActiveResult(0);
                      searchInput.current?.focus();
                    }}
                  >
                    {scopeKind === 'group' ? (
                      <ArrowLeft size={14} />
                    ) : (
                      <X size={12} />
                    )}
                  </button>
                </span>
              ) : (
                <Search size={19} />
              )}
            </TextField.Slot>
            <TextField.Slot>
              <button
                className="command-dismiss"
                type="button"
                aria-label="Close command dialog"
                title="Close · Esc"
                onClick={close}
              >
                <X size={16} />
              </button>
            </TextField.Slot>
          </TextField.Root>
        </form>
        {searchScope && !query.trim() && (
          <p className="command-search-hint">Backspace to search everywhere.</p>
        )}
        {error && (
          <Text className="command-error" color="red" role="alert">
            {error}
          </Text>
        )}
        <div
          className="command-results"
          id="command-results"
          role="listbox"
          aria-label="Suggestions"
        >
          {results.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              id={`command-result-${index}`}
              className="command-result"
              key={item.id}
              onMouseMove={() => setActiveResult(index)}
              onClick={item.run}
            >
              <span className="command-result-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="command-result-copy">
                <strong title={item.title}>{item.title}</strong>
                <Text size="1" color="gray" title={item.detail}>
                  {item.detail}
                </Text>
              </span>
              <span className="command-result-key" aria-hidden="true">
                {(item.engine || item.group) && index === selectedIndex ? (
                  <Kbd>Tab</Kbd>
                ) : (
                  index === selectedIndex && <ArrowUpRight size={16} />
                )}
              </span>
            </button>
          ))}
        </div>
        <footer className="command-footer">
          <span>
            {results.length ? (
              <>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> choose <Kbd>↵</Kbd> open
                {results[selectedIndex]?.group && (
                  <>
                    <Kbd>Tab</Kbd> browse group
                  </>
                )}
              </>
            ) : (
              <>
                <Kbd>Esc</Kbd> {searchScope ? 'all commands' : 'close'}
              </>
            )}
          </span>
        </footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
