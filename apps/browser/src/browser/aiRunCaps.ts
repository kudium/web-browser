/**
 * Runaway protection for runs (spec 4.11). Budgets cover time; caps cover
 * the actions that cost the user something even when each one is allowed:
 * navigations, tab creations, uploads and bytes written into the project
 * folder. A step over a cap fails with the cap's name in its receipt.
 */
export interface AIRunCaps {
  navigations: number;
  tabs: number;
  uploads: number;
  /** Bytes written to the linked project folder through project_files. */
  projectBytes: number;
}
export type AIRunCap = keyof AIRunCaps;

export const AI_RUN_DEFAULT_CAPS: Readonly<AIRunCaps> = {
  navigations: 200,
  tabs: 20,
  uploads: 20,
  projectBytes: 5 * 1024 * 1024,
};
export const AI_RUN_MAX_CAPS: Readonly<AIRunCaps> = {
  navigations: 2000,
  tabs: 200,
  uploads: 200,
  projectBytes: 50 * 1024 * 1024,
};
const CAP_NAMES = Object.keys(AI_RUN_DEFAULT_CAPS) as AIRunCap[];

/** Validate the optional `caps` argument of act / run_script. */
export function aiRunCaps(value: unknown): AIRunCaps {
  if (value === undefined) return { ...AI_RUN_DEFAULT_CAPS };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('caps must be an object.');
  const caps: AIRunCaps = { ...AI_RUN_DEFAULT_CAPS };
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (!CAP_NAMES.includes(key as AIRunCap))
      throw new Error(`caps has an unsupported key "${key}". Use ${CAP_NAMES.join(', ')}.`);
    const cap = key as AIRunCap;
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry > AI_RUN_MAX_CAPS[cap])
      throw new Error(`caps.${cap} must be an integer between 0 and ${AI_RUN_MAX_CAPS[cap]}.`);
    caps[cap] = entry;
  });
  return caps;
}

export class AIRunCapError extends Error {
  constructor(readonly cap: AIRunCap, readonly limit: number) {
    super(
      `Run cap reached: ${
        cap === 'projectBytes'
          ? `${limit} bytes written to the project folder`
          : `${limit} ${cap}`
      }. Stop and ask the user before continuing.`
    );
    this.name = 'AIRunCapError';
  }
}

const NAVIGATION_TOOLS = ['navigate', 'back', 'forward', 'reload'];
const TAB_TOOLS = ['new_tab', 'create_group'];
const UPLOAD_TOOLS = ['upload_files', 'upload_chat_attachment', 'attach_personal_document'];
const WRITING_FILE_ACTIONS = ['save', 'create-file'];

/** What a step costs against the caps, before it runs. */
export function aiRunCapCharge(tool: string, args: Record<string, unknown>): Partial<AIRunCaps> {
  if (NAVIGATION_TOOLS.includes(tool)) return { navigations: 1 };
  if (TAB_TOOLS.includes(tool)) return { tabs: 1 };
  if (UPLOAD_TOOLS.includes(tool)) return { uploads: 1 };
  if (tool === 'project_files') {
    const request = args.fileRequest as { action?: unknown; text?: unknown } | undefined;
    if (request && WRITING_FILE_ACTIONS.includes(String(request.action)))
      return { projectBytes: typeof request.text === 'string' ? Buffer.byteLength(request.text) : 0 };
  }
  return {};
}

/** Per-run usage; `charge` throws the first time a cap would be exceeded. */
export class AIRunCapCounter {
  readonly used: AIRunCaps = { navigations: 0, tabs: 0, uploads: 0, projectBytes: 0 };

  constructor(readonly caps: AIRunCaps = { ...AI_RUN_DEFAULT_CAPS }) {}

  charge(tool: string, args: Record<string, unknown>) {
    const cost = aiRunCapCharge(tool, args);
    (Object.entries(cost) as [AIRunCap, number][]).forEach(([cap, amount]) => {
      if (this.used[cap] + amount > this.caps[cap]) throw new AIRunCapError(cap, this.caps[cap]);
    });
    (Object.entries(cost) as [AIRunCap, number][]).forEach(([cap, amount]) => {
      this.used[cap] += amount;
    });
  }

  /** For receipts: what the run consumed against which limits. */
  summary() {
    return { used: { ...this.used }, caps: { ...this.caps } };
  }
}
