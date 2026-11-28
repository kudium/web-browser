import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '@radix-ui/themes';
import {
  Check,
  ExternalLink,
  Mail,
  Phone,
  ChevronRight,
  LoaderCircle,
  ListTodo,
  Sparkles,
} from 'lucide-react';
import { todoLinks } from '../../browser/todoLinks';
import type { HookSuggestion } from '../../browser/hookSuggestions';
import { orderedToday, type TodoEntry } from '../../browser/todos';
import { PanelPopoverContent } from './PanelDialog';
import { BrowserRecommendations } from './BrowserRecommendations';
import { useTodoEntries } from './useTodoEntries';
import { openTodoNote } from './noteNavigation';
const taskKey = (task: TodoEntry) => `${task.noteId}:${task.id}`;
function reconcile(order: string[], ids: string[]) {
  return [
    ...order.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !order.includes(id)),
  ];
}
export function ActionSuggestions({
  scope,
  groupId,
  onMarketplace,
}: {
  scope?: string;
  groupId?: string;
  onMarketplace: () => boolean;
}) {
  const { entries, day } = useTodoEntries(scope);
  const [hooks, setHooks] = useState<HookSuggestion[]>([]);
  const [queue, setQueue] = useState<'today' | 'hooks'>('today');
  const [todayOrder, setTodayOrder] = useState<string[]>([]);
  const [hookOrder, setHookOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<TodoEntry[]>([]);
  const [details, setDetails] = useState(false);
  const [picker, setPicker] = useState(false);
  const identity = useRef('');
  identity.current = JSON.stringify([scope, groupId]);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let timer: number | undefined;
    setHooks([]);
    setError('');
    setBusy(false);
    setCompleted([]);
    setTodayOrder([]);
    setHookOrder([]);
    setDetails(false);
    setPicker(false);
    const refresh = async () => {
      const current = ++generation;
      try {
        const result = (await window.electron.passwordManager({
          action: 'hookSuggestions',
          groupId,
        })) as HookSuggestion[];
        if (!alive || current !== generation) return;
        setHooks(result);
        clearTimeout(timer);
        if (result.length)
          timer = window.setTimeout(
            refresh,
            Math.max(
              1,
              Math.min(...result.map((item) => item.expiresAt)) - Date.now(),
            ),
          );
      } catch {
        if (alive && current === generation) setHooks([]);
      }
    };
    refresh();
    const stop = window.electron.siteDeveloper?.onSuggestionsChanged?.(refresh);
    const groups = window.electron.groupLocks?.onState?.(() => {
      setHooks([]);
      refresh();
    });
    window.addEventListener('focus', refresh);
    return () => {
      alive = false;
      generation++;
      clearTimeout(timer);
      stop?.();
      groups?.();
      window.removeEventListener('focus', refresh);
    };
  }, [scope, groupId]);
  const today = orderedToday(
    entries.filter(
      (task) =>
        !completed.includes(task) && !task.completedAt && task.today === day,
    ),
  );
  const ranks = useRef(new Map<string, number | undefined>());
  const todos = reconcile(todayOrder, today.map(taskKey)).map((id) =>
    today.find((task) => taskKey(task) === id)!,
  );
  const suggestions = reconcile(
    hookOrder,
    hooks.map((item) => item.id),
  ).map((id) => hooks.find((item) => item.id === id)!);
  useEffect(() => {
    const moved = today.some(
      (task) =>
        ranks.current.has(taskKey(task)) &&
        ranks.current.get(taskKey(task)) !== task.todayOrder,
    );
    setTodayOrder((order) =>
      moved ? today.map(taskKey) : reconcile(order, today.map(taskKey)),
    );
    ranks.current = new Map(
      today.map((task) => [taskKey(task), task.todayOrder]),
    );
  }, [entries, day]);
  useEffect(() => {
    setHookOrder((order) =>
      reconcile(
        order,
        hooks.map((item) => item.id),
      ),
    );
  }, [hooks]);
  const activeQueue =
    queue === 'today'
      ? todos.length
        ? 'today'
        : 'hooks'
      : suggestions.length
        ? 'hooks'
        : 'today';
  const task = activeQueue === 'today' ? todos[0] : undefined;
  const hook = activeQueue === 'hooks' ? suggestions[0] : undefined;
  const count = task ? todos.length : suggestions.length;
  const links = useMemo(() => todoLinks(task?.details || task?.markdown || task?.title || ''), [task?.title, task?.markdown, task?.details]);
  const run = async (work: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    const key = identity.current;
    setBusy(true);
    setError('');
    try {
      await work();
      if (key === identity.current) after?.();
    } catch (failure) {
      if (key === identity.current)
        setError(String(failure instanceof Error ? failure.message : failure));
    } finally {
      if (key === identity.current) setBusy(false);
    }
  };
  if (!task && !hook) {
    if (error)
      return (
        <section
          className="browser-recommendations action-suggestions"
          aria-label="Suggested actions"
        >
          <div className="recommendation-stack">
            <article
              className="onboarding-suggestion recommendation-card"
              data-front
            >
              <div>
                {error && (
                  <p className="suggestion-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </article>
          </div>
        </section>
      );
    return <BrowserRecommendations onMarketplace={onMarketplace} />;
  }
  return (
    <section
      className="browser-recommendations action-suggestions"
      aria-label="Suggested actions"
    >
      <div className="recommendation-stack">
        <article
          className="onboarding-suggestion recommendation-card"
          data-front
        >
          {task ? <ListTodo size={16} /> : <Sparkles size={16} />}
          <div className="suggestion-content">
            <div className="suggestion-main">
              <button
                className="suggestion-open"
                onClick={() =>
                  task
                    ? openTodoNote(task.noteId, task.id)
                    : setDetails(!details)
                }
              >
                <strong>{task?.title || hook?.title}</strong>
                {!task && <p>{hook?.description || hook?.hookName}</p>}
              </button>
              <div className={`recommendation-actions ${task ? 'suggestion-task-actions' : ''}`}>
                <button
                  className={task ? 'suggestion-complete-overlay' : undefined}
                  aria-label={task ? 'Complete' : 'Run'}
                  title={task ? 'Complete task' : 'Run action'}
                  disabled={busy}
                  onClick={() =>
                    task
                      ? run(
                          () =>
                            window.electron.passwordManager({
                              action: 'todoChange',
                              id: task.noteId,
                              taskId: task.id,
                              change: 'complete',
                              scope: task.scope,
                            }),
                          () =>
                            setCompleted((previous) => [
                              ...previous.filter((item) =>
                                entries.includes(item),
                              ),
                              task,
                            ]),
                        )
                      : run(() =>
                          window.electron.passwordManager({
                            action: 'hookSuggestionRun',
                            id: hook!.id,
                            groupId,
                          }),
                        )
                  }
                >
                  {busy ? (
                    <LoaderCircle
                      size={14}
                      className="suggestion-busy"
                      aria-label="Working"
                    />
                  ) : task ? (
                    <>
                      <Check size={16} strokeWidth={3} />
                    </>
                  ) : (
                    'Run'
                  )}
                </button>
                {count > 1 && (
                  <Popover.Root open={picker} onOpenChange={setPicker}>
                    <Popover.Trigger>
                      <button
                        className="suggestion-queue-picker"
                        aria-label="Choose queued action"
                      >
                        1 of {count}
                      </button>
                    </Popover.Trigger>
                    <PanelPopoverContent
                      className="suggestion-queue-list"
                      size="1"
                    >
                      {(task ? todos : suggestions).map((item) => (
                        <button
                          key={task ? taskKey(item as TodoEntry) : item.id}
                          onClick={() => {
                            if (task) {
                              const key = taskKey(item as TodoEntry);
                              setTodayOrder((order) => [
                                key,
                                ...reconcile(order, todos.map(taskKey)).filter(
                                  (id) => id !== key,
                                ),
                              ]);
                            } else
                              setHookOrder((order) => [
                                item.id,
                                ...reconcile(
                                  order,
                                  suggestions.map((value) => value.id),
                                ).filter((id) => id !== item.id),
                              ]);
                            setPicker(false);
                            setDetails(false);
                          }}
                        >
                          {item.title}
                        </button>
                      ))}
                    </PanelPopoverContent>
                  </Popover.Root>
                )}
                {count > 1 && <button
                  aria-label="Next"
                  title="Next suggestion"
                  className="recommendation-later"
                  disabled={busy}
                  onClick={() => {
                    if (task)
                      setTodayOrder((order) => [
                        ...reconcile(order, todos.map(taskKey)).filter(
                          (id) => id !== taskKey(task),
                        ),
                        taskKey(task),
                      ]);
                    else
                      setHookOrder((order) => [
                        ...reconcile(
                          order,
                          suggestions.map((item) => item.id),
                        ).filter((id) => id !== hook!.id),
                        hook!.id,
                      ]);
                    setDetails(false);
                    setError('');
                  }}
                >
                  <ChevronRight size={16} />
                </button>}
              </div>
            </div>
            {details && hook && (
              <p>
                From {hook.hookName}. Running this action invokes its approved
                page hook.
              </p>
            )}
            <div className="suggestion-queues">
              {links.slice(0, 2).map((link) => (
                <a
                  className="suggestion-link"
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.href}
                  aria-label={`${link.label}: ${link.href.replace(/^(mailto:|tel:)/, '')}`}
                >
                  {link.kind === 'email' ? (
                    <Mail size={12} />
                  ) : link.kind === 'phone' ? (
                    <Phone size={12} />
                  ) : (
                    <ExternalLink size={12} />
                  )}
                  <span>{link.label}</span>
                </a>
              ))}
              {links.length > 2 && (
                <Popover.Root>
                  <Popover.Trigger>
                    <button aria-label="More task links">
                      +{links.length - 2}
                    </button>
                  </Popover.Trigger>
                  <PanelPopoverContent
                    className="suggestion-link-list"
                    size="1"
                  >
                    {links.slice(2).map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={link.href}
                      >
                        {link.label}
                      </a>
                    ))}
                  </PanelPopoverContent>
                </Popover.Root>
              )}
              {!!todos.length && !!suggestions.length && (
                <button
                  aria-pressed={activeQueue === 'today'}
                  onClick={() => {
                    setQueue('today');
                    setDetails(false);
                    setError('');
                  }}
                >
                  Today · {todos.length}
                </button>
              )}
              {!!suggestions.length && !!todos.length && (
                <button
                  aria-pressed={activeQueue === 'hooks'}
                  onClick={() => {
                    setQueue('hooks');
                    setDetails(false);
                    setError('');
                  }}
                >
                  Hooks · {suggestions.length}
                </button>
              )}
            </div>
            {error && (
              <p className="suggestion-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
