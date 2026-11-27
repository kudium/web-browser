import { getGroupLocks } from './groupLocks';
import { randomUUID } from 'crypto';
import { passwordVault } from './passwordManager';
import type { VaultItem } from '../browser/passwordManager';
import { localDay, isTodoDate, type TodoEntry } from '../browser/todos';

export function listTodos(scope?: string, all = false): TodoEntry[] {
  const vault = passwordVault();
  return vault
    .noteSummaries()
    .filter(
      (note) =>
        note.noteType === 'todo' &&
        !note.sensitive &&
        (!note.scope ||
          !getGroupLocks().locked(note.scope.replace(/^group:/, ''))) &&
        (all || !note.scope || note.scope === scope),
    )
    .flatMap((note) => {
      const item = vault.edit(note.id, note.scope);
      return (item.todo?.items || []).map((task) => ({
        ...task,
        noteId: note.id,
        noteTitle: note.title,
        scope: note.scope,
      }));
    });
}
function nextTodayOrder(scope?: string): number {
  return listTodos(scope).reduce(
    (rank, item) => Math.max(rank, (item.todayOrder ?? 0) + 1024),
    Date.now(),
  );
}
function assertUnlocked(scope?: string) {
  if (scope && getGroupLocks().locked(scope.replace(/^group:/, '')))
    throw new Error('Unlock this group to manage its tasks.');
}
export function addTodo(
  title: string,
  today: boolean,
  scope?: string,
  id?: string,
  sourceKey?: string,
  sourceLabel?: string,
  markdown?: string,
  initialNote?: VaultItem,
  details?: string,
) {
  if (typeof title !== 'string' || !title.trim() || title.length > 500)
    throw new Error('Provide a task title up to 500 characters.');
  assertUnlocked(scope);
  const vault = passwordVault();
  let note: VaultItem;
  if (initialNote) {
    if (!id || initialNote.id !== id || initialNote.scope !== scope || initialNote.kind !== 'note' || initialNote.sensitive || !initialNote.todo || initialNote.todo.items.length || vault.noteSummaries().some(item => item.id === id))
      throw new Error('Invalid new todo list.');
    note = {...initialNote, title: initialNote.title.trim() || 'Untitled todo', allowAI:false, sensitive:false};
  } else if (id) {
    const summary = vault
      .noteSummaries()
      .find((item) => item.id === id && (!item.scope || item.scope === scope));
    if (!summary || summary.noteType !== 'todo')
      throw new Error('Todo list unavailable.');
    note = vault.edit(id, summary.scope);
  } else {
    const summary = vault
      .noteSummaries()
      .find(
        (item) =>
          item.noteType === 'todo' &&
          !item.sensitive &&
          item.scope === scope &&
          item.todoInbox === true,
      );
    note = summary
      ? vault.edit(summary.id, scope)
      : {
          id: randomUUID(),
          kind: 'note',
          title: 'Tasks',
          notes: '',
          origin: '',
          username: '',
          password: '',
          fields: [],
          allowAI: false,
          scope,
          todo: { items: [], inbox: true },
        };
  }
  if (sourceKey) {
    const existing = vault
      .noteSummaries()
      .filter(
        (item) =>
          item.noteType === 'todo' && !item.sensitive && item.scope === scope,
      )
      .map((item) => vault.edit(item.id, scope))
      .find((item) => item.todo?.sourceKey === sourceKey);
    if (existing)
      return {
        recordId: existing.id,
        deepLink: `#kudiumbrowser-note-${existing.id}`,
      };
    // Hook-created tasks get their own list; they never modify a user's list.
    note = {
      ...note,
      id: randomUUID(),
      title: title.slice(0, 120),
      todo: { items: [], sourceKey, ...(sourceLabel ? { sourceLabel } : {}) },
    };
  }
  const task = {
    id: randomUUID(),
    title: title.trim(),
    ...(markdown === undefined ? {} : {markdown}),
    ...(details === undefined ? {} : {details}),
    ...(today
      ? {
          today: localDay(),
          todayOrder: nextTodayOrder(scope),
        }
      : {}),
  };
  vault.save(
    {
      ...note,
      todo: { ...note.todo, items: [...(note.todo?.items || []), task] },
    },
    note.scope,
  );
  return {
    recordId: note.id,
    taskId: task.id,
    deepLink: `#kudiumbrowser-note-${note.id}`,
  };
}
export function changeTodo(
  id: string,
  taskId: string,
  change: string,
  scope?: string,
  title?: string,
  beforeTaskId?: string,
  todayOrder?: number,
  date?: string,
  markdown?: string,
) {
  assertUnlocked(scope);
  const vault = passwordVault();
  const summary = vault
    .noteSummaries()
    .find((note) => note.id === id && (!note.scope || note.scope === scope));
  if (!summary || summary.noteType !== 'todo')
    throw new Error('Todo list unavailable.');
  const note = vault.edit(id, summary.scope);
  const items = [...(note.todo?.items || [])];
  const index = items.findIndex((task) => task.id === taskId);
  if (index < 0) throw new Error('Task unavailable.');
  const task = { ...items[index] };
  switch (change) {
    case 'complete':
      task.completedAt = new Date().toISOString();
      break;
    case 'undo':
      delete task.completedAt;
      break;
    case 'schedule':
      if (date === '') {
        delete task.today;
        delete task.todayOrder;
      } else {
        if (!isTodoDate(date)) throw new Error('Invalid task date.');
        task.today = date;
        task.todayOrder = nextTodayOrder(scope);
      }
      break;
    case 'today':
      task.today = localDay();
      task.todayOrder = nextTodayOrder(scope);
      break;
    case 'removeToday':
      delete task.today;
      break;
    case 'rename':
      if (typeof title !== 'string' || !title.trim() || title.length > 500)
        throw new Error('Invalid task title.');
      task.title = title.trim();
      if (markdown !== undefined) {
        if (typeof markdown !== 'string' || markdown.length > 30000) throw new Error('Invalid task formatting.');
        task.markdown = markdown;
      } else delete task.markdown;
      break;
    case 'move': {
      if (todayOrder !== undefined) {
        if (
          typeof todayOrder !== 'number' ||
          !Number.isFinite(todayOrder) ||
          Math.abs(todayOrder) > Number.MAX_SAFE_INTEGER ||
          task.today !== localDay()
        )
          throw new Error('Invalid Today position.');
        task.todayOrder = todayOrder;
        items[index] = task;
      } else {
        if (beforeTaskId === taskId) return;
        if (
          beforeTaskId !== undefined &&
          !items.some((item) => item.id === beforeTaskId)
        )
          throw new Error('Task unavailable.');
        items.splice(index, 1);
        const target =
          beforeTaskId === undefined
            ? items.length
            : items.findIndex((item) => item.id === beforeTaskId);
        items.splice(target, 0, task);
      }
      break;
    }
    case 'up':
    case 'down': {
      const target = index + (change === 'up' ? -1 : 1);
      if (target < 0 || target >= items.length) return;
      items.splice(index, 1);
      items.splice(target, 0, task);
      break;
    }
    case 'next':
      items.splice(index, 1);
      items.push(task);
      break;
    case 'delete':
      items.splice(index, 1);
      break;
    default:
      throw new Error('Invalid task action.');
  }
  if (!['next', 'delete', 'up', 'down', 'move'].includes(change))
    items[index] = task;
  vault.save({ ...note, todo: { ...note.todo, items } }, note.scope);
}

/** Delete only explicitly selected completed tasks, saving each owning note once. */
export function deleteCompletedTodos(refs: {noteId:string;taskId:string;scope?:string}[]) {
  if (!Array.isArray(refs) || !refs.length || refs.length>500) throw new Error('Invalid completed task selection.');
  const vault=passwordVault();
  const notes=new Map<string,{note:VaultItem;ids:Set<string>}>();
  for(const ref of refs){
    if(!ref || typeof ref.noteId!=='string' || typeof ref.taskId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(ref.noteId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(ref.taskId) || (ref.scope!==undefined && (typeof ref.scope!=='string' || ref.scope.length>200)))throw new Error('Invalid task.');
    assertUnlocked(ref.scope);
    let entry=notes.get(ref.noteId);
    if(!entry){entry={note:vault.edit(ref.noteId,ref.scope),ids:new Set()};notes.set(ref.noteId,entry);}
    if(entry.note.scope!==ref.scope || !entry.note.todo || !entry.note.todo.items.some(task=>task.id===ref.taskId && task.completedAt))throw new Error('Completed task changed. Refresh the list and try again.');
    entry.ids.add(ref.taskId);
  }
  for(const {note,ids} of notes.values())vault.save({...note,todo:{...note.todo!,items:note.todo!.items.filter(task=>!ids.has(task.id))}},note.scope);
}
