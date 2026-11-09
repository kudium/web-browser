import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AITasksPanel } from '../components/UI/AITasksPanel';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({ browser: { nativeMenu: jest.fn() } }));

it('generates a draft from plain language and saves only after review', async () => {
  const ai = {
    tasks: jest.fn().mockResolvedValue([]),
    onTasks: () => () => {},
    draftTask: jest.fn().mockResolvedValue({
      name: 'Check staging',
      instructions: 'Read staging status',
      schedule: { kind: 'interval', minutes: 15 },
    }),
    createTask: jest.fn().mockResolvedValue('task'),
  };
  Object.assign(window, { electron: { ai } });
  render(
    <Theme>
      <AITasksPanel busy={false} resumable={false} />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'New AI task' }));
  expect(screen.getByLabelText('Name')).not.toBeVisible();
  fireEvent.change(screen.getByLabelText('What should Kudium Browser do?'), {
    target: { value: 'Check staging every 15 minutes' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate task' }));
  await screen.findByRole('button', { name: 'Save task' });
  expect(ai.draftTask).toHaveBeenCalledWith('Check staging every 15 minutes');
  expect(ai.createTask).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('More options'));
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'My staging check' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
  await waitFor(() =>
    expect(ai.createTask).toHaveBeenCalledWith({
      name: 'My staging check',
      instructions: 'Read staging status',
      schedule: { kind: 'interval', minutes: 15 },
    })
  );
});
it('blocks another run while paused and exposes Continue and Stop', async () => {
  const ai = {
    tasks: jest.fn().mockResolvedValue([
      {
        id: 'task',
        name: 'Staging',
        instructions: 'Read staging',
        schedule: { kind: 'manual' },
        enabled: true,
        runs: [
          {
            id: 'run',
            startedAt: 10000,
            state: 'paused',
            summary: 'Login required',
          },
        ],
      },
    ]),
    onTasks: () => () => {},
    resume: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(undefined),
  };
  Object.assign(window, { electron: { ai } });
  render(
    <Theme>
      <AITasksPanel busy={false} resumable />
    </Theme>
  );
  expect(await screen.findByRole('button', { name: 'Run' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Delete Staging' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(ai.resume).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(ai.stop).toHaveBeenCalledTimes(1);
});

it('offers the task actions on right click with the same paused-state restrictions', async () => {
  Object.assign(window, {
    electron: {
      ai: {
        tasks: jest.fn().mockResolvedValue([
          {
            id: 'task',
            name: 'Watch prices',
            instructions: 'Read prices',
            schedule: { kind: 'interval', minutes: 15 },
            enabled: true,
            runs: [{ id: 'run', state: 'paused', startedAt: 1 }],
          },
        ]),
        onTasks: () => () => {},
        taskAction: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      },
    },
  });
  (browser.nativeMenu as jest.Mock).mockResolvedValue(null);
  render(
    <Theme>
      <AITasksPanel busy={false} resumable />
    </Theme>
  );
  await screen.findByRole('button', { name: 'Watch prices paused' });
  const row = document.querySelector('.ai-task-row')!;
  fireEvent.contextMenu(row);
  await waitFor(() => expect(browser.nativeMenu).toHaveBeenCalled());
  const menu = (browser.nativeMenu as jest.Mock).mock.calls.at(-1)[0];
  expect(menu.find((item: any) => item.label === 'Run task').enabled).toBe(
    false
  );
  expect(menu.find((item: any) => item.label === 'Delete task').enabled).toBe(
    false
  );
  [
    'Continue task',
    'Stop task',
    'Disable schedule',
    'Copy instructions',
  ].forEach((label) =>
    expect(menu.some((item: any) => item.label === label)).toBe(true)
  );
});

it('shows a failed task load and recovers through Try again', async () => {
  const tasks = jest
    .fn()
    .mockRejectedValueOnce(new Error('Tasks unavailable'))
    .mockResolvedValue([]);
  Object.assign(window, {
    electron: { ai: { tasks, onTasks: () => () => {} } },
  });
  render(
    <Theme>
      <AITasksPanel busy={false} resumable={false} />
    </Theme>
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading tasks');
  await screen.findByText('Tasks unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() =>
    expect(screen.queryByText('Tasks unavailable')).not.toBeInTheDocument()
  );
  expect(tasks).toHaveBeenCalledTimes(2);
});
