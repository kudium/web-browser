export type AITaskSchedule =
  | { kind: 'manual' }
  | { kind: 'once'; at: number }
  | { kind: 'interval'; minutes: number; startAt?: number }
  | { kind: 'daily'; time: string };
export type AITaskRunState =
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'stopped'
  | 'interrupted';
export interface AITaskRun {
  id: string;
  startedAt: number;
  endedAt?: number;
  state: AITaskRunState;
  summary: string;
}
export interface SavedAITask {
  id: string;
  name: string;
  instructions: string;
  groupId?: string | null;
  schedule: AITaskSchedule;
  enabled: boolean;
  nextRunAt?: number;
  runs: AITaskRun[];
  /** Instructions derived from private AI context retain the review floor. */
  privateData?: boolean;
  /** A run_script source that runs deterministically with no model; instructions are the fallback. */
  script?: string;
}
export interface AITaskInput {
  name: string;
  instructions: string;
  script?: string;
  groupId?: string | null;
  schedule: AITaskSchedule;
}
export interface AITaskOutcome {
  state: Exclude<AITaskRunState, 'running'>;
  summary: string;
}

/** Provider task arguments are data, never executable code. */
export function taskInputFromTool(args: Record<string, unknown>): AITaskInput {
  let schedule: AITaskSchedule;
  const parseTime = () => {
    if (
      typeof args.runAt !== 'string' ||
      !/(?:Z|[+-]\d{2}:\d{2})$/.test(args.runAt)
    )
      throw new Error('runAt must be an ISO date with a timezone offset.');
    const at = Date.parse(args.runAt);
    if (!Number.isSafeInteger(at)) throw new Error('Invalid runAt date.');
    return at;
  };
  if (args.scheduleKind === 'manual') schedule = { kind: 'manual' };
  else if (args.scheduleKind === 'once')
    schedule = { kind: 'once', at: parseTime() };
  else if (args.scheduleKind === 'interval') {
    schedule = { kind: 'interval', minutes: args.intervalMinutes as number };
    if (args.runAt !== undefined) schedule.startAt = parseTime();
  } else if (args.scheduleKind === 'daily')
    schedule = { kind: 'daily', time: args.localTime as string };
  else throw new Error('Choose manual, once, interval or daily.');
  return {
    name: args.name as string,
    instructions: args.instructions as string,
    ...(args.script !== undefined ? { script: args.script as string } : {}),
    schedule,
  };
}

export function nextDailyTaskRun(time: string, now: number): number {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now) {
    next.setDate(next.getDate() + 1);
    next.setHours(hours, minutes, 0, 0);
  }
  return next.getTime();
}
