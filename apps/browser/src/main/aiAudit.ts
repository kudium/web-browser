import fs from 'fs';
import path from 'path';

/**
 * Exportable audit log (spec 4.11): one JSON line per run, written beside
 * the Activity entry so a user or team can review what agents did. Lines
 * hold receipts and approval answers, never page content or saved values.
 */
export interface AIAuditApproval {
  tool: string;
  answer: 'allowed' | 'declined';
  /** Why the review happened: hard floor, taint, sensitive, or the mode. */
  reason?: string;
}
export interface AIAuditEntry {
  time: string;
  /** Client name for external runs, "Kudium assistant" for the built-in one. */
  agent: string;
  kind: 'act' | 'run_script';
  groupId?: string;
  groupName?: string;
  intent: string;
  ok: boolean;
  error?: string;
  durationMs?: number;
  steps: {
    step: number;
    tool: string;
    ok: boolean;
    durationMs: number;
    url?: string;
    error?: string;
    pending?: boolean;
  }[];
  approvals: AIAuditApproval[];
  caps?: { used: Record<string, number>; caps: Record<string, number> };
}

export const AI_AUDIT_FILE = 'ai-audit.jsonl';
export const AI_AUDIT_DEFAULT_RETENTION_DAYS = 90;
const MAX_LINE = 64 * 1024;
const MAX_EXPORT_LINES = 5000;

export function aiAuditRetentionDays(value: unknown): number {
  if (value === undefined) return AI_AUDIT_DEFAULT_RETENTION_DAYS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3650)
    throw new Error('Audit retention must be 1–3650 days.');
  return value;
}

export function aiAuditSince(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error('since must be a timestamp in milliseconds or an ISO date.');
}

export class AIAuditLog {
  constructor(private readonly file: string) {}

  get path() {
    return this.file;
  }

  append(entry: AIAuditEntry) {
    const line = JSON.stringify(entry);
    if (line.length > MAX_LINE) {
      // Keep the record, drop the bulk: receipts beyond the first 50 steps.
      const trimmed = { ...entry, steps: entry.steps.slice(0, 50), truncated: true };
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify(trimmed)}\n`, { mode: 0o600 });
      return;
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, `${line}\n`, { mode: 0o600 });
  }

  private lines(): string[] {
    try {
      return fs
        .readFileSync(this.file, 'utf8')
        .split('\n')
        .filter((line) => line.trim());
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return [];
      throw error;
    }
  }

  /** Entries at or after `since`, newest last, capped for a tool response. */
  read(options: { since?: number; limit?: number } = {}): AIAuditEntry[] {
    const limit = Math.min(options.limit ?? MAX_EXPORT_LINES, MAX_EXPORT_LINES);
    const entries: AIAuditEntry[] = [];
    this.lines().forEach((line) => {
      try {
        const entry = JSON.parse(line) as AIAuditEntry;
        if (options.since !== undefined && Date.parse(entry.time) < options.since) return;
        entries.push(entry);
      } catch {
        /* A damaged line is skipped, never repaired. */
      }
    });
    return entries.slice(-limit);
  }

  /** JSON lines text for export. */
  export(options: { since?: number } = {}): string {
    return this.read(options)
      .map((entry) => JSON.stringify(entry))
      .join('\n');
  }

  /** Drop entries older than the retention window; returns how many were removed. */
  prune(retentionDays: number, now = Date.now()): number {
    const lines = this.lines();
    if (!lines.length) return 0;
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    const kept = lines.filter((line) => {
      try {
        const time = Date.parse((JSON.parse(line) as AIAuditEntry).time);
        return !Number.isFinite(time) || time >= cutoff;
      } catch {
        return false;
      }
    });
    if (kept.length === lines.length) return 0;
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, kept.length ? `${kept.join('\n')}\n` : '', { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    return lines.length - kept.length;
  }
}
