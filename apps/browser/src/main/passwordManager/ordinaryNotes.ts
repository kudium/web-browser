import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { VaultItem, VaultSummary } from '../../browser/passwordManager';
import { normalizeNote } from '../../browser/notes';
import { safeStorage } from '../localStorage';
import { summaryOf } from './records';

export interface OrdinaryNotesStorage {
  load(): VaultItem[];
  save(notes: VaultItem[]): void;
  summaries?(): VaultSummary[];
  get?(id: string): VaultItem | undefined;
  upsert?(note: VaultItem): void;
  remove?(id: string): void;
}
interface Entry {
  summary: VaultSummary;
  file: string;
}
/** Title-only index and immutable encrypted note files keep autosave bounded. */
export function ordinaryNotesStorage(file: string): OrdinaryNotesStorage {
  const directory = `${file}.data`;
  let index: Entry[] | undefined;
  const content = new Map<string, VaultItem>();
  const check = () => {
    if (
      !safeStorage.isEncryptionAvailable() ||
      safeStorage.getSelectedStorageBackend() === 'basic_text'
    )
      throw new Error(
        'Secure note storage is unavailable. Restart the browser to restore it.'
      );
  };
  const readIndex = () => {
    check();
    if (!index) {
      if (!fs.existsSync(file)) index = [];
      else {
        if (fs.statSync(file).size > 128 * 1024 * 1024)
          throw new Error('Notes storage is too large.');
        const manifest = JSON.parse(
          safeStorage.decryptString(fs.readFileSync(file))
        );
        if (
          manifest.version !== 1 ||
          !Array.isArray(manifest.entries) ||
          manifest.entries.length > 1000
        )
          throw new Error('Invalid notes index.');
        const ids = new Set<string>();
        index = manifest.entries.map((entry: Entry) => {
          if (
            !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.summary?.id) ||
            ids.has(entry.summary.id) ||
            !/^[a-f0-9-]{36}\.bin$/.test(entry.file) ||
            typeof entry.summary.title !== 'string' ||
            entry.summary.title.length > 120 ||
            entry.summary.kind !== 'note' ||
            entry.summary.sensitive
          )
            throw new Error('Invalid note metadata.');
          ids.add(entry.summary.id);
          return entry;
        });
      }
    }
    return index!;
  };
  const get = (id: string) => {
    const entry = readIndex().find((item) => item.summary.id === id);
    if (!entry) return undefined;
    if (!content.has(id)) {
      const source = path.join(directory, entry.file);
      if (fs.statSync(source).size > 1024 * 1024)
        throw new Error('Note is too large.');
      const value = JSON.parse(
        safeStorage.decryptString(fs.readFileSync(source))
      );
      const note = normalizeNote(value, value.scope);
      if (note.id !== id || note.sensitive)
        throw new Error('Note metadata mismatch.');
      content.set(id, note);
    }
    return content.get(id);
  };
  const commit = (values: VaultItem[], retainOthers: boolean) => {
    const previous = readIndex();
    if (new Set(values.map((note) => note.id)).size !== values.length)
      throw new Error('Duplicate notes.');
    const selected = new Set(values.map((note) => note.id));
    const next = retainOthers
      ? previous.filter((entry) => !selected.has(entry.summary.id))
      : [];
    if (next.length + values.length > 1000)
      throw new Error('Notes storage is full.');
    const created: string[] = [];
    const temporary = `${file}.${randomUUID()}.tmp`;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      values.forEach((input) => {
        const note = normalizeNote(input, input.scope);
        if (note.sensitive)
          throw new Error('Locked notes must use the protected vault.');
        const existing = previous.find((entry) => entry.summary.id === note.id);
        const old = content.get(note.id);
        if (
          existing &&
          old &&
          old.title === note.title &&
          old.notes === note.notes &&
          old.scope === note.scope &&
          old.allowAI === note.allowAI
        )
          next.push(existing);
        else {
          const name = `${randomUUID()}.bin`;
          const target = path.join(directory, name);
          fs.writeFileSync(
            target,
            safeStorage.encryptString(JSON.stringify(note)),
            { mode: 0o600, flag: 'wx' }
          );
          created.push(target);
          next.push({ summary: summaryOf(note), file: name });
        }
      });
      fs.writeFileSync(
        temporary,
        safeStorage.encryptString(
          JSON.stringify({ version: 1, entries: next })
        ),
        { mode: 0o600, flag: 'wx' }
      );
      fs.renameSync(temporary, file);
    } catch (error) {
      created.forEach((target) => {
        if (fs.existsSync(target)) fs.unlinkSync(target);
      });
      throw error;
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    index = next;
    values.forEach((note) =>
      content.set(note.id, normalizeNote(note, note.scope))
    );
    const retained = new Set(next.map((entry) => entry.file));
    previous.forEach((entry) => {
      if (!retained.has(entry.file)) {
        try {
          fs.unlinkSync(path.join(directory, entry.file));
        } catch {
          /* Old encrypted versions are inaccessible once the index commits. */
        }
      }
      if (!next.some((item) => item.summary.id === entry.summary.id))
        content.delete(entry.summary.id);
    });
  };
  return {
    summaries: () => readIndex().map((entry) => ({ ...entry.summary })),
    get,
    load: () => readIndex().map((entry) => get(entry.summary.id)!),
    save: (notes) => commit(notes, false),
    upsert: (note) => commit([note], true),
    remove: (id) => {
      const existing = readIndex();
      const next = existing.filter((entry) => entry.summary.id !== id);
      if (next.length === existing.length) return;
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(
          temporary,
          safeStorage.encryptString(
            JSON.stringify({ version: 1, entries: next })
          ),
          { mode: 0o600, flag: 'wx' }
        );
        fs.renameSync(temporary, file);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
      index = next;
      content.delete(id);
      const removed = existing.find((entry) => entry.summary.id === id)!;
      try {
        fs.unlinkSync(path.join(directory, removed.file));
      } catch {
        /* The removed note is no longer reachable through its index. */
      }
    },
  };
}
