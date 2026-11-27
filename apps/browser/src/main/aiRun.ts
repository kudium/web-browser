import {
  AIActStep,
  AI_RUN_DEFAULT_BUDGET_MS,
  AI_RUN_NESTED_EXCLUDED,
} from '../browser/aiRun';

export interface AIStepReceipt {
  step: number;
  tool: string;
  tabId?: string;
  url?: string;
  durationMs: number;
  ok: boolean;
  /** A website dialog is waiting; the run stops until handle_dialog answers. */
  pending?: boolean;
  error?: string;
}

export interface AIRunResult {
  ok: boolean;
  completed: number;
  total: number;
  receipts: AIStepReceipt[];
  /** The last step's output, so a flow ending in a read returns its observation. */
  value?: unknown;
  error?: string;
  budgetMs: number;
}

export type AIStepDispatch = (
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal
) => Promise<unknown>;

export class AIRunBudgetError extends Error {
  constructor(budgetMs: number) {
    super(`Run budget of ${budgetMs} ms exceeded.`);
    this.name = 'AIRunBudgetError';
  }
}

/** One abort signal that covers the caller's Stop and the run's time budget. */
export function runWithBudget<T>(
  signal: AbortSignal,
  budgetMs: number,
  work: (runSignal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new AIRunBudgetError(budgetMs)),
    budgetMs
  );
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  return work(controller.signal).finally(() => {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  });
}

const receiptTab = (args: Record<string, unknown>, output: unknown) => {
  if (typeof args.tabId === 'string') return args.tabId;
  const value = output as { tabId?: unknown } | undefined;
  return typeof value?.tabId === 'string' ? value.tabId : undefined;
};
const receiptURL = (output: unknown) => {
  const value = output as { url?: unknown } | undefined;
  return typeof value?.url === 'string' ? value.url : undefined;
};
const isPending = (output: unknown) =>
  !!output &&
  typeof output === 'object' &&
  (output as { pending?: unknown }).pending === true;

/** Run an ordered step list through the engine, stopping at the first failure. */
export async function runAIAct(
  steps: AIActStep[],
  dispatch: AIStepDispatch,
  signal: AbortSignal,
  options: {
    budgetMs?: number;
    onStep?: (receipt: AIStepReceipt, total: number) => void;
  } = {}
): Promise<AIRunResult> {
  const budgetMs = options.budgetMs ?? AI_RUN_DEFAULT_BUDGET_MS;
  const receipts: AIStepReceipt[] = [];
  let value: unknown;
  let error: string | undefined;
  await runWithBudget(signal, budgetMs, async (runSignal) => {
    for (const [index, step] of steps.entries()) {
      if (runSignal.aborted) {
        error =
          runSignal.reason instanceof Error
            ? runSignal.reason.message
            : 'Stopped.';
        return;
      }
      if ((AI_RUN_NESTED_EXCLUDED as readonly string[]).includes(step.tool)) {
        error = `${step.tool} cannot run inside a step list.`;
        return;
      }
      const startedAt = Date.now();
      const receipt: AIStepReceipt = {
        step: index + 1,
        tool: step.tool,
        durationMs: 0,
        ok: false,
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        const output = await dispatch(step.tool, step.args, runSignal);
        receipt.durationMs = Date.now() - startedAt;
        receipt.ok = true;
        receipt.tabId = receiptTab(step.args, output);
        receipt.url = receiptURL(output);
        value = output;
        if (isPending(output)) {
          receipt.pending = true;
          receipts.push(receipt);
          options.onStep?.(receipt, steps.length);
          error =
            'A website dialog is waiting. Answer it with handle_dialog before continuing.';
          return;
        }
        receipts.push(receipt);
        options.onStep?.(receipt, steps.length);
      } catch (reason) {
        receipt.durationMs = Date.now() - startedAt;
        receipt.tabId = receiptTab(step.args, undefined);
        receipt.error =
          runSignal.aborted && runSignal.reason instanceof AIRunBudgetError
            ? runSignal.reason.message
            : (reason as Error).message;
        receipts.push(receipt);
        options.onStep?.(receipt, steps.length);
        error = `Step ${index + 1} (${step.tool}) failed: ${receipt.error}`;
        return;
      }
    }
  });
  const completed = receipts.filter((receipt) => receipt.ok).length;
  return {
    ok: !error,
    completed,
    total: steps.length,
    receipts,
    ...(value !== undefined ? { value } : {}),
    ...(error ? { error } : {}),
    budgetMs,
  };
}
