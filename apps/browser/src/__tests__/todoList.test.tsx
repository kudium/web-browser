import { browser } from '../browser/client';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TodoList, TodayTodos } from '../components/UI/TodoList';
import { AssistantPanelVisibilityContext } from '../components/UI/AssistantPanelContext';
import { localDay } from '../browser/todos';
const request = jest.fn().mockResolvedValue([]);
const entries = [
  {
    id: 'a',
    title: 'First',
    noteId: 'list',
    noteTitle: 'Tasks',
    today: localDay(),
    todayOrder: 1024,
  },
  {
    id: 'b',
    title: 'Second',
    noteId: 'other',
    noteTitle: 'Tasks',
    today: localDay(),
    todayOrder: 2048,
  },
];
jest.mock('../components/UI/useTodoEntries', () => ({
  useTodoEntries: () => ({ entries, error: '' }),
}));
beforeEach(() => {
  request.mockClear();
  Object.assign(window, { electron: { passwordManager: request } });
});
test('Today uses editable shared rows without repeated labels or introductory copy', async () => {
  render(<TodayTodos all={false} />);
  expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Open list/ })).not.toBeInTheDocument();
  const title = screen.getByLabelText('Task title: First');
  title.focus();
  expect(title).toHaveFocus();
  expect(screen.queryByText(/Choose what/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Task title: First'), {
    target: { value: 'Updated' },
  });
  fireEvent.blur(screen.getByLabelText('Task title: First'));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'todoChange',
        change: 'rename',
        title: 'Updated',
      }),
    ),
  );
});
test('dragging saves the final list position once, with no arrow buttons', async () => {
  render(
    <TodoList
      noteId="list"
      data={{
        items: [
          { id: 'a', title: 'First' },
          { id: 'b', title: 'Second' },
        ],
      }}
      onChanged={async () => {}}
    />,
  );
  expect(
    screen.queryByRole('button', { name: /Move .* up/ }),
  ).not.toBeInTheDocument();
  const handle = screen.getByRole('button', { name: 'Reorder Second' });
  const target = screen
    .getByLabelText('Task title: First')
    .closest('.todo-row')!;
  const dataTransfer = {
    setData: jest.fn(),
    effectAllowed: '',
    dropEffect: '',
  };
  fireEvent.dragStart(handle, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer, clientY: -1 });
  expect(request).not.toHaveBeenCalled();
  fireEvent.drop(target, { dataTransfer });
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        change: 'move',
        taskId: 'b',
        beforeTaskId: 'a',
      }),
    ),
  );
  expect(request).toHaveBeenCalledTimes(1);
});
test('Today keyboard reorder works across owning lists and persists a separate rank', async () => {
  render(<TodayTodos all={false} />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Second' }), {
    altKey: true,
    key: 'ArrowUp',
  });
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'other',
        taskId: 'b',
        change: 'move',
        todayOrder: 0,
      }),
    ),
  );
});

test('focuses task creation on activation without stealing focus on task updates', () => {
  const view = render(<AssistantPanelVisibilityContext.Provider value={false}><TodayTodos all={false} /></AssistantPanelVisibilityContext.Provider>);
  const add = screen.getByLabelText('New task for Today');
  expect(add).not.toHaveFocus();
  view.rerender(<AssistantPanelVisibilityContext.Provider value={true}><TodayTodos all={false} /></AssistantPanelVisibilityContext.Provider>);
  expect(add).toHaveFocus();
  const task = screen.getByLabelText('Task title: First');
  task.focus();
  view.rerender(<AssistantPanelVisibilityContext.Provider value={true}><TodayTodos all={false} /></AssistantPanelVisibilityContext.Provider>);
  expect(task).toHaveFocus();
});

test('date picker stages changes until Apply and can clear a scheduled date', async () => {
  render(<TodoList noteId="list" data={{items:[{id:'a',title:'First'}]}} onChanged={async () => {}} />);
  fireEvent.click(screen.getByRole('button',{name:'Set date for First'}));
  fireEvent.click(screen.getByRole('button',{name:'Tomorrow'}));
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Apply'}));
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({action:'todoChange',change:'schedule',taskId:'a',date:localDay(tomorrow)})));
  await waitFor(() => expect(screen.queryByRole('button',{name:'Apply'})).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Set date for First'}));
  fireEvent.click(screen.getByRole('button',{name:'Clear'}));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({change:'schedule',date:''})));
});

test('captured link labels render as safe links while the task title stays plain', () => {
  entries[0] = {...entries[0], title:'Visit España', markdown:'Visit [España](https://example.com/Spain)'} as typeof entries[0];
  render(<TodayTodos all={false} />);
  expect(screen.getByRole('button',{name:'Edit task: Visit España'})).toHaveTextContent('Visit España');
  expect(screen.getByRole('link',{name:'España'})).toHaveAttribute('href','https://example.com/Spain');
});

test('completed tasks start collapsed and can be expanded and restored', async () => {
  render(<TodoList noteId="list" data={{items:[{id:'active',title:'Active'},{id:'done',title:'Finished',completedAt:'2026-11-26T12:00:00Z'}]}} onChanged={async()=>{}} />);
  expect(screen.getByLabelText('Task title: Active')).toBeInTheDocument();
  const completed=screen.getByRole('button',{name:'Completed 1'});
  expect(completed).toHaveAttribute('aria-expanded','false');
  expect(screen.queryByLabelText('Task title: Finished')).not.toBeInTheDocument();
  fireEvent.click(completed);
  expect(screen.getByLabelText('Task title: Finished')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Complete Finished'));
  await waitFor(()=>expect(request).toHaveBeenCalledWith(expect.objectContaining({action:'todoChange',taskId:'done',change:'undo'})));
  fireEvent.click(completed);
  expect(screen.queryByLabelText('Task title: Finished')).not.toBeInTheDocument();
});

test('Delete all confirms first and targets only the visible completed tasks',async()=>{
  const confirm=jest.spyOn(browser,'confirm').mockResolvedValue(false);
  render(<TodoList noteId="list" data={{items:[{id:'active',title:'Active'},{id:'done',title:'Finished',completedAt:'2026-11-26T12:00:00Z'}]}} onChanged={async()=>{}}/>);
  try {
    fireEvent.click(screen.getByRole('button',{name:'Delete all'}));
    await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Delete all'})).not.toBeDisabled());
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({action:'todoDeleteCompleted'}));
    confirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button',{name:'Delete all'}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith({action:'todoDeleteCompleted',tasks:[{noteId:'list',taskId:'done',scope:undefined}]}));
  } finally {confirm.mockRestore();}
});

test('future tasks remain visible under Upcoming and move to Today on their due date',()=>{
  const original=[...entries];
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  entries.splice(0,entries.length,{...original[0],title:'Scheduled task',today:localDay(tomorrow)});
  const view=render(<TodayTodos all={false}/>);
  try {
    const upcoming=screen.getByRole('button',{name:'Upcoming 1'});
    expect(upcoming).toHaveAttribute('aria-expanded','true');
    expect(screen.getByLabelText('Complete Scheduled task')).toBeInTheDocument();
    fireEvent.click(upcoming);
    expect(screen.queryByLabelText('Complete Scheduled task')).not.toBeInTheDocument();
    entries[0]={...entries[0],today:localDay()};
    view.rerender(<TodayTodos all={false}/>);
    expect(screen.queryByRole('button',{name:'Upcoming 1'})).not.toBeInTheDocument();
    expect(screen.getByLabelText('Complete Scheduled task')).toBeInTheDocument();
  }finally{view.unmount();entries.splice(0,entries.length,...original);}
});

test('long captured selections appear as expandable details', () => {
  const text='Full selected paragraph with extra context.';
  entries[0]={...entries[0],title:'Short title',details:text} as typeof entries[0];
  render(<TodayTodos all={false} />);
  expect(screen.getByText('Details').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByText(text)).toBeInTheDocument();
});
