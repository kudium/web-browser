/**
 * Per-tab console and request logs for QA flows (spec 4.11). Bounded ring
 * buffers; request bodies and headers are never captured, and URL values that
 * look like credentials are redacted before storage. Reading either log is a
 * page-authored read for the taint rule.
 */
import type { Session, WebContents } from 'electron';
import { addRequestRule } from './requestRules';

export const AI_LOG_LIMIT = 500;
export const AI_LOG_MESSAGE_MAX = 2000;
export const AI_LOG_URL_MAX = 2048;
export const AI_LOG_READ_DEFAULT = 100;

export type AIConsoleLevel = 'verbose' | 'info' | 'warning' | 'error';
export interface AIConsoleEntry {
  at: number;
  level: AIConsoleLevel;
  message: string;
  source?: string;
  line?: number;
}
export interface AIRequestEntry {
  id: number;
  at: number;
  method: string;
  url: string;
  type: string;
  status?: number;
  fromCache?: boolean;
  durationMs?: number;
  error?: string;
}

const LEVELS: AIConsoleLevel[] = ['verbose', 'info', 'warning', 'error'];
const SECRET_PARAM = /(pass|pwd|secret|token|auth|session|sid|api[-_]?key|key|otp|code|card|cvv|cvc|ssn|signature|credential)/i;
const CARD_LIKE = /\b(?:\d[ -]?){13,19}\b/g;

/** Query values under secret-looking names and card-like digit runs never reach the log. */
export function redactURL(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.replace(CARD_LIKE, '[redacted]').slice(0, AI_LOG_URL_MAX);
  }
  if (url.username || url.password) {
    url.username = url.username ? '[redacted]' : '';
    url.password = url.password ? '[redacted]' : '';
  }
  const keys = [...url.searchParams.keys()];
  keys.forEach((key) => {
    if (SECRET_PARAM.test(key)) url.searchParams.set(key, '[redacted]');
  });
  if (url.hash && SECRET_PARAM.test(url.hash)) url.hash = '#[redacted]';
  return url.href.replace(CARD_LIKE, '[redacted]').slice(0, AI_LOG_URL_MAX);
}

/** `/pattern/flags` is a regular expression; anything else is a case-insensitive substring. */
export function parseRequestFilter(filter: string): (url: string) => boolean {
  const text = String(filter);
  if (!text.trim()) throw new Error('filter must not be empty.');
  if (text.length > 500) throw new Error('filter is longer than 500 characters.');
  const regex = text.match(/^\/(.+)\/([a-z]*)$/s);
  if (regex) {
    if (regex[1].length > 200) throw new Error('filter pattern is longer than 200 characters.');
    let compiled: RegExp;
    try {
      compiled = new RegExp(regex[1], regex[2].replace(/[^gimsuy]/g, ''));
    } catch (error) {
      throw new Error(`filter is not a valid regular expression: ${(error as Error).message}`);
    }
    return (url) => {
      compiled.lastIndex = 0;
      return compiled.test(url);
    };
  }
  const needle = text.toLowerCase();
  return (url) => url.toLowerCase().includes(needle);
}

export interface AILogReadOptions {
  since?: number;
  limit?: number;
  filter?: string;
}
function readOptions(options: AILogReadOptions) {
  const since = options.since ?? 0;
  if (typeof since !== 'number' || !Number.isFinite(since) || since < 0)
    throw new Error('since must be a timestamp in milliseconds.');
  const limit = options.limit ?? AI_LOG_READ_DEFAULT;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 200)
    throw new Error('limit must be 1–200.');
  return { since, limit: Number(limit) };
}

class Ring<T> {
  private items: T[] = [];

  private dropped = 0;

  push(item: T) {
    this.items.push(item);
    if (this.items.length > AI_LOG_LIMIT) {
      this.items.splice(0, this.items.length - AI_LOG_LIMIT);
      this.dropped += 1;
    }
  }

  all() {
    return this.items;
  }

  get droppedCount() {
    return this.dropped;
  }
}

export class AIConsoleLog {
  private ring = new Ring<AIConsoleEntry>();

  push(level: number | string, message: string, line?: number, source?: string) {
    const index = typeof level === 'number' ? level : LEVELS.indexOf(level as AIConsoleLevel);
    this.ring.push({
      at: Date.now(),
      level: LEVELS[index] ?? 'info',
      message: String(message).slice(0, AI_LOG_MESSAGE_MAX),
      ...(source ? { source: redactURL(source) } : {}),
      ...(typeof line === 'number' && line > 0 ? { line } : {}),
    });
  }

  read(options: AILogReadOptions = {}) {
    const { since, limit } = readOptions(options);
    const matching = this.ring.all().filter((entry) => entry.at >= since);
    return {
      entries: matching.slice(-limit),
      total: matching.length,
      truncated: matching.length > limit,
      dropped: this.ring.droppedCount,
    };
  }
}

export class AIRequestLog {
  private ring = new Ring<AIRequestEntry>();

  private open = new Map<number, AIRequestEntry>();

  started(details: { id: number; method: string; url: string; resourceType: string; timestamp?: number }) {
    const entry: AIRequestEntry = {
      id: details.id,
      at: details.timestamp ? Math.round(details.timestamp) : Date.now(),
      method: details.method,
      url: redactURL(details.url),
      type: details.resourceType,
    };
    this.open.set(details.id, entry);
    if (this.open.size > AI_LOG_LIMIT) {
      const first = this.open.keys().next().value;
      if (first !== undefined) this.open.delete(first);
    }
    this.ring.push(entry);
  }

  completed(details: { id: number; statusCode: number; fromCache: boolean; timestamp?: number }) {
    const entry = this.open.get(details.id);
    if (!entry) return;
    this.open.delete(details.id);
    entry.status = details.statusCode;
    entry.fromCache = details.fromCache;
    entry.durationMs = Math.max(0, Math.round((details.timestamp ?? Date.now()) - entry.at));
  }

  failed(details: { id: number; error: string; timestamp?: number }) {
    const entry = this.open.get(details.id);
    if (!entry) return;
    this.open.delete(details.id);
    entry.error = String(details.error).slice(0, 200);
    entry.durationMs = Math.max(0, Math.round((details.timestamp ?? Date.now()) - entry.at));
  }

  /** Has a request matching `filter` started since `since`? (wait_until { request }) */
  seen(filter: string, since: number) {
    const matches = parseRequestFilter(filter);
    return this.ring.all().some((entry) => entry.at >= since && matches(entry.url));
  }

  read(options: AILogReadOptions = {}) {
    const { since, limit } = readOptions(options);
    const matches = options.filter !== undefined ? parseRequestFilter(options.filter) : () => true;
    const matching = this.ring.all().filter((entry) => entry.at >= since && matches(entry.url));
    return {
      entries: matching.slice(-limit),
      total: matching.length,
      truncated: matching.length > limit,
      dropped: this.ring.droppedCount,
    };
  }
}

interface SessionObserver {
  logs: Map<number, AIRequestLog>;
  release: () => void;
}

/**
 * Attaches to tab renderers as they appear; one webRequest observer per session
 * fans out to the tab logs (Electron keeps one listener per webRequest event).
 */
export class AIPageLogs {
  private consoles = new Map<number, AIConsoleLog>();

  private requestLogs = new Map<number, AIRequestLog>();

  private sessions = new Map<Session, SessionObserver>();

  private detachers = new Map<number, () => void>();

  attach(contents: WebContents) {
    if (contents.isDestroyed() || this.detachers.has(contents.id)) return;
    const id = contents.id;
    const console = new AIConsoleLog();
    const requests = new AIRequestLog();
    this.consoles.set(id, console);
    this.requestLogs.set(id, requests);
    const onConsole = (
      _event: unknown,
      details: { level: number | string; message: string; lineNumber?: number; sourceId?: string }
    ) => {
      if (!details || typeof details !== 'object') return;
      console.push(details.level, details.message, details.lineNumber, details.sourceId);
    };
    contents.on('console-message', onConsole as never);
    const observer = this.observe(contents.session);
    observer.logs.set(id, requests);
    const detach = () => {
      this.detachers.delete(id);
      this.consoles.delete(id);
      this.requestLogs.delete(id);
      observer.logs.delete(id);
      if (!observer.logs.size) {
        observer.release();
        this.sessions.delete(contents.session);
      }
      if (!contents.isDestroyed()) contents.removeListener('console-message', onConsole as never);
    };
    contents.once('destroyed', detach);
    this.detachers.set(id, detach);
  }

  private observe(session: Session): SessionObserver {
    const existing = this.sessions.get(session);
    if (existing) return existing;
    const logs = new Map<number, AIRequestLog>();
    const removeStart = addRequestRule(session, (details) => {
      if (typeof details.webContentsId === 'number') logs.get(details.webContentsId)?.started(details);
      return false;
    });
    const filter = { urls: ['http://*/*', 'https://*/*'] };
    session.webRequest.onCompleted(filter, (details) => {
      if (typeof details.webContentsId === 'number') logs.get(details.webContentsId)?.completed(details);
    });
    session.webRequest.onErrorOccurred(filter, (details) => {
      if (typeof details.webContentsId === 'number') logs.get(details.webContentsId)?.failed(details);
    });
    const observer: SessionObserver = {
      logs,
      release: () => {
        removeStart();
        try {
          session.webRequest.onCompleted(null);
          session.webRequest.onErrorOccurred(null);
        } catch {
          /* Session may be gone. */
        }
      },
    };
    this.sessions.set(session, observer);
    return observer;
  }

  console(contents: WebContents) {
    this.attach(contents);
    return this.consoles.get(contents.id)!;
  }

  requests(contents: WebContents) {
    this.attach(contents);
    return this.requestLogs.get(contents.id)!;
  }

  dispose() {
    [...this.detachers.values()].forEach((detach) => detach());
  }
}
