import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { TaskManager } from '../components/View/TaskManager';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({
  browser: { taskManager: jest.fn(), nativeMenu: jest.fn() },
}));
Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe() {},
    unobserve() {},
    disconnect() {},
  })),
});
const state = {
  sampledAt: 1,
  tasks: [
    {
      id: 'alpha',
      title: 'Alpha',
      site: 'alpha.test',
      kind: 'tab',
      status: 'running',
      contentsId: 10,
      pid: 100,
      cpu: 9,
      memory: 1048576,
      shared: false,
      canEnd: true,
      canForceEnd: true,
      processStarted: 100,
    },
    {
      id: 'beta',
      title: 'Beta',
      site: 'beta.test',
      kind: 'tab',
      status: 'running',
      contentsId: 20,
      pid: 200,
      cpu: 1,
      memory: 10485760,
      shared: false,
      canEnd: true,
      canForceEnd: true,
      processStarted: 100,
    },
    {
      id: 'gpu',
      title: 'GPU process',
      site: '',
      kind: 'process',
      status: 'running',
      contentsId: null,
      pid: 300,
      cpu: 25,
      memory: 104857600,
      shared: false,
      canEnd: false,
      canForceEnd: false,
      processStarted: 200,
    },
  ],
};
beforeEach(() => {
  (browser.taskManager as jest.Mock).mockReset().mockResolvedValue(state);
  (browser.nativeMenu as jest.Mock).mockReset().mockResolvedValue(null);
});

it('offers Close tab and Force end through a native row context menu', async () => {
  open();
  const button = await screen.findByRole('button', {
    name: 'Actions for Alpha',
  });
  (browser.nativeMenu as jest.Mock).mockResolvedValueOnce('close');
  fireEvent.contextMenu(button.closest('tr')!);
  await waitFor(() =>
    expect(browser.taskManager).toHaveBeenLastCalledWith({
      action: 'close',
      id: 'alpha',
      contentsId: 10,
      pid: 100,
    }),
  );
  expect(browser.nativeMenu).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ id: 'close', label: 'Close tab…' }),
      expect.objectContaining({ id: 'force-end', label: 'Force end process…' }),
    ]),
  );
  await waitFor(() => expect(button).toBeEnabled());
  (browser.nativeMenu as jest.Mock).mockResolvedValueOnce('force-end');
  fireEvent.click(button);
  await waitFor(() =>
    expect(browser.taskManager).toHaveBeenLastCalledWith({
      action: 'force-end',
      id: 'alpha',
      pid: 100,
      processStarted: 100,
    }),
  );
});

it('shows forceable background processes under Can end', async () => {
  (browser.taskManager as jest.Mock).mockResolvedValue({
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === 'gpu' ? { ...task, canForceEnd: true } : task,
    ),
  });
  open();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Force end GPU process' }),
  );
  await waitFor(() =>
    expect(browser.taskManager).toHaveBeenLastCalledWith({
      action: 'force-end',
      id: 'gpu',
      pid: 300,
      processStarted: 200,
    }),
  );
});
const open = () =>
  render(
    <Theme>
      <TaskManager />
    </Theme>,
  );

it('sorts resource usage and filters tasks by title, site or process ID', async () => {
  open();
  await screen.findByRole('button', { name: 'Switch to Alpha' });
  const rows = () =>
    within(screen.getByRole('table')).getAllByRole('row').slice(1);
  expect(rows()[0]).toHaveTextContent('Alpha');
  expect(screen.getByRole('button', { name: 'Can end' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.queryByText('GPU process')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Memory' }));
  expect(rows()[0]).toHaveTextContent('Beta');
  fireEvent.click(screen.getByRole('button', { name: 'CPU' }));
  expect(rows()[0]).toHaveTextContent('Alpha');
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tasks' }), {
    target: { value: 'beta.test' },
  });
  expect(rows()).toHaveLength(1);
  expect(rows()[0]).toHaveTextContent('Beta');
  fireEvent.click(screen.getByRole('button', { name: 'All tasks' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tasks' }), {
    target: { value: '300' },
  });
  expect(rows()[0]).toHaveTextContent('GPU process');
  expect(
    screen.queryByRole('button', { name: /^End / }),
  ).not.toBeInTheDocument();
});

it('filters protected tasks and can sort by whether tasks can be ended', async () => {
  open();
  await screen.findByRole('button', { name: 'End Alpha' });
  const rows = () =>
    within(screen.getByRole('table')).getAllByRole('row').slice(1);
  fireEvent.click(screen.getByRole('button', { name: 'All tasks' }));
  expect(rows()[0]).toHaveTextContent('GPU process');
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort tasks' }), {
    target: { value: 'canEnd:desc' },
  });
  expect(rows()[0]).toHaveTextContent('Alpha');
  expect(rows()[2]).toHaveTextContent('GPU process');
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort tasks' }), {
    target: { value: 'canEnd:asc' },
  });
  expect(rows()[0]).toHaveTextContent('GPU process');
  fireEvent.click(screen.getByRole('button', { name: 'Can’t end' }));
  expect(rows()).toHaveLength(1);
  expect(rows()[0]).toHaveTextContent('Protected');
  expect(
    screen.queryByRole('button', { name: /^End / }),
  ).not.toBeInTheDocument();
});

it('recovers from an empty search without changing the filter', async () => {
  open();
  await screen.findByRole('button', { name: 'End Alpha' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tasks' }), {
    target: { value: 'not-a-task' },
  });
  expect(screen.getByText('No matching tasks')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByRole('button', { name: 'End Alpha' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Can end' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('sends the observed tab identity for activation and termination', async () => {
  open();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Switch to Alpha' }),
  );
  await waitFor(() =>
    expect(browser.taskManager).toHaveBeenLastCalledWith({
      action: 'activate',
      id: 'alpha',
      contentsId: 10,
      pid: 100,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'End Alpha' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'End Alpha' }));
  await waitFor(() =>
    expect(browser.taskManager).toHaveBeenLastCalledWith({
      action: 'end',
      id: 'alpha',
      contentsId: 10,
      pid: 100,
    }),
  );
});

it('reports load failures and lets the user retry', async () => {
  (browser.taskManager as jest.Mock).mockRejectedValueOnce(
    new Error('Window closed'),
  );
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Window closed');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByRole('button', { name: 'End Alpha' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
