import { Worker } from 'worker_threads';
import type { HistoryRecord } from '../browser/history';

// Kept as a fixed program so webpack and packaged ASAR need no separate worker
// entrypoint. Only internal data messages cross this boundary; no supplied code.
const program = String.raw`
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
let records = workerData.records;
let revision = 0;
let timer;
let dirty = false;
let writes = 0;
let bytes = 0;
function save(next) {
  const text = JSON.stringify(next);
  if (Buffer.byteLength(text) > 16 * 1024 * 1024)
    throw new Error('Browsing history exceeds its storage limit.');
  fs.mkdirSync(path.dirname(workerData.file), { recursive: true });
  const temporary = workerData.file + '.kudiumbrowser-' + randomUUID() + '.tmp';
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, text);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, workerData.file);
    writes += 1;
    bytes += Buffer.byteLength(text);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function commit(id, next = records) {
  clearTimeout(timer);
  timer = undefined;
  try {
    const deletion = next !== records;
    if (dirty || next !== records) save(next);
    records = next;
    dirty = false;
    revision = Math.max(revision, id || 0);
    parentPort.postMessage({ kind: 'committed', id, revision, records: deletion ? records : undefined, writes, bytes });
  } catch (error) {
    parentPort.postMessage({ kind: 'failed', id, error: error.message });
  }
}
parentPort.on('message', message => {
  if (message.action === 'visit') {
    records = [message.record, ...records].slice(0, 10000);
    revision = message.id;
    dirty = true;
    if (!timer) timer = setTimeout(() => commit(null), 25);
  } else if (message.action === 'visits') {
    records = [...message.records.slice().reverse(), ...records].slice(0, 10000);
    revision = message.id;
    dirty = true;
    if (!timer) timer = setTimeout(() => commit(null), 25);
  } else if (message.action === 'clear') {
    commit(message.id, []);
  } else if (message.action === 'remove') {
    commit(message.id, records.filter(record => record.id !== message.value));
  } else if (message.action === 'profile') {
    commit(message.id, records.filter(record => record.profile !== message.value));
  } else if (message.action === 'retention') {
    commit(message.id, records.filter(record => record.visitedAt >= message.value));
  } else if (message.action === 'flush') {
    commit(message.id);
  }
});
`;

/**
 * Ordered history actor: visits are optimistic; deletions commit before
 * display.
 */
export class HistoryPersistence {
  private worker: Worker | undefined;

  private sequence = 0;

  private pendingVisits = new Map<number, HistoryRecord>();

  private waiters = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  private terminal: Error | undefined;

  private error: Error | undefined;

  private notificationError: Error | undefined;

  private records: HistoryRecord[];

  private metrics = { writes: 0, bytes: 0 };

  constructor(
    private file: string,
    initial: HistoryRecord[],
    private changed: () => void = () => {}
  ) {
    this.records = initial;
  }

  private start() {
    if (this.worker) return this.worker;
    this.worker = new Worker(program, {
      eval: true,
      workerData: { file: this.file, records: this.records },
    });
    this.worker.on('message', (message) => {
      if (message.kind === 'failed') {
        this.error = new Error(
          `Could not save browsing history: ${message.error}`
        );
        const waiter = this.waiters.get(message.id);
        this.waiters.delete(message.id);
        waiter?.reject(this.error);
        return;
      }
      this.error = undefined;
      this.metrics = { writes: message.writes, bytes: message.bytes };
      this.pendingVisits.forEach((_record, id) => {
        if (id <= message.revision) this.pendingVisits.delete(id);
      });
      if (message.records) {
        this.records = message.records;
        this.pendingVisits.forEach((record) => {
          this.records = [record, ...this.records].slice(0, 10000);
        });
      }
      const waiter = this.waiters.get(message.id);
      this.waiters.delete(message.id);
      waiter?.resolve();
      try {
        this.changed();
        this.notificationError = undefined;
      } catch (error) {
        // Observer failures cannot roll back an already completed disk commit
        // or strand callers waiting for its acknowledgement.
        this.notificationError =
          error instanceof Error ? error : new Error(String(error));
      }
    });
    this.worker.on('error', (error) => this.fail(error));
    this.worker.on('exit', (code) =>
      this.fail(new Error(`History worker stopped (${code}).`))
    );
    // Idle workers must not keep Electron/test processes alive. Outstanding
    // durable operations explicitly ref the worker until their replies arrive.
    this.worker.unref();
    return this.worker;
  }

  private fail(error: Error) {
    this.terminal ||= error;
    this.waiters.forEach(({ reject }) => reject(error));
    this.waiters.clear();
  }

  snapshot() {
    return this.records.map((record) => ({ ...record }));
  }

  latest() {
    return this.records[0];
  }

  diagnostics() {
    return {
      ...this.metrics,
      pendingVisits: this.pendingVisits.size,
      error: (this.terminal || this.error)?.message,
      notificationError: this.notificationError?.message,
    };
  }

  visit(record: HistoryRecord) {
    if (this.terminal) throw this.terminal;
    const worker = this.start();
    this.sequence += 1;
    const id = this.sequence;
    this.pendingVisits.set(id, record);
    if (this.pendingVisits.size > 10000)
      this.pendingVisits.delete(this.pendingVisits.keys().next().value!);
    this.records = [record, ...this.records].slice(0, 10000);
    worker.postMessage({ id, action: 'visit', record });
  }

  /** Append an oldest-first import with one copy and one worker message. */
  visitMany(records: HistoryRecord[]) {
    if (this.terminal) throw this.terminal;
    if (!records.length) return;
    const worker = this.start();
    records.forEach((record) => {
      this.sequence += 1;
      this.pendingVisits.set(this.sequence, record);
      if (this.pendingVisits.size > 10000)
        this.pendingVisits.delete(this.pendingVisits.keys().next().value!);
    });
    this.records = [...records.slice().reverse(), ...this.records].slice(
      0,
      10000
    );
    worker.postMessage({ id: this.sequence, action: 'visits', records });
  }

  async mutate(
    action: 'clear' | 'remove' | 'profile' | 'flush' | 'retention',
    value?: string | number
  ) {
    if (this.terminal) throw this.terminal;
    if (
      action === 'flush' &&
      !this.pendingVisits.size &&
      !this.waiters.size &&
      !this.error
    )
      return;
    this.sequence += 1;
    const id = this.sequence;
    const worker = this.start();
    worker.ref();
    try {
      await new Promise<void>((resolve, reject) => {
        this.waiters.set(id, { resolve, reject });
        try {
          worker.postMessage({ id, action, value });
        } catch (error) {
          this.waiters.delete(id);
          reject(error);
        }
      });
    } finally {
      if (!this.waiters.size) worker.unref();
    }
  }

  async close() {
    this.fail(new Error('History persistence closed.'));
    await this.worker?.terminate();
  }
}
