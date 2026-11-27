/** @jest-environment node */
import { localDay, validateTodo, orderedToday } from '../browser/todos';
import { normalizeNote, validateSyncedNotes } from '../browser/notes';
import { summaryOf } from '../main/passwordManager/records';
import { savePageSelection } from '../main/pageSelection';
import { addTodo, changeTodo, listTodos, deleteCompletedTodos } from '../main/todos';
import { createAITodo } from '../main/aiTodos';
import type { VaultItem } from '../browser/passwordManager';
const records = new Map<string, VaultItem>();
const locked = new Set<string>();
jest.mock('../main/groupLocks', () => ({
  getGroupLocks: () => ({ locked: (id: string) => locked.has(id) }),
}));
jest.mock('../main/passwordManager', () => ({
  passwordVault: () => ({
    isOrdinaryNote:(id:string)=>records.has(id),
    noteSummaries: () => [...records.values()].map(summaryOf),
    edit: (id: string) => JSON.parse(JSON.stringify(records.get(id))),
    save: (note: VaultItem) => {
      records.set(note.id, normalizeNote(note, note.scope));
      return note.id;
    },
  }),
}));
beforeEach(() => {
  records.clear();
  locked.clear();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 10, 26, 12));
});
afterEach(() => jest.useRealTimers());
test('validates tasks and keeps task content out of summaries and in backups', () => {
  const todo = {
    items: [{ id: 'task', title: 'Private action', today: localDay() }],
  };
  const note = normalizeNote({
    id: 'note',
    kind: 'note',
    title: 'List',
    notes: '',
    todo,
    origin: '',
    username: '',
    password: '',
    fields: [],
    allowAI: false,
  });
  expect(summaryOf(note)).toMatchObject({ noteType: 'todo' });
  expect(JSON.stringify(summaryOf(note))).not.toContain('Private action');
  expect(
    validateSyncedNotes([{ id: 'note', title: 'List', notes: '', todo }])[0]
      .todo,
  ).toEqual(todo);
  expect(() =>
    validateTodo({ items: [todo.items[0], todo.items[0]] }),
  ).toThrow();
});
test('unfinished tasks survive midnight and can be selected for the new day', () => {
  addTodo('Review', true);
  const first = listTodos()[0];
  expect(first.today).toBe(localDay());
  jest.setSystemTime(new Date(2026, 10, 27, 0, 1));
  expect(listTodos()).toHaveLength(1);
  expect(listTodos()[0].today).not.toBe(localDay());
  changeTodo(first.noteId, first.id, 'today');
  expect(listTodos()[0].today).toBe(localDay());
});
test('completion, undo, reorder and rename preserve task identity', () => {
  const a = addTodo('A', true);
  addTodo('B', true);
  changeTodo(a.recordId, a.taskId!, 'complete');
  expect(listTodos()[0].completedAt).toBeDefined();
  changeTodo(a.recordId, a.taskId!, 'undo');
  changeTodo(a.recordId, a.taskId!, 'next');
  expect(listTodos().map((item) => item.title)).toEqual(['B', 'A']);
  changeTodo(a.recordId, a.taskId!, 'rename', undefined, 'Updated');
  expect(listTodos()[1]).toMatchObject({ title: 'Updated' });
  expect(listTodos()[1].completedAt).toBeUndefined();
});
test('hook keys deduplicate without mutating a user list', () => {
  const user = addTodo('User task', true);
  const hook = addTodo('Hook task', true, 'group:a', undefined, 'hook-key');
  const duplicate = addTodo(
    'Updated hook task',
    true,
    'group:a',
    undefined,
    'hook-key',
  );
  expect(duplicate.recordId).toBe(hook.recordId);
  expect(records.size).toBe(2);
  expect(records.get(user.recordId)?.todo?.items[0].title).toBe('User task');
});
test('group scopes and locks prevent task reads and changes', () => {
  const task = addTodo('Scoped', true, 'group:a');
  expect(listTodos('group:b')).toHaveLength(0);
  expect(() =>
    changeTodo(task.recordId, task.taskId!, 'complete', 'group:b'),
  ).toThrow();
  locked.add('a');
  expect(listTodos(undefined, true)).toHaveLength(0);
  expect(() =>
    changeTodo(task.recordId, task.taskId!, 'complete', 'group:a'),
  ).toThrow();
  expect(() => addTodo('Blocked', true, 'group:a')).toThrow();
});

test('drop reorders a list without losing edits and rejects foreign targets', () => {
  const a = addTodo('A', true);
  const b = addTodo('B', true);
  changeTodo(b.recordId, b.taskId!, 'rename', undefined, 'Edited B');
  changeTodo(b.recordId, b.taskId!, 'move', undefined, undefined, a.taskId);
  expect(listTodos().map((task) => task.title)).toEqual(['Edited B', 'A']);
  expect(() => changeTodo(a.recordId, a.taskId!, 'move', undefined, undefined, 'foreign')).toThrow();
  expect(listTodos()).toHaveLength(2);
});

test('Today order is independent of list order and validates saved ranks', () => {
  const a = addTodo('A', true);
  const b = addTodo('B', true);
  const rank = listTodos()[0].todayOrder! - 1024;
  changeTodo(b.recordId, b.taskId!, 'move', undefined, undefined, undefined, rank);
  expect(listTodos().map((task) => task.title)).toEqual(['A', 'B']);
  expect(listTodos()[1].todayOrder).toBe(rank);
  expect(orderedToday(listTodos()).map((task) => task.title)).toEqual(['B', 'A']);
  expect(() => changeTodo(a.recordId, a.taskId!, 'move', undefined, undefined, undefined, NaN)).toThrow();
  expect(() => validateTodo({ items: [{ id:'a', title:'A', todayOrder: Infinity }] })).toThrow();
});

test('schedules dates without losing task edits and rejects invalid calendar dates', () => {
  const saved = addTodo('Review', true);
  changeTodo(saved.recordId, saved.taskId!, 'rename', undefined, 'Review report');
  changeTodo(saved.recordId, saved.taskId!, 'schedule', undefined, undefined, undefined, undefined, '2026-11-27');
  expect(listTodos()[0]).toMatchObject({title:'Review report',today:'2026-11-27'});
  expect(listTodos().filter((task) => task.today === localDay())).toHaveLength(0);
  jest.setSystemTime(new Date(2026,10,27,0,1));
  expect(listTodos().filter((task) => task.today === localDay())).toHaveLength(1);
  expect(() => changeTodo(saved.recordId, saved.taskId!, 'schedule', undefined, undefined, undefined, undefined, '2026-02-30')).toThrow();
  changeTodo(saved.recordId, saved.taskId!, 'schedule', undefined, undefined, undefined, undefined, '');
  expect(listTodos()[0].today).toBeUndefined();
});

test('page selections and links persist in Today for the clicked group', () => {
  savePageSelection('today','Review this\nhttps://example.com/review?id=42','group:page');
  savePageSelection('today','https://example.com/next','group:page');
  expect(listTodos('group:page')).toEqual([
    expect.objectContaining({title:'Review this\nhttps://example.com/review?id=42',today:localDay(),scope:'group:page'}),
    expect.objectContaining({title:'https://example.com/next',today:localDay(),scope:'group:page'}),
  ]);
  expect(listTodos('group:other')).toHaveLength(0);
  expect(records.size).toBe(1);
});

test('captured Markdown links stay separate from the editable task title and survive storage', () => {
  const saved = savePageSelection('today','Visit [España](https://example.com/Spain)','group:page','Visit España');
  expect(listTodos('group:page')[0]).toMatchObject({title:'Visit España',markdown:'Visit [España](https://example.com/Spain)'});
  expect(validateTodo({items:listTodos('group:page').map(({noteId,noteTitle,scope,...task})=>task)}).items[0].markdown).toContain('Spain');
  changeTodo(saved.recordId, 'taskId' in saved ? saved.taskId! : '', 'rename','group:page','New task');
  expect(listTodos('group:page')[0].markdown).toBeUndefined();
});

test('rich edits preserve Markdown links and formatting through task saves', () => {
  const task=addTodo('Visit Spain',true,'group:page');
  changeTodo(task.recordId,task.taskId!,'rename','group:page','Visit España',undefined,undefined,undefined,'Visit **[España](https://example.com/Spain)**');
  expect(listTodos('group:page')[0]).toMatchObject({title:'Visit España',markdown:'Visit **[España](https://example.com/Spain)**'});
});

test('bulk deletion removes completed tasks only and rejects stale active selections',()=>{
  const a=addTodo('Done',true,'group:page');const b=addTodo('Active',true,'group:page');
  changeTodo(a.recordId,a.taskId!,'complete','group:page');
  expect(()=>deleteCompletedTodos([{noteId:b.recordId,taskId:b.taskId!,scope:'group:page'}])).toThrow('Completed task changed');
  expect(listTodos('group:page')).toHaveLength(2);
  deleteCompletedTodos([{noteId:a.recordId,taskId:a.taskId!,scope:'group:page'}]);
  expect(listTodos('group:page').map(task=>task.title)).toEqual(['Active']);
});

test('creates a new todo list atomically with its first task', () => {
  const draft: VaultItem = {id:'draft',kind:'note',title:'',notes:'',todo:{items:[]},origin:'',username:'',password:'',fields:[],allowAI:false,sensitive:false};
  expect(records.size).toBe(0);
  addTodo('First task',false,undefined,draft.id,undefined,undefined,undefined,draft);
  expect(records.get('draft')?.todo?.items).toEqual([expect.objectContaining({title:'First task'})]);
  expect(()=>addTodo('Another',false,undefined,draft.id,undefined,undefined,undefined,draft)).toThrow('Invalid new todo list');
});

test('long page selections persist as short tasks with intact details and links', () => {
  const text='Read [this](https://example.com/article). '.repeat(40);
  savePageSelection('today',text,'group:page');
  const item=listTodos('group:page')[0];
  expect(item.title.length).toBeLessThanOrEqual(160);
  expect(item.details).toBe(text.trim());
  expect(validateTodo({items:[{id:item.id,title:item.title,details:item.details}]}).items[0].details).toBe(text.trim());
});
test('append to an active todo list adds a task without replacing its existing tasks',()=>{
  const first=addTodo('First',false,'group:other');
  savePageSelection('append','Second','group:page',undefined,{id:first.recordId,scope:'group:other',kind:'todo'});
  expect(listTodos('group:other').map(task=>task.title)).toEqual(['First','Second']);
});


test('AI todo creation appends to Today without granting access to existing tasks', () => {
  const manual = addTodo('Existing private task', true, 'group:a');
  const result = createAITodo({ title: ' Review release ', todoDetails: '**Check** both installers' }, 'group:a');
  expect(result).toMatchObject({ created: true, today: localDay(), recordId: manual.recordId });
  expect(result.deepLink).toBe(`#kudiumbrowser-note-${manual.recordId}`);
  expect(listTodos('group:a')).toHaveLength(2);
  expect(listTodos('group:a')[1]).toMatchObject({ id: result.taskId, title: 'Review release', details: '**Check** both installers', today: localDay() });
  expect(records.get(manual.recordId)?.allowAI).toBe(false);
  expect(JSON.stringify(result)).not.toContain('Existing private task');
});

test('AI todo creation respects group and explicit shared destinations', () => {
  createAITodo({ title: 'Group task', today: false }, 'group:a');
  const shared = createAITodo({ title: 'Shared task', destination: 'browser' }, 'group:a');
  expect(listTodos('group:a')[0]).toMatchObject({ title: 'Group task', scope: 'group:a' });
  expect(listTodos('group:a')[0].today).toBeUndefined();
  expect(listTodos('group:b').map(item => item.title)).toEqual(['Shared task']);
  expect(records.get(shared.recordId)?.scope).toBeUndefined();
  locked.add('a');
  expect(() => createAITodo({ title: 'Blocked' }, 'group:a')).toThrow('Unlock this group');
});

test('invalid AI todo inputs fail before storage changes', () => {
  for (const input of [{}, { title: ' ' }, { title: 'a'.repeat(501) }, { title: 'Task', today: 'true' }, { title: 'Task', todoDetails: 'x'.repeat(30001) }, { title: 'Task', destination: 'other-group' }]) {
    expect(() => createAITodo(input, 'group:a')).toThrow();
  }
  expect(records.size).toBe(0);
  createAITodo({ title: 'a'.repeat(500) }, 'group:a');
  expect(listTodos('group:a')[0].title).toHaveLength(500);
});
