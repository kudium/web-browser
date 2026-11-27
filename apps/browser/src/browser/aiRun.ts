/** Shared validation for multi-step runs (`act` step lists and `run_script`). */
export interface AIActStep {
  tool: string;
  args: Record<string, unknown>;
}

export const AI_RUN_DEFAULT_BUDGET_MS = 120000;
export const AI_RUN_MAX_BUDGET_MS = 600000;
export const AI_RUN_MIN_BUDGET_MS = 1000;
export const AI_ACT_MAX_STEPS = 64;
export const AI_SCRIPT_MAX_SOURCE = 64 * 1024;
export const AI_SCRIPT_MAX_OUTPUT = 1024 * 1024;
/** Tools that manage the run itself or widen authority never nest inside one. */
/** Groups a run declares it may switch to; ids come from list_groups. */
export function aiRunGroups(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 16 || value.some((id) => typeof id !== 'string' || !id || id.length > 300))
    throw new Error('groups must list up to 16 group IDs.');
  return [...new Set(value as string[])];
}

export const AI_RUN_NESTED_EXCLUDED = [
  'act',
  'run_script',
  'request_access',
  'resume_control',
  'set_scope',
  'discover_tools',
] as const;

export function aiRunBudget(value: unknown): number {
  if (value === undefined) return AI_RUN_DEFAULT_BUDGET_MS;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < AI_RUN_MIN_BUDGET_MS ||
    value > AI_RUN_MAX_BUDGET_MS
  )
    throw new Error(
      `budgetMs must be an integer between ${AI_RUN_MIN_BUDGET_MS} and ${AI_RUN_MAX_BUDGET_MS}.`
    );
  return value;
}

export function aiRunIntent(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 200)
    throw new Error('intent must be a string of at most 200 characters.');
  return value.replace(/\s+/g, ' ').trim();
}

export function aiActSteps(value: unknown): AIActStep[] {
  if (!Array.isArray(value) || !value.length || value.length > AI_ACT_MAX_STEPS)
    throw new Error(`steps must list 1–${AI_ACT_MAX_STEPS} tool calls.`);
  return value.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step))
      throw new Error(`Step ${index + 1} must be an object with tool and args.`);
    const { tool, args, ...rest } = step as Record<string, unknown>;
    if (Object.keys(rest).length)
      throw new Error(`Step ${index + 1} has unsupported fields: ${Object.keys(rest).join(', ')}.`);
    if (typeof tool !== 'string' || !/^[a-z_]{1,40}$/.test(tool))
      throw new Error(`Step ${index + 1} needs a tool name.`);
    if ((AI_RUN_NESTED_EXCLUDED as readonly string[]).includes(tool))
      throw new Error(`Step ${index + 1}: ${tool} cannot run inside a step list.`);
    if (
      args !== undefined &&
      (!args || typeof args !== 'object' || Array.isArray(args))
    )
      throw new Error(`Step ${index + 1} args must be an object.`);
    return { tool, args: (args as Record<string, unknown>) ?? {} };
  });
}

export function aiScriptSource(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('source must be a non-empty JavaScript string.');
  if (Buffer.byteLength(value) > AI_SCRIPT_MAX_SOURCE)
    throw new Error('source must be at most 64 KB.');
  return value;
}
