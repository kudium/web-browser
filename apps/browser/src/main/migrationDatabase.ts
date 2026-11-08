import { Worker } from 'worker_threads';

type Row = Record<string, any>;
export interface CookieSnapshot {
  rows: Row[];
  total: number;
  hostBound: boolean;
}

// Fixed program works in packaged ASAR without a separate worker entrypoint.
const program = String.raw`
const { parentPort, workerData } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const os = require('os');
const path = require('path');
const suffixes = ['', '-wal', '-journal'];
function signature(file) {
  return suffixes.map(suffix => {
    try {
      const s = fs.statSync(file + suffix, { bigint: true });
      return String(s.size) + ':' + s.mtimeNs + ':' + s.ino;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  });
}
function read(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const query = sql => {
    const statement = db.prepare(sql);
    statement.setReadBigInts(true);
    return statement.all();
  };
  try {
    db.exec('BEGIN');
    if (workerData.kind !== 'cookies') return query(workerData.query);
    const partitioned = query('PRAGMA table_info(cookies)').some(c => c.name === 'top_frame_site_key');
    const total = Number(query('SELECT COUNT(*) AS total FROM cookies')[0].total);
    const rows = query('SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite, has_expires' + (partitioned ? ', top_frame_site_key' : '') + ' FROM cookies ORDER BY host_key, path, name LIMIT 10000');
    const meta = query("SELECT value FROM meta WHERE key='version'");
    return { rows, total, hostBound: Number(meta[0]?.value) >= 24 };
  } finally { db.close(); }
}
function snapshot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-browser-import-'));
  fs.chmodSync(directory, 0o700);
  const file = path.join(directory, 'snapshot');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = signature(workerData.file);
      suffixes.forEach((suffix, index) => {
        fs.rmSync(file + suffix, { force: true });
        if (before[index] !== null) {
          if (fs.statSync(workerData.file + suffix).size > 512 * 1024 * 1024)
            throw new Error('Browser database exceeds the snapshot limit.');
          fs.copyFileSync(workerData.file + suffix, file + suffix);
          fs.chmodSync(file + suffix, 0o600);
        }
      });
      if (JSON.stringify(before) === JSON.stringify(signature(workerData.file))) return read(file);
    }
    throw new Error('Browser data is changing. Close the source browser and try again.');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
try {
  let value;
  if (workerData.kind === 'cookies') value = snapshot();
  else {
    try { value = read(workerData.file); }
    catch (error) {
      if (!/locked|busy/i.test(error.message)) throw error;
      value = snapshot();
    }
  }
  parentPort.postMessage({ value });
} catch (error) { parentPort.postMessage({ error: error.message }); }
`;

function runDatabase<T>(
  file: string,
  kind: string,
  query?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(program, {
      eval: true,
      workerData: { file, kind, query },
    });
    let answered = false;
    worker.once('message', (message) => {
      answered = true;
      if (message.error) reject(new Error(message.error));
      else resolve(message.value);
    });
    worker.once('error', (error) => {
      reject(error);
    });
    worker.once('exit', (code) => {
      if (!answered || code !== 0)
        reject(new Error(`Browser database worker exited (${code}).`));
    });
  });
}

export function readMigrationDatabase(file: string, query: string) {
  return runDatabase<Row[]>(file, 'query', query);
}
export function readCookieSnapshot(file: string) {
  return runDatabase<CookieSnapshot>(file, 'cookies');
}
