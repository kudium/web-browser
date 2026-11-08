/* eslint-disable no-await-in-loop, no-bitwise */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AITaskManager, AITaskStore, validateAITask } from '../main/aiTasks';
import { taskInputFromTool, nextDailyTaskRun } from '../browser/aiTasks';
import type { SavedAITask, AITaskOutcome } from '../browser/aiTasks';

const originalClone = global.structuredClone;
beforeAll(() => {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
});
afterAll(() => {
  global.structuredClone = originalClone;
});

function fixture(
  available: (resuming?: boolean, scheduled?: boolean) => boolean = () => true
) {
  let data: SavedAITask[] = [];
  let time = 100000;
  const store = {
    load: () => structuredClone(data),
    save: jest.fn((tasks: SavedAITask[]) => {
      data = structuredClone(tasks);
    }),
  };
  const runner = jest
    .fn<Promise<AITaskOutcome>, [SavedAITask, boolean]>()
    .mockResolvedValue({ state: 'completed', summary: 'Verified.' });
  const changed = jest.fn();
  const manager = new AITaskManager(
    store,
    runner,
    available,
    changed,
    () => time
  );
  return {
    manager,
    store,
    runner,
    changed,
    advance: (ms: number) => {
      time += ms;
    },
    data: () => data,
  };
}
const input = {
  name: 'Check staging',
  instructions: 'Read the staging page',
  schedule: { kind: 'manual' as const },
};
it('preserves schedules on manual runs and coalesces missed intervals', async () => {
  const f = fixture();
  const id = f.manager.create({
    ...input,
    schedule: { kind: 'interval', minutes: 1 },
  });
  await f.manager.run(id);
  expect(f.manager.list()[0].nextRunAt).toBe(160000);
  f.advance(600000);
  await f.manager.tick();
  await f.manager.tick();
  expect(f.runner).toHaveBeenCalledTimes(2);
  expect(f.manager.list()[0].nextRunAt).toBe(760000);
  expect(f.manager.list()[0].runs[0]).toMatchObject({
    state: 'completed',
    summary: 'Verified.',
  });
});
it('defers unavailable work and dispatches a once schedule once', async () => {
  let available = false;
  const f = fixture(() => available);
  f.manager.create({ ...input, schedule: { kind: 'once', at: 100100 } });
  f.advance(1000);
  await f.manager.tick();
  expect(f.runner).not.toHaveBeenCalled();
  available = true;
  await f.manager.tick();
  await f.manager.tick();
  expect(f.runner).toHaveBeenCalledTimes(1);
  expect(f.manager.list()[0].enabled).toBe(false);
});
it('distinguishes explicit runs from scheduled work without lifting a pause', async () => {
  let paused = true;
  const f = fixture((_resuming, scheduled) => scheduled === false || !paused);
  const id = f.manager.create({
    ...input,
    schedule: { kind: 'interval', minutes: 1 },
  });
  f.advance(60000);
  await f.manager.tick();
  expect(f.runner).not.toHaveBeenCalled();
  await f.manager.run(id);
  expect(f.runner.mock.calls[0][1]).toBe(false);
  expect(f.manager.list()[0].nextRunAt).toBe(160000);
  await f.manager.tick();
  expect(f.runner).toHaveBeenCalledTimes(1);
  paused = false;
  await f.manager.tick();
  expect(f.runner.mock.calls[1][1]).toBe(true);
  expect(f.manager.list()[0].nextRunAt).toBe(220000);
});
it('prevents overlap and refuses changes to running work', async () => {
  const f = fixture();
  let finish!: (outcome: AITaskOutcome) => void;
  f.runner.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const id = f.manager.create(input);
  const run = f.manager.run(id);
  await expect(f.manager.run(id)).rejects.toThrow('unavailable');
  expect(() => f.manager.change(id, 'delete')).toThrow('Stop');
  finish({ state: 'paused', summary: 'Login required' });
  await run;
  const runId = f.manager.list()[0].runs[0].id;
  await f.manager.run(id, false, async () => ({
    state: 'completed',
    summary: 'Resumed',
  }));
  expect(f.manager.list()[0].runs).toHaveLength(1);
  expect(f.manager.list()[0].runs[0].id).toBe(runId);
});
it('records interruption on disposal without late overwrite or automatic replay', async () => {
  const f = fixture();
  let finish!: (outcome: AITaskOutcome) => void;
  f.runner.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const id = f.manager.create(input);
  const run = f.manager.run(id);
  f.manager.dispose();
  const restarted = new AITaskManager(
    f.store,
    f.runner,
    () => true,
    () => {},
    () => 200000
  );
  finish({ state: 'completed', summary: 'Late' });
  await run;
  expect(f.data()[0].runs[0].state).toBe('interrupted');
  await restarted.tick();
  expect(f.runner).toHaveBeenCalledTimes(1);
});
it('records runner failures, caps history and does not mutate state when saving fails', async () => {
  const f = fixture();
  const id = f.manager.create(input);
  f.runner.mockRejectedValueOnce(Error('Provider failed'));
  await expect(f.manager.run(id)).rejects.toThrow('Provider failed');
  expect(f.manager.list()[0].runs[0].state).toBe('failed');
  for (let i = 0; i < 22; i += 1) await f.manager.run(id);
  expect(f.manager.list()[0].runs).toHaveLength(20);
  f.store.save.mockImplementation(() => {
    throw Error('Disk full');
  });
  expect(() => f.manager.create(input)).toThrow('Disk full');
  expect(f.manager.list()).toHaveLength(1);
});
it('rejects malformed schedules and past once schedules', () => {
  expect(() =>
    validateAITask({ ...input, schedule: { kind: 'interval', minutes: 0 } })
  ).toThrow('Interval');
  expect(() =>
    validateAITask({ ...input, schedule: { kind: 'once', at: NaN } })
  ).toThrow('valid run time');
  expect(() =>
    fixture().manager.create({ ...input, schedule: { kind: 'once', at: 10 } })
  ).toThrow('future');
});
it('encrypts atomic task storage and refuses plaintext fallback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tasks-test-'));
  const file = path.join(root, 'tasks.bin');
  const storage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (value: string) =>
      Buffer.from(value).map((byte) => byte ^ 123),
    decryptString: (value: Buffer) =>
      value.map((byte) => byte ^ 123).toString(),
  } as any;
  try {
    const store = new AITaskStore(file, storage);
    const manager = new AITaskManager(
      store,
      async () => ({ state: 'completed', summary: '' }),
      () => true,
      () => {}
    );
    manager.create(input);
    expect(
      fs.readFileSync(file).includes(Buffer.from(input.instructions))
    ).toBe(false);
    expect(store.load()[0].instructions).toBe(input.instructions);
    storage.isEncryptionAvailable = () => false;
    expect(() => store.save([])).toThrow('OS encryption');
    expect(fs.existsSync(file)).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('disables interrupted recurring work on startup instead of replaying it', async () => {
  const stored: SavedAITask[] = [
    {
      ...input,
      id: 'interrupted',
      enabled: true,
      schedule: { kind: 'interval', minutes: 1 },
      nextRunAt: 1,
      runs: [{ id: 'run', state: 'running', startedAt: 1, summary: '' }],
    },
  ];
  const runner = jest.fn();
  const store = { load: () => stored, save: jest.fn() };
  const manager = new AITaskManager(
    store,
    runner,
    () => true,
    () => {},
    () => 100000
  );
  await manager.tick();
  expect(runner).not.toHaveBeenCalled();
  expect(manager.list()[0]).toMatchObject({
    enabled: false,
    runs: [{ state: 'interrupted' }],
  });
});

it('parses timezone-qualified task arguments and rejects ambiguous dates', () => {
  expect(
    taskInputFromTool({
      name: 'Check',
      instructions: 'Read status',
      scheduleKind: 'daily',
      localTime: '09:00',
    }).schedule
  ).toEqual({ kind: 'daily', time: '09:00' });
  expect(() =>
    taskInputFromTool({ scheduleKind: 'once', runAt: '2026-11-06T09:00:00' })
  ).toThrow('timezone');
  expect(() =>
    validateAITask({ ...input, schedule: { kind: 'daily', time: '24:00' } })
  ).toThrow('daily');
});
it('keeps daily local time and interval start anchors after delayed execution', async () => {
  const morning = new Date(2026, 10, 5, 8, 0).getTime();
  const sameDay = new Date(nextDailyTaskRun('09:00', morning));
  expect(sameDay.getHours()).toBe(9);
  expect(sameDay.getDate()).toBe(5);
  expect(new Date(nextDailyTaskRun('09:00', sameDay.getTime())).getDate()).toBe(
    6
  );
  const f = fixture();
  f.manager.create({
    ...input,
    schedule: { kind: 'interval', minutes: 10, startAt: 200000 },
  });
  f.advance(750000);
  await f.manager.tick();
  expect(f.manager.list()[0].nextRunAt).toBe(1400000);
});

it('retains private instructions when tasks are created and toggled', () => {
  const { manager } = fixture();
  const id = manager.create(
    {
      name: 'Private task',
      instructions: 'Approved saved fact',
      schedule: { kind: 'manual' },
    },
    true
  );
  expect(manager.list().find((task) => task.id === id)?.privateData).toBe(true);
  manager.change(id, 'toggle');
  expect(manager.list().find((task) => task.id === id)?.privateData).toBe(true);
});

it('preserves task privacy through encrypted reload and treats legacy instructions conservatively', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-task-privacy-')
  );
  const file = path.join(directory, 'tasks.bin');
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (bytes: Buffer) => bytes.toString(),
  };
  const store = new AITaskStore(file, storage as any);
  const task: SavedAITask = {
    id: 'private',
    name: 'Private task',
    instructions: 'Approved saved fact',
    schedule: { kind: 'manual' },
    enabled: true,
    runs: [],
    privateData: true,
  };
  try {
    store.save([task]);
    expect(store.load()[0].privateData).toBe(true);
    const legacy = { ...task };
    delete legacy.privateData;
    store.save([legacy]);
    expect(store.load()[0].privateData).toBe(true);
    store.save([{ ...task, privateData: false }]);
    expect(store.load()[0].privateData).toBe(false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
