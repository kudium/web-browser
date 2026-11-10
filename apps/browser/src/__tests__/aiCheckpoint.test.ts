/* eslint-disable no-bitwise -- reversible test cipher and POSIX mode mask */
/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AICheckpointStore,
  extendCheckpointBudget,
} from '../main/aiCheckpoint';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-checkpoint-test-'));
});
afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});
const storage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'keychain',
  encryptString: (value: string) =>
    Buffer.from(value).map((byte) => byte ^ 123),
  decryptString: (value: Buffer) =>
    Buffer.from(value)
      .map((byte) => byte ^ 123)
      .toString(),
};
const checkpoint = () => ({
  messages: [{ role: 'user', content: 'Private paused task' }],
  step: 3,
  endpoint: 'https://example.com/v1',
  expires: Date.now() + 60000,
});
it('restores encrypted paused context in a new store without executing anything', () => {
  const filename = path.join(directory, 'checkpoint');
  const value = checkpoint();
  new AICheckpointStore(filename, storage as any).save(value);
  expect(fs.readFileSync(filename).toString()).not.toContain(
    'Private paused task'
  );
  expect(new AICheckpointStore(filename, storage as any).load()).toEqual(value);
  if (process.platform !== 'win32') {
    expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
  }
});
it('removes persisted context on Stop or a new task', () => {
  const filename = path.join(directory, 'checkpoint');
  const store = new AICheckpointStore(filename, storage as any);
  store.save(checkpoint());
  store.save(undefined);
  expect(store.load()).toBeUndefined();
  expect(fs.existsSync(filename)).toBe(false);
});
it.each([true, false, undefined])(
  'preserves the private-data marker %s across encrypted recovery',
  (privateData) => {
    const filename = path.join(directory, 'checkpoint');
    const value = { ...checkpoint(), privateData };
    new AICheckpointStore(filename, storage as any).save(value);
    expect(new AICheckpointStore(filename, storage as any).load()).toEqual(
      value
    );
  }
);
it('rejects a malformed private-data marker', () => {
  const filename = path.join(directory, 'checkpoint');
  fs.writeFileSync(
    filename,
    storage.encryptString(
      JSON.stringify({ ...checkpoint(), privateData: 'false' })
    )
  );
  expect(
    new AICheckpointStore(filename, storage as any).load()
  ).toBeUndefined();
});
it.each(['expired', 'corrupt', 'oversized', 'invalid-step'])(
  'rejects and removes %s state',
  (kind) => {
    const filename = path.join(directory, 'checkpoint');
    const store = new AICheckpointStore(filename, storage as any);
    const value = checkpoint();
    if (kind === 'expired') value.expires = Date.now() - 1;
    if (kind === 'invalid-step') value.step = 60;
    store.save(value);
    if (kind === 'corrupt') fs.writeFileSync(filename, 'broken');
    if (kind === 'oversized')
      fs.writeFileSync(filename, Buffer.alloc(16 * 1024 * 1024 + 1));
    expect(store.load()).toBeUndefined();
    expect(fs.existsSync(filename)).toBe(false);
  }
);
it('never falls back to plaintext when OS encryption is unavailable', () => {
  const filename = path.join(directory, 'checkpoint');
  const store = new AICheckpointStore(filename, {
    ...storage,
    getSelectedStorageBackend: () => 'basic_text',
  } as any);
  store.save(checkpoint());
  expect(fs.existsSync(filename)).toBe(false);
  expect(store.load()).toBeUndefined();
});

it('restores a budget pause the next day with a fresh segment and completed tool results', () => {
  const filename = path.join(directory, 'checkpoint');
  const value = {
    ...checkpoint(),
    pauseKind: 'budget' as const,
    step: 0,
    expires: Date.now() + 24 * 60 * 60 * 1000,
    messages: [
      { role: 'user', content: 'Original task' },
      {
        role: 'assistant',
        tool_calls: [
          { id: 'done', function: { name: 'list_tabs', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'done', content: 'Completed result' },
    ],
  };
  new AICheckpointStore(filename, storage as any).save(value);
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000);
  try {
    expect(new AICheckpointStore(filename, storage as any).load()).toEqual(
      value
    );
  } finally {
    clock.mockRestore();
  }
});

it('does not grant ordinary error checkpoints the longer budget-pause lifetime', () => {
  const filename = path.join(directory, 'checkpoint');
  new AICheckpointStore(filename, storage as any).save({
    ...checkpoint(),
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  expect(
    new AICheckpointStore(filename, storage as any).load()
  ).toBeUndefined();
});

it('doubles the round allowance on every continuation while preserving completed results', () => {
  let value = checkpoint();
  for (const limit of [120, 240, 480]) {
    const next = extendCheckpointBudget(value);
    expect(next.roundLimit).toBe(limit);
    expect(next.step).toBe(0);
    expect(next.messages).toBe(value.messages);
    value = next;
  }
});

it('restores expanded round budgets after restart', () => {
  const filename = path.join(directory, 'checkpoint');
  const value = { ...checkpoint(), roundLimit: 240, step: 130 };
  new AICheckpointStore(filename, storage as any).save(value);
  expect(new AICheckpointStore(filename, storage as any).load()).toEqual(value);
});

it.each([0, -1, 1.5, '120', Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid round allowance %s',
  (roundLimit) => {
    const filename = path.join(directory, 'checkpoint');
    new AICheckpointStore(filename, storage as any).save({
      ...checkpoint(),
      roundLimit,
    } as any);
    expect(
      new AICheckpointStore(filename, storage as any).load()
    ).toBeUndefined();
  }
);
