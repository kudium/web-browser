import { app, BrowserWindow, ipcMain } from 'electron';
import {
  registerTaskManagerWindow,
  registerTaskSource,
} from '../main/taskManager';
import { showBrowserDialog } from '../main/dialogs';

jest.mock('electron', () => ({
  app: { getAppMetrics: jest.fn() },
  BrowserWindow: {
    fromWebContents: jest.fn(),
    getAllWindows: jest.fn().mockReturnValue([]),
  },
  ipcMain: { handle: jest.fn() },
}));
jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
jest.mock('../main/windowLifecycle', () => ({ onWindowClosed: jest.fn() }));

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop());
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
let invoke: (...args: any[]) => Promise<any>;
const setup = () => {
  const owner = {
    isDestroyed: () => false,
    webContents: { getOSProcessId: () => 11 },
  };
  const sender = { mainFrame: {}, getOSProcessId: () => 99 };
  const manager = {
    getParentWindow: () => owner,
    isDestroyed: () => false,
    webContents: sender,
  };
  const first = {
    id: 'one',
    title: 'One',
    site: 'example.test',
    kind: 'tab' as const,
    status: 'running' as const,
    contentsId: 10,
    pid: 123,
    canEnd: true,
  };
  let tasks = [first, { ...first, id: 'two', title: 'Two', contentsId: 20 }];
  const end = jest.fn();
  const close = jest.fn();
  const activate = jest.fn();
  const stop = registerTaskSource({
    owns: (window) => window === (owner as any),
    list: () => tasks,
    end,
    close,
    activate,
  });
  cleanups.push(stop);
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue(manager);
  (app.getAppMetrics as jest.Mock).mockReturnValue([
    {
      pid: 123,
      creationTime: 100,
      type: 'Tab',
      cpu: { percentCPUUsage: 4.5 },
      memory: { workingSetSize: 100 },
    },
    {
      pid: 456,
      creationTime: 200,
      type: 'Tab',
      name: 'PRIVATE SECRET TITLE',
      cpu: { percentCPUUsage: 2 },
      memory: { workingSetSize: 50 },
    },
  ]);
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 0 });
  registerTaskManagerWindow(manager as any);
  invoke ||= (ipcMain.handle as jest.Mock).mock.calls[0][1];
  const event = { sender, senderFrame: sender.mainFrame };
  const request = { action: 'end', id: 'one', contentsId: 10, pid: 123 };
  return {
    owner,
    manager,
    sender,
    event,
    end,
    close,
    activate,
    stop,
    request,
    first,
    setTasks: (next: typeof tasks) => {
      tasks = next;
    },
  };
};

it('reports process metrics consistently for shared tabs without revealing unrelated renderer titles', async () => {
  const fixture = setup();
  const state = await invoke(fixture.event, { action: 'get' });
  expect(state.tasks.slice(0, 2)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'one',
        cpu: 4.5,
        memory: 102400,
        shared: true,
      }),
      expect.objectContaining({
        id: 'two',
        cpu: 4.5,
        memory: 102400,
        shared: true,
      }),
    ]),
  );
  expect(state.tasks[2]).toMatchObject({
    title: 'Background renderer',
    site: '',
    canEnd: false,
  });
  expect(JSON.stringify(state)).not.toContain('PRIVATE SECRET TITLE');
});

it('rejects unregistered callers, subframes, stale identities and non-tab tasks', async () => {
  const fixture = setup();
  await expect(
    invoke({ ...fixture.event, senderFrame: {} }, { action: 'get' }),
  ).rejects.toThrow('access denied');
  await expect(
    invoke(fixture.event, { ...fixture.request, contentsId: 999 }),
  ).rejects.toThrow('changed');
  await expect(
    invoke(fixture.event, { ...fixture.request, id: 'process:456', pid: 456 }),
  ).rejects.toThrow('changed');
  (BrowserWindow.fromWebContents as jest.Mock).mockReturnValue({});
  await expect(invoke(fixture.event, { action: 'get' })).rejects.toThrow(
    'access denied',
  );
  expect(fixture.end).not.toHaveBeenCalled();
});

it('requires confirmation and rechecks the target before ending a tab', async () => {
  const fixture = setup();
  await invoke(fixture.event, fixture.request);
  expect(fixture.end).not.toHaveBeenCalled();
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 1 });
  await invoke(fixture.event, fixture.request);
  expect(fixture.end).toHaveBeenCalledWith(fixture.first);
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    fixture.setTasks([{ ...fixture.first, contentsId: 30 }]);
    return { response: 1 };
  });
  await expect(invoke(fixture.event, fixture.request)).rejects.toThrow(
    'changed',
  );
  expect(fixture.end).toHaveBeenCalledTimes(1);
});

it('keeps source ownership separate and revokes access when a source is disposed', async () => {
  const fixture = setup();
  const privateOwner = {
    isDestroyed: () => false,
    webContents: { getOSProcessId: () => 22 },
  };
  cleanups.push(
    registerTaskSource({
      owns: (window) => window === (privateOwner as any),
      list: () => [{ ...fixture.first, id: 'private', title: 'Private page' }],
      end: jest.fn(),
      close: jest.fn(),
      activate: jest.fn(),
    }),
  );
  const state = await invoke(fixture.event, { action: 'get' });
  expect(state.tasks.some((task: any) => task.id === 'private')).toBe(false);
  const parent = jest.spyOn(fixture.manager, 'getParentWindow');
  parent.mockReturnValue(privateOwner);
  const privateState = await invoke(fixture.event, { action: 'get' });
  expect(privateState.tasks.some((task: any) => task.id === 'private')).toBe(
    true,
  );
  expect(privateState.tasks.some((task: any) => task.id === 'one')).toBe(false);
  await expect(invoke(fixture.event, fixture.request)).rejects.toThrow(
    'changed',
  );
  parent.mockReturnValue(fixture.owner);
  fixture.stop();
  await expect(invoke(fixture.event, { action: 'get' })).rejects.toThrow(
    'closed',
  );
});

it('activates only the matching live tab without ending it', async () => {
  const fixture = setup();
  await invoke(fixture.event, { ...fixture.request, action: 'activate' });
  expect(fixture.activate).toHaveBeenCalledWith(fixture.first);
  expect(fixture.end).not.toHaveBeenCalled();
});

it('closes a tab through the source after confirmation', async () => {
  const fixture = setup();
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 1 });
  await invoke(fixture.event, { ...fixture.request, action: 'close' });
  expect(fixture.close).toHaveBeenCalledWith(fixture.first);
  expect(fixture.end).not.toHaveBeenCalled();
});

it('force ends a verified child process only after confirmation', async () => {
  const fixture = setup();
  const kill = jest.spyOn(process, 'kill').mockReturnValue(true);
  const request = {
    action: 'force-end',
    id: 'one',
    pid: 123,
    processStarted: 100,
  };
  await invoke(fixture.event, request);
  expect(kill).not.toHaveBeenCalled();
  (showBrowserDialog as jest.Mock).mockResolvedValueOnce({ response: 1 });
  await invoke(fixture.event, request);
  expect(kill).toHaveBeenCalledWith(123, 'SIGKILL');
  expect(showBrowserDialog).toHaveBeenLastCalledWith(
    fixture.manager,
    expect.objectContaining({ detail: expect.stringContaining('One, Two') }),
  );
});

it('rejects arbitrary PIDs, reused PIDs and protected browser processes', async () => {
  const fixture = setup();
  const kill = jest.spyOn(process, 'kill').mockReturnValue(true);
  await expect(
    invoke(fixture.event, {
      action: 'force-end',
      id: 'process:999',
      pid: 999,
      processStarted: 100,
    }),
  ).rejects.toThrow('protected');
  (showBrowserDialog as jest.Mock).mockImplementationOnce(async () => {
    const metrics = (app.getAppMetrics as jest.Mock)();
    (app.getAppMetrics as jest.Mock).mockReturnValue(
      metrics.map((metric: any) => ({
        ...metric,
        creationTime: metric.creationTime + 1,
      })),
    );
    return { response: 1 };
  });
  await expect(
    invoke(fixture.event, {
      action: 'force-end',
      id: 'one',
      pid: 123,
      processStarted: 100,
    }),
  ).rejects.toThrow('changed');
  (app.getAppMetrics as jest.Mock).mockReturnValue([
    {
      pid: 99,
      creationTime: 100,
      type: 'Tab',
      cpu: { percentCPUUsage: 0 },
      memory: { workingSetSize: 1 },
    },
  ]);
  await expect(
    invoke(fixture.event, {
      action: 'force-end',
      id: 'process:99',
      pid: 99,
      processStarted: 100,
    }),
  ).rejects.toThrow('protected');
  expect(kill).not.toHaveBeenCalled();
});
