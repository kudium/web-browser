import { SidebarResizeHandle } from './SidebarResizeHandle';
import { terminalDropText } from '../../utils/terminalDrop';
import { frameResizeObserver } from '../../utils/frameResizeObserver';
/* Optional callbacks use defaults; separators and tabs implement keyboard interaction. */
/* eslint-disable react/require-default-props, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-static-element-interactions, no-nested-ternary */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Dialog,
  DropdownMenu,
  IconButton,
  Button,
  TextField,
  useThemeContext,
} from '@radix-ui/themes';
import { Plus, X, Ellipsis, Terminal as TerminalIcon } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { OPEN_TERMINAL_LINK } from '../../browser/terminalLinks';
import {
  PanelDropdownContent,
  PanelDialogContent,
  PanelDialogHeader,
} from './PanelDialog';
import '@xterm/xterm/css/xterm.css';
import {
  showDeveloperContextMenu,
  menuSeparator,
} from './developerContextMenu';
import type {
  ProjectTerminalEvent,
  ProjectTerminalRequest,
  ProjectTerminalState,
} from '../../browser/developerProject';
import { projectErrorMessage } from '../../browser/developerProject';

const terminalThemes = {
  light: {
    background: '#f9f9fc',
    foreground: '#202124',
    cursor: '#202124',
    selectionBackground: '#d8dfea',
    black: '#202124',
    red: '#b42318',
    green: '#26703c',
    yellow: '#8a5700',
    blue: '#175eb0',
    magenta: '#8735a8',
    cyan: '#007780',
    white: '#62636b',
    brightBlack: '#62636b',
    brightRed: '#b42318',
    brightGreen: '#26703c',
    brightYellow: '#8a5700',
    brightBlue: '#175eb0',
    brightMagenta: '#8735a8',
    brightCyan: '#007780',
    brightWhite: '#202124',
  },
  dark: {
    background: '#17181b',
    foreground: '#e4e4e7',
    cursor: '#e4e4e7',
    selectionBackground: '#51515b',
  },
};

function TerminalSurface({
  group,
  tab,
  active,
  generation,
  onError,
  onReady,
  onAction,
  onRename,
  onDropReady,
}: {
  group: string;
  tab: string;
  active: boolean;
  generation: number;
  onError: (message: string) => void;
  onReady: () => void;
  onAction: (request: ProjectTerminalRequest) => Promise<unknown>;
  onRename: () => void;
  onDropReady: (handler: ((files: File[]) => void) | undefined) => void;
}) {
  const { appearance } = useThemeContext();
  const container = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const inputReady = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    let live = true;
    let ready = false;
    let sequence = 0;
    let pending: ProjectTerminalEvent[] = [];
    const openLink = (event: MouseEvent, url: string) => {
      event.preventDefault();
      if (!live) return;
      window.dispatchEvent(
        new CustomEvent(OPEN_TERMINAL_LINK, {
          detail: { group, url },
        })
      );
    };
    const terminal = new Terminal({
      fontFamily: 'Menlo, Monaco, monospace',
      fontSize: 12,
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 3000,
      linkHandler: { activate: openLink },
      screenReaderMode: true,
      disableStdin: true,
      theme: terminalThemes.dark,
    });
    terminalRef.current = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon(openLink));
    terminal.open(element);
    const fitTerminal = () => {
      if (element.clientWidth > 0 && element.clientHeight > 0) fit.fit();
    };
    fitTerminal();
    const accept = (event: ProjectTerminalEvent) => {
      if (event.sequence <= sequence) return;
      sequence = event.sequence;
      if (event.data) terminal.write(event.data);
      if (event.exitCode !== undefined || event.stopped) {
        inputReady.current = false;
        terminal.options.disableStdin = false;
        terminal.write(
          event.stopped
            ? '\r\nTerminal stopped.\r\n'
            : `\r\nProcess exited (${event.exitCode}).\r\n`
        );
      }
    };
    const off = window.electron.siteDeveloper.onTerminal((event) => {
      if (!live || event.group !== group || event.tab !== tab) return;
      if (!ready) pending.push(event);
      else accept(event);
    });
    const resize = terminal.onResize(({ cols, rows }) => {
      if (ready)
        window.electron.siteDeveloper
          .terminal(group, { action: 'resize', tab, cols, rows })
          .catch(() => {});
    });
    const sendError = () => {
      if (live)
        errorRef.current(
          'Could not send input. Restart the terminal to reconnect.'
        );
    };
    const input = terminal.onData((data) => {
      if (!ready) return;
      for (let offset = 0; offset < data.length; offset += 64 * 1024) {
        window.electron.siteDeveloper
          .terminal(group, {
            action: 'write',
            tab,
            data: data.slice(offset, offset + 64 * 1024),
          })
          .then(() => readyRef.current())
          .catch(sendError);
      }
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (
        event.type === 'keydown' &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey
      ) {
        const key = event.key.toLowerCase();
        if (key === 'c' || key === 'k') {
          event.preventDefault();
          if (key === 'c' && terminal.hasSelection()) {
            navigator.clipboard
              .writeText(terminal.getSelection())
              .catch(() => errorRef.current('Could not copy the selection.'));
            return false;
          }
          if (ready) {
            window.electron.siteDeveloper
              .terminal(
                group,
                key === 'k'
                  ? { action: 'clear', tab }
                  : { action: 'write', tab, data: '\x03' }
              )
              .then(() => readyRef.current())
              .catch(sendError);
          }
          return false;
        }
      }
      if (
        event.type === 'keydown' &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'c'
      ) {
        navigator.clipboard
          .writeText(terminal.getSelection())
          .catch(() => errorRef.current('Could not copy the selection.'));
        return false;
      }
      return true;
    });
    const observer = frameResizeObserver(fitTerminal);
    observer.observe(element);
    window.electron.siteDeveloper
      .terminal(group, {
        action: 'attach',
        tab,
        cols: terminal.cols,
        rows: terminal.rows,
      })
      .then(async (state) => {
        if (!live) return undefined;
        const connected = state.running
          ? state
          : await window.electron.siteDeveloper.terminal(group, {
              action: 'open',
              tab,
              cols: terminal.cols,
              rows: terminal.rows,
            });
        if (!live) return undefined;
        sequence = connected.sequence;
        terminal.write(connected.data);
        terminal.options.disableStdin = !connected.running;
        ready = true;
        inputReady.current = connected.running;
        pending.forEach(accept);
        pending = [];
        fitTerminal();
        if (
          activeRef.current &&
          document.activeElement?.getAttribute('role') !== 'tab'
        )
          terminal.focus();
        readyRef.current();
        return undefined;
      })
      .catch((reason) => {
        if (live) errorRef.current(projectErrorMessage(reason));
      });
    return () => {
      live = false;
      inputReady.current = false;
      off();
      observer.disconnect();
      input.dispose();
      resize.dispose();
      terminal.dispose();
      terminalRef.current = undefined;
    };
  }, [group, tab, generation]);
  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    const updateTheme = () => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      const glass =
        (element.ownerDocument.defaultView || window)
          .getComputedStyle(element)
          .getPropertyValue('--terminal-glass')
          .trim() === '1';
      const theme = terminalThemes[appearance === 'light' ? 'light' : 'dark'];
      terminal.options.theme = {
        ...theme,
        background: glass ? '#00000000' : theme.background,
      };
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-chrome-glass',
        'data-assistant-glass',
        'data-platform',
      ],
    });
    const media = [
      window.matchMedia('(prefers-reduced-transparency: reduce)'),
      window.matchMedia('(prefers-contrast: more)'),
    ];
    media.forEach((query) => query.addEventListener('change', updateTheme));
    return () => {
      observer.disconnect();
      media.forEach((query) =>
        query.removeEventListener('change', updateTheme)
      );
    };
  }, [appearance, group, tab, generation]);
  useEffect(() => {
    if (active) terminalRef.current?.focus();
  }, [active]);
  useEffect(() => {
    if (!active) return undefined;
    onDropReady((files) => {
      try {
        if (!inputReady.current || !terminalRef.current)
          throw new Error('Wait for the terminal to connect before dropping a path.');
        const paths = window.electron.siteDeveloper.droppedFilePaths(files);
        terminalRef.current.paste(terminalDropText(paths, window.electron.platform));
        terminalRef.current.focus();
      } catch (reason) { errorRef.current(projectErrorMessage(reason)); }
    });
    return () => onDropReady(undefined);
  }, [active, onDropReady]);
  const menu = () => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const activeMenu = () => terminalRef.current === terminal;
    const selectedText = terminal.getSelection();
    const allText = () =>
      Array.from(
        { length: terminal.buffer.active.length },
        (_, index) =>
          terminal.buffer.active.getLine(index)?.translateToString(true) || ''
      ).join('\n');
    showDeveloperContextMenu(
      [
        { label: 'Terminal', disabled: true },
        {
          label: 'Copy selection',
          disabled: !selectedText,
          run: () => navigator.clipboard.writeText(selectedText),
        },
        {
          label: 'Paste',
          disabled: terminal.options.disableStdin,
          run: async () => {
            const text = await navigator.clipboard.readText();
            if (activeMenu() && !terminal.options.disableStdin) {
              terminal.paste(text);
              terminal.focus();
            }
          },
        },
        { label: 'Select all', run: () => terminal.selectAll() },
        {
          label: 'Copy terminal output',
          run: () => navigator.clipboard.writeText(allText()),
        },
        menuSeparator,
        {
          label: 'Clear terminal',
          run: () => onAction({ action: 'clear', tab }),
        },
        { label: 'Scroll to bottom', run: () => terminal.scrollToBottom() },
        menuSeparator,
        { label: 'Rename tab…', run: onRename },
        { label: 'New terminal', run: () => onAction({ action: 'create' }) },
        {
          label: 'Restart terminal',
          run: () =>
            onAction({
              action: 'restart',
              tab,
              cols: terminal.cols,
              rows: terminal.rows,
            }),
        },
        {
          label: 'Stop process',
          disabled: terminal.options.disableStdin,
          run: () => onAction({ action: 'close', tab }),
        },
        { label: 'Close tab', run: () => onAction({ action: 'remove', tab }) },
      ],
      activeMenu,
      errorRef.current
    );
  };
  return (
    <div
      className="developer-terminal-surface"
      ref={container}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        menu();
      }}
      onKeyDownCapture={(event) => {
        if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault();
          event.stopPropagation();
          menu();
        }
      }}
    />
  );
}

export function DeveloperTerminal({
  group,
  active,
  onHide = () => {},
  openRequest = 0,
}: {
  group: string;
  active: boolean;
  onHide?: () => void;
  openRequest?: number;
}) {
  const [state, setState] = useState<ProjectTerminalState>();
  const [height, setHeight] = useState(220);
  const [resizing, setResizing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [renameTab, setRenameTab] = useState('');
  const dropHandler = useRef<((files: File[]) => void) | undefined>(undefined);
  const setDropHandler = useCallback((handler: ((files: File[]) => void) | undefined) => { dropHandler.current = handler; }, []);
  const root = useRef<HTMLElement>(null);
  const revision = useRef(0);
  const live = useRef(true);
  const request = async (value: ProjectTerminalRequest) => {
    revision.current += 1;
    const { current } = revision;
    try {
      const next = await window.electron.siteDeveloper.terminal(group, value);
      if (live.current && current === revision.current) {
        setState(next);
        setError('');
      }
      return next;
    } catch (reason) {
      if (live.current && current === revision.current) {
        const message = projectErrorMessage(reason);
        if (
          !(
            value.action === 'list' &&
            message === 'Link a project folder first.'
          )
        )
          setError(message);
      }
      return undefined;
    }
  };
  const requestRef = useRef(request);
  requestRef.current = request;
  useEffect(() => {
    live.current = true;
    requestRef
      .current({ action: 'list' })
      .then((next) => {
        if (live.current && next) setHeight(next.height);
        return undefined;
      })
      .catch(() => {});
    const off = window.electron.siteDeveloper.onTerminal((event) => {
      if (event.group === group && event.error) setError(event.error);
      if (
        event.group === group &&
        (event.exitCode !== undefined || event.stopped)
      )
        requestRef.current({ action: 'list' });
    });
    return () => {
      live.current = false;
      revision.current += 1;
      off();
    };
  }, [group]);
  useEffect(() => {
    if (openRequest) requestRef.current({ action: 'show' });
  }, [openRequest]);
  const selected = state?.tabs.find((tab) => tab.id === state.selected);
  useEffect(() => {
    if (state?.selected && state.open)
      document
        .getElementById(`terminal-tab-${state.selected}`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [state?.selected, state?.open]);
  const [workspaceLimit, setWorkspaceLimit] = useState(2000);
  useLayoutEffect(() => {
    const sidebar = root.current?.closest<HTMLElement>('.developer-sidebar');
    if (!sidebar || !state?.open) return undefined;
    const update = () => {
      const bounds = sidebar.getBoundingClientRect();
      if (!bounds.height) return;
      const workspace = sidebar.querySelector<HTMLElement>(
        '.developer-sidebar-pages'
      );
      const content = workspace?.querySelector<HTMLElement>(
        '.developer-files-list, .developer-file-preview, .developer-pages-view:not([hidden])'
      );
      const reserved =
        content && workspace
          ? content.getBoundingClientRect().top -
            bounds.top +
            workspace.scrollTop +
            96
          : 80;
      setWorkspaceLimit(Math.max(96, bounds.height - reserved));
    };
    const observer = frameResizeObserver(update);
    observer.observe(sidebar);
    const workspace = sidebar.querySelector('.developer-sidebar-pages');
    if (workspace) observer.observe(workspace);
    const changes = new MutationObserver(update);
    if (workspace)
      changes.observe(workspace, { childList: true, subtree: true });
    update();
    return () => {
      observer.disconnect();
      changes.disconnect();
    };
  }, [state?.open]);
  const limitHeight = (value: number) =>
    Math.max(96, Math.min(value, 2000, workspaceLimit));
  const updateHeight = (value: number) => {
    const next = limitHeight(value);
    setHeight(next);
    return next;
  };
  useEffect(() => {
    if (resizing) document.body.classList.add('project-terminal-dragging');
    return () => document.body.classList.remove('project-terminal-dragging');
  }, [resizing]);
  const action = async (value: ProjectTerminalRequest) => {
    setBusy(true);
    const next = await request(value);
    if (next && (value.action === 'restart' || value.action === 'clear'))
      setGeneration((number) => number + 1);
    if (live.current) setBusy(false);
    return next;
  };
  const hide = async () => {
    const next = await request({ action: 'preferences', open: false });
    if (next) onHide();
  };
  const tabMenu = (tab: NonNullable<typeof selected>) => {
    if (busy) return;
    const { current } = revision;
    showDeveloperContextMenu(
      [
        { label: tab.name, disabled: true },
        {
          label: 'Rename tab…',
          run: () => {
            setRenameTab(tab.id);
            setName(tab.name);
            setRenaming(true);
          },
        },
        {
          label: 'New terminal',
          disabled: (state?.tabs.length || 0) >= 8,
          run: () => action({ action: 'create' }),
        },
        {
          label: 'Restart terminal',
          run: () =>
            action({
              action: 'restart',
              tab: tab.id,
              cols: 80,
              rows: 24,
            }),
        },
        {
          label: 'Stop process',
          disabled: !tab.running,
          run: () => action({ action: 'close', tab: tab.id }),
        },
        {
          label: 'Close tab',
          run: () => action({ action: 'remove', tab: tab.id }),
        },
      ],
      () => live.current && revision.current === current,
      setError
    );
  };
  if (!state?.open)
    return error ? (
      <p role="alert" className="developer-terminal-error">
        {error}
      </p>
    ) : null;
  return (
    <section
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        event.stopPropagation();
        if (dropHandler.current) dropHandler.current(Array.from(event.dataTransfer.files));
        else setError('Select a connected terminal tab before dropping a path.');
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (selected) tabMenu(selected);
      }}
      className={`developer-terminal${resizing ? ' resizing' : ''}`}
      ref={root}
      style={{ height: 'var(--terminal-height)', '--terminal-height': `${height}px`, maxHeight: workspaceLimit } as CSSProperties}
      aria-label="Project terminal"
    >
      <SidebarResizeHandle
        side="right" axis="vertical" className="developer-terminal-resize"
        label="Resize terminal" width={limitHeight(height)} minWidth={96}
        maxWidth={limitHeight(2000)} resetWidth={220} step={20}
        liveResize={{ target: root, property: '--terminal-height' }}
        onResizingChange={setResizing}
        onChange={value => { const next = updateHeight(value); request({ action: 'preferences', height: next }); }}
      />
      <div className="developer-terminal-heading">
        <TerminalIcon size={14} aria-hidden="true" />
        <div
          className="developer-terminal-tabs"
          role="tablist"
          aria-label="Terminal tabs"
        >
          {state.tabs.map((tab, index) => (
            <div
              className="developer-terminal-tab"
              key={tab.id}
              data-selected={state.selected === tab.id}
            >
              <button
                type="button"
                role="tab"
                aria-selected={state.selected === tab.id}
                tabIndex={state.selected === tab.id ? 0 : -1}
                title={`${tab.name}${
                  tab.running
                    ? ' · Running'
                    : tab.restored
                    ? ' · Restored'
                    : ' · Stopped'
                }`}
                aria-controls={`terminal-${tab.id}`}
                id={`terminal-tab-${tab.id}`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  tabMenu(tab);
                }}
                onClick={() => request({ action: 'select', tab: tab.id })}
                onDoubleClick={() => {
                  setRenameTab(tab.id);
                  setName(tab.name);
                  setRenaming(true);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'ContextMenu' ||
                    (event.shiftKey && event.key === 'F10')
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    tabMenu(tab);
                    return;
                  }
                  if (
                    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                      event.key
                    )
                  ) {
                    event.preventDefault();
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                        ? state.tabs.length - 1
                        : (index +
                            (event.key === 'ArrowRight' ? 1 : -1) +
                            state.tabs.length) %
                          state.tabs.length;
                    request({ action: 'select', tab: state.tabs[next].id });
                    document
                      .getElementById(`terminal-tab-${state.tabs[next].id}`)
                      ?.focus();
                  }
                }}
              >
                <span
                  className={`developer-terminal-dot ${
                    tab.running ? 'running' : ''
                  }`}
                  aria-hidden="true"
                />
                <span className="developer-terminal-tab-name">{tab.name}</span>
              </button>
              <button
                type="button"
                className="developer-terminal-tab-close"
                aria-label={`Close ${tab.name}`}
                title={tab.running ? 'Close tab and stop process' : 'Close tab'}
                disabled={busy}
                tabIndex={state.selected === tab.id ? 0 : -1}
                onClick={() => action({ action: 'remove', tab: tab.id })}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <IconButton
          size="1"
          color="gray"
          variant="ghost"
          aria-label="New terminal"
          title="New terminal"
          disabled={busy || state.tabs.length >= 8}
          onClick={() => action({ action: 'create' })}
        >
          <Plus size={14} />
        </IconButton>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <IconButton
              size="1"
              color="gray"
              variant="ghost"
              aria-label="Terminal actions"
              title="Terminal actions"
              disabled={!selected || busy}
            >
              <Ellipsis size={14} />
            </IconButton>
          </DropdownMenu.Trigger>
          <PanelDropdownContent size="1" align="end">
            <DropdownMenu.Item
              onSelect={() => {
                if (selected) {
                  setRenameTab(selected.id);
                  setName(selected.name);
                  setRenaming(true);
                }
              }}
            >
              Rename tab…
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => action({ action: 'clear', tab: selected!.id })}
            >
              Clear terminal
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              onSelect={() =>
                action({
                  action: 'restart',
                  tab: selected!.id,
                  cols: 80,
                  rows: 24,
                })
              }
            >
              Restart terminal
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={!selected?.running}
              onSelect={() => action({ action: 'close', tab: selected!.id })}
            >
              Stop terminal
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              color="red"
              onSelect={() => action({ action: 'remove', tab: selected!.id })}
            >
              {selected?.running ? 'Close tab and stop process' : 'Close tab'}
            </DropdownMenu.Item>
          </PanelDropdownContent>
        </DropdownMenu.Root>
        <IconButton
          size="1"
          color="gray"
          variant="ghost"
          aria-label="Hide terminal"
          title="Hide terminal (keeps sessions running)"
          onClick={hide}
        >
          <X size={14} />
        </IconButton>
      </div>
      {error && (
        <p role="alert" className="developer-terminal-error">
          {error}
        </p>
      )}
      {!state.tabs.length && (
        <div className="developer-terminal-empty">
          <p>No terminal tabs</p>
          <Button
            size="1"
            variant="soft"
            color="gray"
            disabled={busy}
            onClick={() => action({ action: 'create' })}
          >
            New terminal
          </Button>
        </div>
      )}
      {selected && (
        <div
          className="developer-terminal-panel"
          role="tabpanel"
          id={`terminal-${selected.id}`}
          aria-labelledby={`terminal-tab-${selected.id}`}
        >
          <TerminalSurface
            onDropReady={setDropHandler}
            group={group}
            tab={selected.id}
            active={active}
            generation={generation}
            onError={setError}
            onReady={() => request({ action: 'list' })}
            onAction={action}
            onRename={() => {
              setRenameTab(selected.id);
              setName(selected.name);
              setRenaming(true);
            }}
          />
        </div>
      )}
      <Dialog.Root open={renaming} onOpenChange={setRenaming}>
        <PanelDialogContent
          size="1"
          maxWidth="340px"
          className="developer-terminal-rename"
        >
          <PanelDialogHeader title="Rename terminal" />
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const next = await action({
                action: 'rename',
                tab: renameTab,
                name,
              });
              if (next) setRenaming(false);
            }}
          >
            <TextField.Root
              aria-label="Terminal name"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              onFocus={(event) => event.target.select()}
            />
            {error && <p role="alert">{error}</p>}
            <div className="developer-terminal-rename-actions">
              <Dialog.Close>
                <Button type="button" size="2" color="gray" variant="soft">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" size="2" disabled={busy || !name.trim()}>
                Save
              </Button>
            </div>
          </form>
        </PanelDialogContent>
      </Dialog.Root>
    </section>
  );
}
