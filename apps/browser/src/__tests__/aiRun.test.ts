/** @jest-environment node */
import {
  aiActSteps,
  aiRunBudget,
  aiRunIntent,
  aiScriptSource,
} from '../browser/aiRun';
import { runAIAct, runWithBudget, AIRunBudgetError } from '../main/aiRun';

afterEach(() => jest.useRealTimers());

it('validates step lists, budgets, intents and sources', () => {
  expect(aiActSteps([{ tool: 'read_page' }])).toEqual([
    { tool: 'read_page', args: {} },
  ]);
  expect(() => aiActSteps([])).toThrow('1–64');
  expect(() => aiActSteps(Array(65).fill({ tool: 'read_page' }))).toThrow('1–64');
  expect(() => aiActSteps([{ tool: 'act' }])).toThrow('cannot run inside');
  expect(() => aiActSteps([{ tool: 'request_access' }])).toThrow('cannot run inside');
  expect(() => aiActSteps([{ tool: 'click', args: [] }])).toThrow('args must be an object');
  expect(() => aiActSteps([{ tool: 'click', extra: 1 }])).toThrow('unsupported fields');
  expect(aiRunBudget(undefined)).toBe(120000);
  expect(() => aiRunBudget(500)).toThrow('budgetMs');
  expect(() => aiRunBudget(600001)).toThrow('budgetMs');
  expect(aiRunIntent('  sign  in ')).toBe('sign in');
  expect(() => aiRunIntent('x'.repeat(201))).toThrow('intent');
  expect(() => aiScriptSource('')).toThrow('source');
  expect(() => aiScriptSource('x'.repeat(64 * 1024 + 1))).toThrow('64 KB');
});

it('runs steps in order, records receipts and returns the last output', async () => {
  const dispatch = jest.fn(async (tool: string, args: Record<string, unknown>, _signal: AbortSignal) =>
    tool === 'read_page'
      ? { url: 'https://site.test/', snapshotId: 's1', tabId: args.tabId }
      : { clicked: true }
  );
  const seen: string[] = [];
  const result = await runAIAct(
    [
      { tool: 'navigate', args: { tabId: 't1', url: 'https://site.test/' } },
      { tool: 'read_page', args: { tabId: 't1' } },
    ],
    dispatch,
    new AbortController().signal,
    { onStep: (receipt, total) => seen.push(`${receipt.step}/${total}:${receipt.tool}`) }
  );
  expect(result.ok).toBe(true);
  expect(result.completed).toBe(2);
  expect(result.receipts.map((receipt) => receipt.tool)).toEqual(['navigate', 'read_page']);
  expect(result.receipts[1]).toMatchObject({ ok: true, tabId: 't1', url: 'https://site.test/' });
  expect(result.value).toMatchObject({ snapshotId: 's1' });
  expect(seen).toEqual(['1/2:navigate', '2/2:read_page']);
  expect(dispatch.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
});

it('stops at the first failing step and reports which one', async () => {
  const dispatch = jest
    .fn()
    .mockResolvedValueOnce({ ok: 1 })
    .mockRejectedValueOnce(new Error('Stale snapshot.'))
    .mockResolvedValue({ never: true });
  const result = await runAIAct(
    [
      { tool: 'read_page', args: {} },
      { tool: 'click', args: { elementId: 3 } },
      { tool: 'read_page', args: {} },
    ],
    dispatch,
    new AbortController().signal
  );
  expect(result.ok).toBe(false);
  expect(result.completed).toBe(1);
  expect(result.error).toBe('Step 2 (click) failed: Stale snapshot.');
  expect(result.receipts).toHaveLength(2);
  expect(result.receipts[1]).toMatchObject({ ok: false, error: 'Stale snapshot.' });
  expect(dispatch).toHaveBeenCalledTimes(2);
});

it('stops when a step leaves a website dialog pending', async () => {
  const dispatch = jest
    .fn()
    .mockResolvedValueOnce({ pending: true, dialog: { id: 'd1' }, tabId: 't1' })
    .mockResolvedValue({});
  const result = await runAIAct(
    [
      { tool: 'click', args: { elementId: 1 } },
      { tool: 'read_page', args: {} },
    ],
    dispatch,
    new AbortController().signal
  );
  expect(result.ok).toBe(false);
  expect(result.error).toContain('handle_dialog');
  expect(result.receipts[0]).toMatchObject({ pending: true, tabId: 't1' });
  expect(result.value).toMatchObject({ dialog: { id: 'd1' } });
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it('refuses nested run tools even when the caller bypassed validation', async () => {
  const dispatch = jest.fn();
  const result = await runAIAct(
    [{ tool: 'resume_control', args: {} }],
    dispatch,
    new AbortController().signal
  );
  expect(result.ok).toBe(false);
  expect(result.error).toContain('cannot run inside');
  expect(dispatch).not.toHaveBeenCalled();
});

it('ends the run when the budget expires and aborts the step signal', async () => {
  jest.useFakeTimers();
  let stepSignal: AbortSignal | undefined;
  const dispatch = jest.fn(
    (_tool: string, _args: Record<string, unknown>, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        stepSignal = signal;
        signal.addEventListener('abort', () => reject(signal.reason));
      })
  );
  const pending = runAIAct(
    [{ tool: 'wait_until', args: {} }],
    dispatch,
    new AbortController().signal,
    { budgetMs: 1000 }
  );
  await jest.advanceTimersByTimeAsync(1000);
  const result = await pending;
  expect(stepSignal?.aborted).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.error).toBe('Step 1 (wait_until) failed: Run budget of 1000 ms exceeded.');
});

it('propagates Stop through the budget signal and clears its timer', async () => {
  jest.useFakeTimers();
  const control = new AbortController();
  const pending = runWithBudget(control.signal, 5000, (signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    })
  );
  control.abort(new Error('Stopped.'));
  await expect(pending).rejects.toThrow('Stopped.');
  expect(jest.getTimerCount()).toBe(0);
  const expired = runWithBudget(
    new AbortController().signal,
    10,
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      })
  );
  const outcome = expired.catch((error) => error);
  await jest.advanceTimersByTimeAsync(10);
  await expect(outcome).resolves.toBeInstanceOf(AIRunBudgetError);
  expect(new AIRunBudgetError(10).message).toBe('Run budget of 10 ms exceeded.');
});
