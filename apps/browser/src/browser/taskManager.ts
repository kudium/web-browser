export interface BrowserTask {
  id: string;
  title: string;
  site: string;
  kind: 'tab' | 'process';
  status: 'running' | 'sleeping' | 'locked' | 'stopped';
  contentsId: number | null;
  pid: number | null;
  cpu: number | null;
  memory: number | null;
  shared: boolean;
  canEnd: boolean;
  canForceEnd: boolean;
  processStarted: number | null;
}

export interface TaskManagerState {
  tasks: BrowserTask[];
  sampledAt: number;
}

export type TaskManagerRequest =
  | { action: 'get' }
  | {
      action: 'activate' | 'end' | 'close';
      id: string;
      contentsId: number | null;
      pid: number | null;
    }
  | { action: 'force-end'; id: string; pid: number; processStarted: number };
