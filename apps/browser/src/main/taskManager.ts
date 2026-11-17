import { app, BrowserWindow, ipcMain } from 'electron';
import type {
  BrowserTask,
  TaskManagerRequest,
  TaskManagerState,
} from '../browser/taskManager';
import { showBrowserDialog } from './dialogs';
import { onWindowClosed } from './windowLifecycle';

type TabTask = Omit<
  BrowserTask,
  'cpu' | 'memory' | 'shared' | 'canForceEnd' | 'processStarted'
>;
interface TaskSource {
  owns: (window: BrowserWindow) => boolean;
  list: () => TabTask[];
  end: (task: TabTask) => void;
  close: (task: TabTask) => void;
  activate: (task: TabTask) => void;
}
const sources = new Set<TaskSource>();
const managers = new Set<BrowserWindow>();
let registered = false;

export function registerTaskSource(source: TaskSource) {
  sources.add(source);
  return () => {
    sources.delete(source);
  };
}

/** Only a dedicated native window's main frame can inspect or stop its owner's tasks. */
export function registerTaskManagerWindow(window: BrowserWindow) {
  managers.add(window);
  onWindowClosed(window, () => managers.delete(window));
  if (registered) return;
  registered = true;
  ipcMain.handle(
    'browser-task-manager',
    async (event, request: TaskManagerRequest): Promise<TaskManagerState> => {
      const manager = BrowserWindow.fromWebContents(event.sender);
      if (
        !manager ||
        !managers.has(manager) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error('Task manager access denied');
      const owner = manager.getParentWindow();
      const source =
        owner &&
        !owner.isDestroyed() &&
        [...sources].find((item) => item.owns(owner));
      if (!source) throw new Error('The browser window was closed');
      if (
        !request ||
        !['get', 'activate', 'end', 'close', 'force-end'].includes(
          request.action,
        )
      )
        throw new Error('Invalid task manager request');
      const stillOwned = () => {
        if (
          manager.isDestroyed() ||
          owner.isDestroyed() ||
          manager.getParentWindow() !== owner ||
          !sources.has(source)
        )
          throw new Error('The browser window changed');
      };
      const sample = (): TaskManagerState => {
        const metrics = app.getAppMetrics();
        const tabs = source.list();
        const byPid = new Map(metrics.map((metric) => [metric.pid, metric]));
        const pidCounts = new Map<number, number>();
        for (const task of tabs)
          if (task.pid !== null)
            pidCounts.set(task.pid, (pidCounts.get(task.pid) || 0) + 1);
        // Never terminate browser chrome, another session's tabs, or locked groups.
        const protectedPids = new Set([
          process.pid,
          manager.webContents.getOSProcessId(),
          ...BrowserWindow.getAllWindows()
            .filter((item) => !item.isDestroyed())
            .map((item) => item.webContents.getOSProcessId()),
        ]);
        for (const candidate of sources)
          for (const task of candidate.list()) {
            if (
              task.pid !== null &&
              (!candidate.owns(owner) || task.status === 'locked')
            )
              protectedPids.add(task.pid);
          }
        const forceAllowed = (pid: number | null) => {
          if (pid === null || pid <= 0 || protectedPids.has(pid)) return false;
          const metric = byPid.get(pid);
          return Boolean(
            metric &&
            metric.type !== 'Browser' &&
            Number.isFinite(metric.creationTime) &&
            metric.creationTime > 0,
          );
        };
        const tasks: BrowserTask[] = tabs.map((task) => {
          const metric = task.pid === null ? undefined : byPid.get(task.pid);
          return {
            ...task,
            cpu: metric ? metric.cpu.percentCPUUsage : null,
            memory: metric ? metric.memory.workingSetSize * 1024 : null,
            shared: task.pid !== null && (pidCounts.get(task.pid) || 0) > 1,
            canForceEnd: task.status !== 'locked' && forceAllowed(task.pid),
            processStarted: metric?.creationTime ?? null,
          };
        });
        for (const metric of metrics.filter(
          (item) => !pidCounts.has(item.pid),
        )) {
          tasks.push({
            id: `process:${metric.pid}`,
            kind: 'process',
            title:
              metric.type === 'Browser'
                ? 'Browser'
                : metric.pid === manager.webContents.getOSProcessId()
                  ? 'Task Manager'
                  : metric.pid === owner.webContents.getOSProcessId()
                    ? 'Browser interface'
                    : metric.type === 'Tab'
                      ? 'Background renderer'
                      : `${metric.type} process`,
            site: '',
            status: 'running',
            contentsId: null,
            pid: metric.pid,
            cpu: metric.cpu.percentCPUUsage,
            memory: metric.memory.workingSetSize * 1024,
            shared: false,
            canEnd: false,
            canForceEnd: forceAllowed(metric.pid),
            processStarted: metric.creationTime,
          });
        }
        return { tasks, sampledAt: Date.now() };
      };
      if (request.action === 'force-end') {
        const findProcess = () =>
          sample().tasks.find(
            (task) =>
              task.id === request.id &&
              task.pid === request.pid &&
              task.processStarted === request.processStarted &&
              task.canForceEnd,
          );
        const task = findProcess();
        if (!task)
          throw new Error(
            'This process changed or is protected. Refresh and try again.',
          );
        const affected = sample().tasks.filter((item) => item.pid === task.pid);
        const signature = affected
          .map((item) => `${item.id}:${item.contentsId}`)
          .sort()
          .join('|');
        const names = affected
          .map((item) => item.title)
          .slice(0, 6)
          .join(', ');
        const answer = await showBrowserDialog(manager, {
          message: `Force end “${task.title}”?`,
          detail: `This immediately stops process ${task.pid}. Unsaved changes, calls and background work may be lost. Browser services may restart automatically. Affected tasks: ${names}${affected.length > 6 ? '…' : ''}.`,
          buttons: ['Cancel', 'Force End'],
          defaultId: 0,
          cancelId: 0,
        });
        if (answer.response === 1) {
          stillOwned();
          const current = findProcess();
          const currentAffected = sample()
            .tasks.filter((item) => item.pid === task.pid)
            .map((item) => `${item.id}:${item.contentsId}`)
            .sort()
            .join('|');
          if (!current || currentAffected !== signature)
            throw new Error('This process changed. Refresh and try again.');
          // PID and creation time are checked against Electron's live child-process registry,
          // immediately after confirmation; callers cannot supply arbitrary OS processes.
          process.kill(request.pid, 'SIGKILL');
        }
      } else if (request.action !== 'get') {
        const find = () =>
          source
            .list()
            .find(
              (task) =>
                task.id === request.id &&
                task.contentsId === request.contentsId &&
                task.pid === request.pid &&
                task.kind === 'tab' &&
                task.status !== 'locked',
            );
        const task = find();
        if (!task) throw new Error('This tab changed. Refresh and try again.');
        if (request.action === 'activate') {
          if (task.contentsId === null)
            throw new Error('Reopen this sleeping tab in the browser.');
          source.activate(task);
        } else {
          if (request.action === 'end' && !task.canEnd)
            throw new Error('This task cannot be ended');
          const closing = request.action === 'close';
          const answer = await showBrowserDialog(manager, {
            message: `${closing ? 'Close' : 'End'} “${task.title}”?`,
            detail: closing
              ? 'This tab will move to Archive and can be restored. Unsaved page changes will be lost.'
              : 'Unsaved changes and active calls in this tab will be lost. The tab stays saved and can be reopened.',
            buttons: ['Cancel', closing ? 'Close Tab' : 'End Tab'],
            defaultId: 0,
            cancelId: 0,
          });
          if (answer.response === 1) {
            stillOwned();
            const current = find();
            if (!current || (!closing && !current.canEnd))
              throw new Error('This tab changed. Refresh and try again.');
            if (closing) source.close(current);
            else source.end(current);
          }
        }
      }
      return sample();
    },
  );
}
