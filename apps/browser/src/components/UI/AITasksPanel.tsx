/* eslint jsx-a11y/label-has-associated-control: ["error", { "controlComponents": ["TextField.Root", "TextArea"] }] */
import { Dialog, Button, TextArea, TextField } from '@radix-ui/themes';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Play, Pause, Trash2, Square } from 'lucide-react';
import { SettingsLibrary } from './SettingsLibrary';
import { StorageRecoveryAction } from './StorageRecoveryAction';
import { NativeContextMenu as ContextMenu } from './NativeContextMenu';
import type {
  AITaskInput,
  AITaskSchedule,
  SavedAITask,
} from '../../browser/aiTasks';

export function AITasksPanel({
  busy,
  resumable,
}: {
  busy: boolean;
  resumable: boolean;
}) {
  const [tasks, setTasks] = useState<SavedAITask[]>([]);
  const [creating, setCreating] = useState(false);
  const [request, setRequest] = useState('');
  const [draft, setDraft] = useState<AITaskInput>();
  const [dailyTime, setDailyTime] = useState('09:00');
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [kind, setKind] = useState<AITaskSchedule['kind']>('manual');
  const [at, setAt] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const report = useCallback(
    (reason: Error) =>
      setError(
        reason.message.replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          ''
        )
      ),
    []
  );
  const refresh = useCallback(async () => {
    try {
      setTasks(await window.electron.ai.tasks());
      setError('');
    } catch (reason) {
      report(reason as Error);
    } finally {
      setLoading(false);
    }
  }, [report]);
  useEffect(() => {
    refresh();
    return window.electron.ai.onTasks(refresh);
  }, [refresh]);
  const action = async (id: string, value: 'run' | 'delete' | 'toggle') => {
    setError('');
    try {
      await window.electron.ai.taskAction(id, value);
    } catch (reason) {
      report(reason as Error);
    }
  };
  const create = async () => {
    setSaving(true);
    setError('');
    try {
      if (!draft) {
        const generated = await window.electron.ai.draftTask(request);
        setDraft(generated);
        setName(name || generated.name);
        setInstructions(generated.instructions);
        setKind(generated.schedule.kind);
        if (generated.schedule.kind === 'once') {
          const date = new Date(generated.schedule.at);
          setAt(
            new Date(date.getTime() - date.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16)
          );
        }
        if (generated.schedule.kind === 'interval')
          setMinutes(String(generated.schedule.minutes));
        if (generated.schedule.kind === 'daily')
          setDailyTime(generated.schedule.time);
      } else {
        let schedule: AITaskSchedule = { kind: 'manual' };
        if (kind === 'once') schedule = { kind, at: new Date(at).getTime() };
        if (kind === 'interval') {
          schedule = { kind, minutes: Number(minutes) };
          if (draft.schedule.kind === 'interval' && draft.schedule.startAt)
            schedule.startAt = draft.schedule.startAt;
        }
        if (kind === 'daily') schedule = { kind, time: dailyTime };
        await window.electron.ai.createTask({ name, instructions, schedule });
        setCreating(false);
        setDraft(undefined);
        setRequest('');
        setName('');
        setInstructions('');
      }
    } catch (reason) {
      report(reason as Error);
    } finally {
      setSaving(false);
    }
  };
  let scheduleLabel = 'Manual';
  if (kind === 'once') scheduleLabel = new Date(at).toLocaleString();
  if (kind === 'interval') scheduleLabel = `Every ${minutes} minutes`;
  if (kind === 'daily') scheduleLabel = `Daily at ${dailyTime}`;
  let saveLabel = draft ? 'Save task' : 'Generate task';
  if (saving) saveLabel = 'Working…';
  const newTask = () => {
    setCreating(true);
    setDraft(undefined);
    setName('');
  };
  return (
    <section
      className={`ai-tasks-panel${
        !loading && !error && !tasks.length ? ' ai-tasks-empty' : ''
      }`}
      aria-label="Saved AI tasks"
    >
      <div className="ai-tasks-heading">
        <strong>Tasks</strong>
      </div>
      <Dialog.Root
        open={creating}
        onOpenChange={(open) => {
          if (!saving) setCreating(open);
        }}
      >
        <Dialog.Content maxWidth="520px" className="ai-task-dialog">
          <Dialog.Title>New task</Dialog.Title>
          <Dialog.Description size="2">
            Describe a task and review its schedule before saving.
          </Dialog.Description>
          <form
            className="ai-task-form"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <label htmlFor="ai-task-request">
              {draft ? 'Task' : 'What should Kudium Browser do?'}
              <TextArea
                id="ai-task-request"
                value={draft ? instructions : request}
                onChange={(event) =>
                  draft
                    ? setInstructions(event.target.value)
                    : setRequest(event.target.value)
                }
                placeholder="Check staging every morning at 9…"
                maxLength={12000}
                rows={4}
                required
                disabled={saving}
              />
            </label>
            {draft && (
              <div className="ai-task-draft" role="status">
                <strong>{name}</strong>
                <small>{scheduleLabel}</small>
              </div>
            )}
            <details className="ai-task-more">
              <summary>More options</summary>
              <label htmlFor="ai-task-name">
                Name
                <TextField.Root
                  id="ai-task-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder="Generated by AI"
                  disabled={saving}
                />
              </label>
              {draft && (
                <>
                  <label htmlFor="ai-task-schedule">
                    Schedule
                    <select
                      id="ai-task-schedule"
                      value={kind}
                      onChange={(event) =>
                        setKind(event.target.value as AITaskSchedule['kind'])
                      }
                      disabled={saving}
                    >
                      <option value="manual">Manual</option>
                      <option value="once">Once</option>
                      <option value="interval">Repeat</option>
                      <option value="daily">Daily</option>
                    </select>
                  </label>
                  {kind === 'once' && (
                    <label htmlFor="ai-task-date">
                      Run at
                      <TextField.Root
                        id="ai-task-date"
                        type="datetime-local"
                        value={at}
                        onChange={(event) => setAt(event.target.value)}
                        required
                        disabled={saving}
                      />
                    </label>
                  )}
                  {kind === 'interval' && (
                    <label htmlFor="ai-task-interval">
                      Every (minutes)
                      <TextField.Root
                        id="ai-task-interval"
                        type="number"
                        min={1}
                        max={525600}
                        value={minutes}
                        onChange={(event) => setMinutes(event.target.value)}
                        required
                        disabled={saving}
                      />
                    </label>
                  )}
                  {kind === 'daily' && (
                    <label htmlFor="ai-task-daily">
                      Time
                      <TextField.Root
                        id="ai-task-daily"
                        type="time"
                        value={dailyTime}
                        onChange={(event) => setDailyTime(event.target.value)}
                        required
                        disabled={saving}
                      />
                    </label>
                  )}
                </>
              )}
            </details>
            <div>
              <Button
                variant="soft"
                color="gray"
                type="button"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button
                variant="soft"
                color="gray"
                type="submit"
                disabled={saving || busy}
              >
                {saveLabel}
              </Button>
            </div>
          </form>
          {error && (
            <p role="alert" className="ai-error">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Root>
      {error && (
        <p role="alert" className="ai-error">
          {error}
          <StorageRecoveryAction message={error} />
        </p>
      )}
      {loading && <p role="status">Loading tasks…</p>}
      {!loading && error && (
        <Button
          variant="soft"
          color="gray"
          type="button"
          onClick={() => {
            setLoading(true);
            refresh();
          }}
        >
          Try again
        </Button>
      )}
      <SettingsLibrary
        emptyContent={
          <div className="ai-tasks-welcome">
            <strong>{loading ? 'Loading tasks…' : 'No tasks yet'}</strong>
            <p>Save instructions to run on demand or on a schedule.</p>
            <Button variant="soft" color="gray" onClick={newTask}>
              <Plus size={16} /> New task
            </Button>
          </div>
        }
        renderToolbar={() => (
          <Button
            variant="soft"
            color="gray"
            type="button"
            onClick={newTask}
            aria-label="New AI task"
          >
            <Plus size={16} />
          </Button>
        )}
        label="AI tasks"
        entries={tasks.map((task) => ({
          ...task,
          subtitle: task.runs[0]?.state || 'Ready',
        }))}
      >
        {(task) => {
          const latest = task.runs[0];
          const paused = latest?.state === 'paused';
          return (
            <ContextMenu.Root key={task.id}>
              <ContextMenu.Trigger>
                <article className="ai-task-row">
                  <div className="ai-task-title">
                    <strong>{task.name}</strong>
                    <span>{latest?.state || 'Ready'}</span>
                  </div>
                  <small>
                    {task.schedule.kind === 'manual'
                      ? 'Manual'
                      : `${task.enabled ? 'Scheduled' : 'Disabled'}${
                          task.enabled && task.nextRunAt
                            ? ` · ${new Date(task.nextRunAt).toLocaleString()}`
                            : ''
                        }`}
                  </small>
                  <div className="ai-task-actions">
                    <Button
                      variant="soft"
                      color="gray"
                      type="button"
                      disabled={busy || resumable}
                      onClick={() => action(task.id, 'run')}
                    >
                      <Play size={13} />
                      Run
                    </Button>
                    {paused && resumable && (
                      <Button
                        variant="soft"
                        color="gray"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          window.electron.ai.resume().catch(report)
                        }
                      >
                        <Play size={13} />
                        Continue
                      </Button>
                    )}
                    {(latest?.state === 'running' || (paused && resumable)) && (
                      <Button
                        variant="soft"
                        color="gray"
                        type="button"
                        onClick={() => window.electron.ai.stop().catch(report)}
                      >
                        <Square size={13} />
                        Stop
                      </Button>
                    )}
                    {task.schedule.kind !== 'manual' && (
                      <Button
                        variant="soft"
                        color="gray"
                        type="button"
                        disabled={
                          latest?.state === 'running' || (paused && resumable)
                        }
                        onClick={() => action(task.id, 'toggle')}
                        aria-label={`${task.enabled ? 'Disable' : 'Enable'} ${
                          task.name
                        } schedule`}
                      >
                        <Pause size={13} />
                        {task.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                    <Button
                      variant="soft"
                      color="gray"
                      type="button"
                      disabled={
                        latest?.state === 'running' || (paused && resumable)
                      }
                      onClick={() => action(task.id, 'delete')}
                      aria-label={`Delete ${task.name}`}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                  <p className="ai-task-instructions">{task.instructions}</p>
                  <details>
                    <summary>
                      Run history
                      {task.runs.length ? ` · ${task.runs.length} runs` : ''}
                    </summary>
                    {task.runs.map((run) => (
                      <div className="ai-task-run" key={run.id}>
                        <small>
                          {new Date(run.startedAt).toLocaleString()} ·{' '}
                          {run.state}
                        </small>
                        <p>{run.summary || 'Working…'}</p>
                      </div>
                    ))}
                  </details>
                </article>
              </ContextMenu.Trigger>
              <ContextMenu.Content>
                <ContextMenu.Item
                  disabled={busy || resumable}
                  onSelect={() => action(task.id, 'run')}
                >
                  Run task
                </ContextMenu.Item>
                {paused && resumable && (
                  <ContextMenu.Item
                    disabled={busy}
                    onSelect={() => window.electron.ai.resume().catch(report)}
                  >
                    Continue task
                  </ContextMenu.Item>
                )}
                {(latest?.state === 'running' || (paused && resumable)) && (
                  <ContextMenu.Item
                    onSelect={() => window.electron.ai.stop().catch(report)}
                  >
                    Stop task
                  </ContextMenu.Item>
                )}
                {task.schedule.kind !== 'manual' && (
                  <ContextMenu.Item onSelect={() => action(task.id, 'toggle')}>
                    {task.enabled ? 'Disable schedule' : 'Enable schedule'}
                  </ContextMenu.Item>
                )}
                <ContextMenu.Separator />
                <ContextMenu.Item
                  onSelect={() =>
                    navigator.clipboard
                      .writeText(task.instructions)
                      .catch(report)
                  }
                >
                  Copy instructions
                </ContextMenu.Item>
                <ContextMenu.Item
                  disabled={
                    latest?.state === 'running' || (paused && resumable)
                  }
                  onSelect={() => action(task.id, 'delete')}
                >
                  Delete task
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Root>
          );
        }}
      </SettingsLibrary>
      <small className="ai-task-footnote">
        Schedules run while Kudium Browser is open. Browser approvals still
        apply.
      </small>
    </section>
  );
}
