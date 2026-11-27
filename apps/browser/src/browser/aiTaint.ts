/**
 * Prompt-injection containment. A controller that has read page content from
 * an origin outside the group's own set is "tainted": text on that page may
 * be steering it. Taint never blocks ordinary browsing; it only forces review
 * at the edges where words could become a shell command, a file write or a
 * script, in every access mode and in trusted groups too.
 */
export const AI_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Tools whose output is page-authored text: reading them taints the controller. */
export const AI_TAINTING_READS = [
  'read_page',
  'wait_until',
  'find_element',
  'extract_rows',
  'read_options',
  'screenshot',
  'list_frames',
  'read_console',
  'read_requests',
  'wait_for_email',
] as const;

/** Inbox content is authored by whoever sent the mail; it is never the group's own. */
export const EMAIL_TAINT_ORIGIN = 'https://inbox.email.invalid';

export function aiOrigin(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return undefined;
    return parsed.origin === 'null' ? parsed.protocol : parsed.origin;
  } catch {
    return undefined;
  }
}

export function aiLocalOrigin(origin: string) {
  try {
    const host = new URL(origin).hostname;
    return AI_LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
  } catch {
    return origin === 'file:';
  }
}

export class AITaintTracker {
  private reads = new Set<string>();

  private own = new Set<string>();

  /** Origins the group itself owns (manifest tabs); local origins always count. */
  setOwnOrigins(origins: Iterable<string>) {
    this.own = new Set([...origins].map((origin) => origin.toLowerCase()));
  }

  isOwn(origin: string) {
    return aiLocalOrigin(origin) || this.own.has(origin.toLowerCase());
  }

  /** Record a page read; returns the origin when it taints the controller. */
  read(url: unknown): string | undefined {
    const origin = aiOrigin(url);
    if (!origin || this.isOwn(origin)) return undefined;
    this.reads.add(origin);
    return origin;
  }

  get tainted() {
    return this.reads.size > 0;
  }

  /** The foreign origins read so far, for the review dialog. */
  get origins(): string[] {
    return [...this.reads];
  }

  reset() {
    this.reads.clear();
  }
}

export interface AITaintedActionRequest {
  tool: string;
  args: Record<string, unknown>;
  /** Commands the user authored in the workspace manifest keep running silently. */
  manifestScripts?: Iterable<string>;
}

/**
 * Does this project action need review because the controller is tainted?
 * Shell commands, non-manifest scripts and writes outside docs/ do.
 */
export function aiTaintedProjectAction(request: AITaintedActionRequest): boolean {
  const { tool, args } = request;
  if (tool === 'project_terminal') return args.terminalAction === 'run';
  if (tool === 'project_scripts') {
    const script = args.scriptRequest as { action?: unknown; id?: unknown } | undefined;
    if (script?.action !== 'run') return false;
    const allowed = new Set(request.manifestScripts ?? []);
    return !(typeof script.id === 'string' && allowed.has(script.id));
  }
  if (tool === 'project_files') {
    const file = args.fileRequest as { action?: unknown; path?: unknown } | undefined;
    if (!file || !['save', 'create', 'rename', 'duplicate', 'delete'].includes(String(file.action)))
      return false;
    const path = typeof file.path === 'string' ? file.path.replace(/\\/g, '/') : '';
    return !/^docs\/[^/]/.test(path) || path.includes('..');
  }
  return false;
}
