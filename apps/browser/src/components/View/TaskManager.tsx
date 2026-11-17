import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, TextField, Text } from '@radix-ui/themes';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Search,
  RefreshCw,
  Globe2,
  Layers,
  LockKeyhole,
  Info,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';
import { browser } from '../../browser/client';
import type {
  BrowserTask,
  TaskManagerRequest,
  TaskManagerState,
} from '../../browser/taskManager';

type TaskFilter = 'all' | 'endable' | 'protected';
type SortKey = 'title' | 'cpu' | 'memory' | 'canEnd';
const sortOptions: { value: string; label: string }[] = [
  { value: 'cpu:desc', label: 'CPU: highest first' },
  { value: 'cpu:asc', label: 'CPU: lowest first' },
  { value: 'memory:desc', label: 'Memory: largest first' },
  { value: 'memory:asc', label: 'Memory: smallest first' },
  { value: 'title:asc', label: 'Name: A to Z' },
  { value: 'title:desc', label: 'Name: Z to A' },
  { value: 'canEnd:desc', label: 'Can end first' },
  { value: 'canEnd:asc', label: 'Can’t end first' },
];
const protectedReason = (task: BrowserTask) =>
  task.status === 'sleeping'
    ? 'Sleeping tabs are already unloaded.'
    : task.status === 'locked'
      ? 'Unlock this tab’s group in the browser first.'
      : task.status === 'stopped'
        ? 'This tab is already stopped. Switch to reload it, or close it from the actions menu.'
        : task.kind === 'process'
          ? 'Browser interfaces and processes belonging to locked tabs or another session are protected.'
          : 'This tab is currently being unloaded or removed.';

export function TaskManager() {
  const [state, setState] = useState<TaskManagerState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('endable');
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'cpu',
    descending: true,
  });
  const pending = useRef(false);
  const live = useRef(true);
  const request = async (input: TaskManagerRequest) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const next = await browser.taskManager(input);
      if (live.current) {
        setState(next);
        setError('');
      }
    } catch (reason) {
      if (live.current)
        setError(
          reason instanceof Error ? reason.message : 'Could not update tasks.',
        );
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  };
  useEffect(() => {
    live.current = true;
    void request({ action: 'get' });
    const timer = setInterval(() => {
      if (!document.hidden) void request({ action: 'get' });
    }, 2000);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, []);
  const allTasks = state?.tasks || [];
  const endable = (task: BrowserTask) => task.canEnd || task.canForceEnd;
  const endableCount = allTasks.filter(endable).length;
  const filters: { id: TaskFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All tasks', count: allTasks.length },
    { id: 'endable', label: 'Can end', count: endableCount },
    {
      id: 'protected',
      label: 'Can’t end',
      count: allTasks.length - endableCount,
    },
  ];
  const tasks = allTasks
    .filter(
      (task) =>
        (filter === 'all' ||
          (filter === 'endable' ? endable(task) : !endable(task))) &&
        `${task.title} ${task.site} ${task.pid ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const left = sort.key === 'canEnd' ? endable(a) : a[sort.key],
        right = sort.key === 'canEnd' ? endable(b) : b[sort.key];
      if (left === null) return right === null ? a.id.localeCompare(b.id) : 1;
      if (right === null) return -1;
      const difference =
        typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : Number(left) - Number(right);
      return (
        (sort.descending ? -difference : difference) ||
        (b.cpu ?? -1) - (a.cpu ?? -1) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id)
      );
    });
  const act = (action: 'activate' | 'end' | 'close', task: BrowserTask) => {
    if (action === 'close' || (task.contentsId !== null && task.pid !== null))
      void request({
        action,
        id: task.id,
        contentsId: task.contentsId,
        pid: task.pid,
      });
  };
  const forceEnd = (task: BrowserTask) => {
    if (
      task.canForceEnd &&
      typeof task.pid === 'number' &&
      typeof task.processStarted === 'number'
    )
      void request({
        action: 'force-end',
        id: task.id,
        pid: task.pid,
        processStarted: task.processStarted,
      });
  };
  const showTaskMenu = async (task: BrowserTask) => {
    try {
      const items = [];
      if (task.kind === 'tab' && task.status !== 'locked') {
        items.push({
          id: 'activate',
          label: 'Switch to tab',
          enabled: task.contentsId !== null,
        });
        items.push({ id: 'close', label: 'Close tab…' });
        if (task.canEnd) items.push({ id: 'end', label: 'End tab…' });
      }
      if (task.canForceEnd)
        items.push({ id: 'force-end', label: 'Force end process…' });
      if (!items.length)
        items.push({ label: 'Protected task', enabled: false });
      const action = await browser.nativeMenu(items);
      if (!live.current) return;
      if (action === 'force-end') forceEnd(task);
      else if (action === 'activate' || action === 'close' || action === 'end')
        act(action, task);
    } catch (reason) {
      if (live.current) setError(String(reason));
    }
  };
  const columns = [
    { key: 'title' as const, label: 'Task' },
    { key: 'cpu' as const, label: 'CPU' },
    { key: 'memory' as const, label: 'Memory' },
  ];
  return (
    <main className="task-manager app-glass-surface">
      <div className="task-manager-drag" aria-hidden="true" />
      <header>
        <div className="task-manager-heading">
          <span className="task-manager-app-icon">
            <Activity size={20} aria-hidden="true" />
          </span>
          <div>
            <h1>Task Manager</h1>
            <Text as="p" size="2" color="gray">
              Find a busy tab and free up resources.
            </Text>
          </div>
        </div>
        <IconButton
          variant="ghost"
          color="gray"
          disabled={busy}
          onClick={() => void request({ action: 'get' })}
          aria-label="Refresh"
          title="Refresh tasks"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </IconButton>
      </header>
      <TextField.Root
        className="task-manager-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by task, website or process ID"
        aria-label="Search tasks"
      >
        <TextField.Slot>
          <Search size={15} aria-hidden="true" />
        </TextField.Slot>
      </TextField.Root>
      <div className="task-manager-toolbar">
        <div
          className="task-manager-filters"
          role="group"
          aria-label="Filter tasks"
        >
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={filter === item.id}
              aria-label={item.label}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span aria-hidden="true">{item.count}</span>
            </button>
          ))}
        </div>
        <label className="task-manager-sort">
          <span>Sort</span>
          <span className="task-manager-sort-control">
            <select
              aria-label="Sort tasks"
              value={`${sort.key}:${sort.descending ? 'desc' : 'asc'}`}
              onChange={(event) => {
                const [key, order] = event.target.value.split(':');
                setSort({ key: key as SortKey, descending: order === 'desc' });
              }}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} aria-hidden="true" />
          </span>
        </label>
      </div>
      {error && (
        <Text as="p" color="red" role="alert" size="2">
          {error}
        </Text>
      )}
      <div className="task-manager-table">
        <table aria-label="Browser resource usage">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  aria-sort={
                    sort.key === column.key
                      ? sort.descending
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort({
                        key: column.key,
                        descending:
                          sort.key === column.key
                            ? !sort.descending
                            : column.key !== 'title',
                      })
                    }
                  >
                    {column.label}
                    {sort.key === column.key &&
                      (sort.descending ? (
                        <ArrowDown size={11} aria-hidden="true" />
                      ) : (
                        <ArrowUp size={11} aria-hidden="true" />
                      ))}
                  </button>
                </th>
              ))}
              <th className="task-manager-pid">PID</th>
              <th className="task-manager-action-heading">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                tabIndex={0}
                onContextMenu={(event) => {
                  event.preventDefault();
                  void showTaskMenu(task);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'ContextMenu' ||
                    (event.shiftKey && event.key === 'F10')
                  ) {
                    event.preventDefault();
                    void showTaskMenu(task);
                  }
                }}
              >
                <td className="task-manager-name">
                  <div className="task-manager-task-label">
                    <span className="task-manager-task-icon" aria-hidden="true">
                      {task.kind === 'process' ? (
                        <Layers size={16} />
                      ) : task.status === 'locked' ? (
                        <LockKeyhole size={16} />
                      ) : (
                        <Globe2 size={16} />
                      )}
                    </span>
                    <div>
                      {task.kind === 'tab' &&
                      (task.status === 'running' ||
                        task.status === 'stopped') ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act('activate', task)}
                          aria-label={`Switch to ${task.title}`}
                          title={`Switch to ${task.title}`}
                        >
                          {task.title}
                        </button>
                      ) : (
                        <strong>{task.title}</strong>
                      )}
                      <span className="task-manager-task-detail">
                        {task.site ||
                          (task.kind === 'process'
                            ? 'Browser process'
                            : task.status === 'locked'
                              ? 'Locked group'
                              : 'Saved tab')}
                        {task.status === 'stopped' && (
                          <span
                            className="task-manager-shared"
                            title="Switch to this tab and reload it to restart."
                          >
                            Stopped
                          </span>
                        )}
                        {task.shared && (
                          <span
                            className="task-manager-shared"
                            title="This usage belongs to a process shared with another task."
                          >
                            Shared
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="task-manager-number">
                  {task.cpu === null ? '—' : `${task.cpu.toFixed(1)}%`}
                </td>
                <td className="task-manager-number">
                  {task.memory === null
                    ? '—'
                    : `${(task.memory / 1048576).toFixed(1)} MB`}
                </td>
                <td className="task-manager-number task-manager-pid">
                  {task.pid ?? '—'}
                </td>
                <td className="task-manager-action">
                  <div className="task-manager-row-actions">
                    {task.canEnd ? (
                      <Button
                        size="1"
                        variant="surface"
                        color="gray"
                        disabled={busy}
                        onClick={() => act('end', task)}
                        aria-label={`End ${task.title}`}
                      >
                        End tab
                      </Button>
                    ) : task.canForceEnd ? (
                      <Button
                        size="1"
                        variant="surface"
                        color="gray"
                        disabled={busy}
                        onClick={() => forceEnd(task)}
                        aria-label={`Force end ${task.title}`}
                      >
                        Force end
                      </Button>
                    ) : (
                      <span
                        className="task-manager-protected"
                        title={protectedReason(task)}
                      >
                        <LockKeyhole size={12} aria-hidden="true" />
                        {task.status === 'locked'
                          ? 'Locked'
                          : task.status === 'sleeping'
                            ? 'Sleeping'
                            : task.status === 'stopped'
                              ? 'Stopped'
                              : 'Protected'}
                      </span>
                    )}
                    <IconButton
                      size="1"
                      variant="ghost"
                      color="gray"
                      disabled={busy}
                      onClick={() => void showTaskMenu(task)}
                      aria-label={`Actions for ${task.title}`}
                      title="Task actions"
                    >
                      <MoreHorizontal size={16} aria-hidden="true" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tasks.length && (
          <div className="task-manager-empty">
            <Activity size={24} aria-hidden="true" />
            <strong>
              {!state
                ? error
                  ? 'Unable to load tasks'
                  : 'Loading tasks…'
                : query.trim()
                  ? 'No matching tasks'
                  : filter === 'endable'
                    ? 'No tasks to end'
                    : 'No tasks to show'}
            </strong>
            {state && (
              <>
                <Text as="p" size="2" color="gray">
                  {query.trim()
                    ? 'Try another task name, website or process ID.'
                    : filter === 'endable'
                      ? 'Browser processes are available under All tasks.'
                      : 'Try a different filter.'}
                </Text>
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  onClick={() => {
                    if (query.trim()) setQuery('');
                    else setFilter('all');
                  }}
                >
                  {query.trim() ? 'Clear search' : 'Show all tasks'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      <footer>
        <Text size="1" color="gray">
          <span className="task-manager-live-dot" aria-hidden="true" />
          {state
            ? `${tasks.length} of ${allTasks.length} tasks · Live`
            : 'Connecting…'}
        </Text>
        <details className="task-manager-help">
          <summary>
            <Info size={13} aria-hidden="true" /> About resource usage
          </summary>
          <div>
            <p>
              CPU and memory update every 2 seconds. Shared rows report the same
              process usage, so don’t add them together.
            </p>
            <p>
              End tab keeps the tab saved; Close tab moves it to Archive. Force
              end stops a whole process and can affect shared tasks. Unsaved
              changes may be lost, and browser services may restart.
            </p>
          </div>
        </details>
      </footer>
    </main>
  );
}
