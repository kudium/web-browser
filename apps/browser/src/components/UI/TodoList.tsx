import { renderAIMessage } from './AIMessage';
import { browser } from '../../browser/client';
import { TaskTextEditor } from './TaskTextEditor';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { GripVertical, X, Plus, Check, ChevronRight } from 'lucide-react';
import {
  useAssistantPanelDocument,
  useAssistantPanelVisible,
} from './AssistantPanelContext';
import type { TodoData, TodoEntry } from '../../browser/todos';
import { localDay, orderedToday } from '../../browser/todos';
import { useTodoEntries } from './useTodoEntries';
import { TodoDatePicker } from './TodoDatePicker';
import { EmptyState } from './EmptyState';

function TaskDetails({text}:{text:string}) {
  const html=useMemo(()=>renderAIMessage(text),[text]);
  return <details className="todo-selection-details"><summary>Details</summary><div className="ai-markdown" dangerouslySetInnerHTML={{__html:html}} /></details>;
}

type Change =
  | 'complete'
  | 'undo'
  | 'today'
  | 'removeToday'
  | 'delete'
  | 'rename'
  | 'move'
  | 'schedule';
type Position = { beforeTaskId?: string; todayOrder?: number; date?: string };
const taskKey = (task: TodoEntry) => `${task.noteId}:${task.id}`;

/* Today and note lists share the same editor, rows and interaction model. */
function TaskChecklist({
  tasks,
  busy,
  todayView = false,
  onChange,
  onMove,
  onSchedule,
  onDeleteCompleted,
  onAdd,
  focusTask,
  focusKey,
}: {
  tasks: TodoEntry[];
  busy: boolean;
  todayView?: boolean;
  onChange: (task: TodoEntry, change: Change, title?: string, markdown?: string) => void;
  onMove: (task: TodoEntry, target: TodoEntry, after: boolean) => void;
  onSchedule: (task: TodoEntry, date: string) => Promise<boolean>;
  onDeleteCompleted: (tasks: TodoEntry[]) => Promise<boolean>;
  onAdd?: (title: string) => Promise<boolean>;
  focusTask?: string;
  focusKey?: string;
}) {
  const panelDocument = useAssistantPanelDocument();
  const visible = useAssistantPanelVisible();
  const addInput = useRef<HTMLInputElement>(null);
  const canAdd = !!onAdd;
  useEffect(() => {
    if (visible && canAdd && !focusTask) addInput.current?.focus();
  }, [visible, canAdd, focusTask, focusKey, panelDocument]);
  const [title, setTitle] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [futureOpen, setFutureOpen] = useState(true);
  const futureId = useId();
  const day = localDay();
  const isFuture = (task: TodoEntry) => todayView && !!task.today && task.today > day;
  const completedId = useId();
  const [dragging, setDragging] = useState<string>();
  const [drop, setDrop] = useState<{ key: string; after: boolean }>();
  const focusedTask = tasks.find((task) => task.id === focusTask);
  const focusedTaskKey = focusedTask ? taskKey(focusedTask) : undefined;
  useEffect(() => {
    if (focusedTask?.completedAt) setCompletedOpen(true);
    if (focusedTask && isFuture(focusedTask)) setFutureOpen(true);
  }, [focusedTaskKey, focusedTask?.completedAt, focusedTask?.today, day]);
  useEffect(() => {
    if (visible && focusedTaskKey)
      panelDocument.getElementById(`todo-${focusedTaskKey}`)?.focus();
  }, [focusedTaskKey, focusKey, visible, panelDocument, completedOpen, futureOpen]);
  const activeTasks = tasks.filter(task => !task.completedAt && !isFuture(task));
  const futureTasks = tasks.filter(task => !task.completedAt && isFuture(task)).sort((a,b) => a.today!.localeCompare(b.today!));
  const completedTasks = tasks.filter(task => task.completedAt);
  const ordered = [...activeTasks, ...futureTasks, ...completedTasks];
  const renderTask = (task: TodoEntry) => {
          const key = taskKey(task);
          return (
            <div
              className="todo-row"
              data-completed={!!task.completedAt}
              data-dragging={dragging === key}
              data-drop={
                drop?.key === key
                  ? drop.after
                    ? 'after'
                    : 'before'
                  : undefined
              }
              key={key}
              onDragOver={(event) => {
                const source = tasks.find((item) => taskKey(item) === dragging);
                if (
                  !source ||
                  busy ||
                  key === dragging ||
                  !!source.completedAt !== !!task.completedAt ||
                  isFuture(source) !== isFuture(task)
                )
                  return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const rect = event.currentTarget.getBoundingClientRect();
                const after = event.clientY > rect.top + rect.height / 2;
                if (drop?.key !== key || drop.after !== after)
                  setDrop({ key, after });
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = tasks.find((item) => taskKey(item) === dragging);
                if (source && drop?.key === key && !busy)
                  onMove(source, task, drop.after);
                setDragging(undefined);
                setDrop(undefined);
              }}
            >
              <label className="todo-checkbox">
                <input
                id={`todo-${key}`}
                type="checkbox"
                aria-label={`Complete ${task.title}`}
                checked={!!task.completedAt}
                disabled={busy}
                onChange={() =>
                  onChange(task, task.completedAt ? 'undo' : 'complete')
                }
                />
                <Check className="todo-checkbox-check" size={14} strokeWidth={3} aria-hidden="true" />
              </label>
              <div className="todo-content">
              {task.markdown || /https?:\/\/|\*\*|_[^_]+_|`/.test(task.title) ? <TaskTextEditor title={task.title} markdown={task.markdown || task.title} disabled={busy} onSave={(title,markdown)=>onChange(task,'rename',title,markdown)} /> : <textarea
                rows={1}
                className="todo-title"
                aria-label={`Task title: ${task.title}`}
                key={`${key}:${task.title}`}
                defaultValue={task.title}
                maxLength={500}
                disabled={busy}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== task.title)
                    onChange(task, 'rename', value);
                  else event.target.value = task.title;
                }}
              />
              }
              {task.details && <TaskDetails text={task.details} />}
              {todayView && task.today && task.today !== day && !task.completedAt && <small className="todo-scheduled-date">{task.today < day ? 'Overdue · ' : ''}{new Date(`${task.today}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</small>}
              </div>
              <div className="todo-row-actions">
                {!task.completedAt && (
                  <TodoDatePicker
                    title={task.title}
                    date={task.today}
                    disabled={busy}
                    onSave={(date) => onSchedule(task, date)}
                  />
                )}

                <button
                  className="todo-drag"
                  aria-label={`Reorder ${task.title}`}
                  title="Drag to reorder · Alt + arrow keys"
                  draggable={!busy}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', key);
                    event.dataTransfer.effectAllowed = 'move';
                    setDragging(key);
                  }}
                  onDragEnd={() => {
                    setDragging(undefined);
                    setDrop(undefined);
                  }}
                  onKeyDown={(event) => {
                    if (
                      !event.altKey ||
                      busy ||
                      !['ArrowUp', 'ArrowDown'].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    const peers = ordered.filter(
                      (item) => !!item.completedAt === !!task.completedAt && isFuture(item) === isFuture(task),
                    );
                    const target =
                      peers[
                        peers.indexOf(task) + (event.key === 'ArrowUp' ? -1 : 1)
                      ];
                    if (target) onMove(task, target, event.key === 'ArrowDown');
                  }}
                >
                  <GripVertical size={14} />
                </button>

                <button
                  aria-label={`Delete ${task.title}`}
                  title="Delete task"
                  disabled={busy}
                  onClick={() => onChange(task, 'delete')}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          );

  };
  return (
    <>
      {onAdd && (
        <form
          className="todo-add"
          onSubmit={async (event) => {
            event.preventDefault();
            if (title.trim() && (await onAdd(title.trim()))) setTitle('');
          }}
        >
          <Plus size={16} aria-hidden="true" />
          <input
            ref={addInput}
            aria-label={todayView ? 'New task for Today' : 'New task'}
            placeholder="Add a task…"
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
          />
          {title.trim() && (
            <button type="submit" disabled={busy}>
              Add
            </button>
          )}
        </form>
      )}
      {!tasks.length && <EmptyState title="No tasks" description={null} />}
      <div className="todo-items">
        {activeTasks.map(renderTask)}
      </div>
      {!!futureTasks.length && <section className="todo-completed todo-future">
        <div className="todo-completed-header">
          <button type="button" className="todo-completed-toggle" aria-expanded={futureOpen} aria-controls={futureId} onClick={()=>setFutureOpen(open=>!open)}>
            <ChevronRight size={14} aria-hidden="true"/><span>Upcoming</span><span className="todo-completed-count">{futureTasks.length}</span>
          </button>
        </div>
        <div id={futureId} hidden={!futureOpen} className="todo-items">{futureOpen && futureTasks.map(renderTask)}</div>
      </section>}
      {!!completedTasks.length && <section className="todo-completed">
        <div className="todo-completed-header">
        <button type="button" className="todo-completed-toggle" aria-expanded={completedOpen} aria-controls={completedId} onClick={()=>setCompletedOpen(open=>!open)}>
          <ChevronRight size={14} aria-hidden="true"/><span>Completed</span><span className="todo-completed-count">{completedTasks.length}</span>
        </button>
        <button type="button" className="todo-completed-delete" disabled={busy} onClick={()=>onDeleteCompleted(completedTasks)}>Delete all</button>
        </div>
        <div id={completedId} hidden={!completedOpen} className="todo-items">{completedOpen && completedTasks.map(renderTask)}</div>
      </section>}
    </>
  );
}

function movePosition(
  tasks: TodoEntry[],
  task: TodoEntry,
  target: TodoEntry,
  after: boolean,
  todayView: boolean,
): Position {
  const remaining = tasks.filter((item) => taskKey(item) !== taskKey(task));
  const index =
    remaining.findIndex((item) => taskKey(item) === taskKey(target)) +
    (after ? 1 : 0);
  if (!todayView) return { beforeTaskId: remaining[index]?.id };
  const rank = (item: TodoEntry) =>
    item.todayOrder ?? tasks.indexOf(item) * 1024;
  const left = remaining[index - 1];
  const right = remaining[index];
  return {
    todayOrder:
      left && right
        ? (rank(left) + rank(right)) / 2
        : left
          ? rank(left) + 1024
          : right
            ? rank(right) - 1024
            : 0,
  };
}

function TaskEditor({
  tasks,
  scope,
  noteId,
  onChanged,
  initialNote,
  todayView,
  error,
  focusTask,
}: {
  tasks: TodoEntry[];
  scope?: string;
  noteId?: string;
  onChanged?: () => Promise<void>;
  initialNote?: import('../../browser/passwordManager').VaultItem;
  todayView?: boolean;
  error?: string;
  focusTask?: string;
}) {
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(true);
    try {
      await work();
      await onChanged?.();
      setFailure('');
      return true;
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const change = (
    task: TodoEntry,
    action: Change,
    title?: string,
    position?: Position,
    markdown?: string,
  ) =>
    run(() =>
      window.electron.passwordManager({
        action: 'todoChange',
        id: task.noteId,
        taskId: task.id,
        scope: task.scope,
        change: action,
        title,
        ...(markdown === undefined ? {} : {markdown}),
        ...position,
      }),
    );
  const today = todayView
    ? orderedToday(
        tasks
          .filter((task) => !!task.today && (!task.completedAt || task.today >= localDay()))
          .map((task, index) => ({
            ...task,
            todayOrder: task.todayOrder ?? index * 1024,
          })),
      )
    : tasks;
  return (
    <div className="todo-list">
      <TaskChecklist
        tasks={today}
        busy={busy}
        todayView={todayView}
        focusTask={focusTask}
        focusKey={noteId || `today:${scope || 'browser'}`}
        onChange={(task,action,title,markdown)=>change(task,action,title,undefined,markdown)}
        onDeleteCompleted={tasks => run(async()=>{
          if(!await browser.confirm({message:`Delete ${tasks.length} completed tasks?`,detail:'Only completed tasks shown in this list will be removed. This cannot be undone.',confirm:'Delete all'}))return;
          await window.electron.passwordManager({action:'todoDeleteCompleted',tasks:tasks.map(task=>({noteId:task.noteId,taskId:task.id,scope:task.scope}))});
        })}
        onSchedule={(task, date) =>
          change(task, 'schedule', undefined, { date })
        }
        onMove={(task, target, after) =>
          change(
            task,
            'move',
            undefined,
            movePosition(today, task, target, after, !!todayView),
          )
        }
        onAdd={(title) =>
          run(() =>
            window.electron.passwordManager({
              action: 'todoAdd',
              initialNote,
              id: noteId,
              title,
              today: todayView,
              scope,
            }),
          )
        }
      />
      {(error || failure) && <p role="alert">{failure || error}</p>}
    </div>
  );
}

export function TodoList({
  noteId,
  data,
  scope,
  onChanged,
  initialNote,
  focusTask,
}: {
  noteId: string;
  data: TodoData;
  scope?: string;
  onChanged: () => Promise<void>;
  initialNote?: import('../../browser/passwordManager').VaultItem;
  focusTask?: string;
}) {
  const tasks = data.items.map((task) => ({
    ...task,
    noteId,
    noteTitle: '',
    scope,
  }));
  return (
    <TaskEditor
      tasks={tasks}
      noteId={noteId}
      scope={scope}
      onChanged={onChanged}
      initialNote={initialNote}
      focusTask={focusTask}
    />
  );
}
export function TodayTodos({ scope, all }: { scope?: string; all: boolean }) {
  const { entries, error } = useTodoEntries(scope, all);
  return <TaskEditor tasks={entries} scope={scope} todayView error={error} />;
}
