import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { IApp } from '../types';
import { groupKey, loginProfileKey } from '../utils/groups';
import { writePrivateFile } from './privateFile';

export interface RemovalIntent {
  group: string;
  space: string;
  ids: string[];
  profiles: string[];
  scope?: string;
}
export interface RemovalOperation extends RemovalIntent {
  id: string;
  next: number;
}
export const removalSteps = (intent: RemovalIntent) => [
  ...(intent.scope ? [{ kind: 'scope', target: intent.scope }] : []),
  ...intent.profiles.flatMap((target) =>
    ['storage', 'cache', 'auth', 'connections', 'history', 'settings'].map(
      (kind) => ({ kind, target })
    )
  ),
];
const sameIntent = (a: RemovalIntent, b: RemovalIntent) =>
  JSON.stringify([a.group, a.space, a.ids, a.profiles, a.scope]) ===
  JSON.stringify([b.group, b.space, b.ids, b.profiles, b.scope]);
const MAX_BYTES = 16 * 1024 * 1024;
const text = (value: unknown): value is string =>
  typeof value === 'string' && !!value && value.length <= 1024;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 10000 &&
  value.every(text) &&
  new Set(value).size === value.length;

/** Approved cleanup progresses independently of a renderer's invoke response. */
export class GroupRemovalJournal {
  private operations: RemovalOperation[] = [];

  private removedIds = new Set<string>();

  private pendingIds = new Set<string>();

  private pendingGroups = new Set<string>();

  private pendingProfiles = new Set<string>();

  private pendingScopes = new Set<string>();

  private index() {
    this.removedIds.clear();
    this.pendingIds.clear();
    this.pendingGroups.clear();
    this.pendingProfiles.clear();
    this.pendingScopes.clear();
    this.operations.forEach((entry) => {
      if (entry.next === removalSteps(entry).length)
        entry.ids.forEach((id) => this.removedIds.add(id));
      else {
        entry.ids.forEach((id) => this.pendingIds.add(id));
        this.pendingGroups.add(JSON.stringify([entry.group, entry.space]));
        entry.profiles.forEach((profile) => this.pendingProfiles.add(profile));
        if (entry.scope) this.pendingScopes.add(entry.scope);
      }
    });
  }

  constructor(private filename: string) {
    if (!fs.existsSync(filename)) return;
    const descriptor = fs.openSync(filename, 'r');
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.size > MAX_BYTES)
        throw new Error('Group removal recovery data is invalid.');
      const bytes = Buffer.alloc(stat.size + 1);
      let count = 0;
      while (count < bytes.length) {
        const size = fs.readSync(
          descriptor,
          bytes,
          count,
          bytes.length - count,
          null
        );
        if (!size) break;
        count += size;
      }
      if (count !== stat.size)
        throw new Error('Group removal recovery data changed while reading.');
      const data = JSON.parse(bytes.subarray(0, count).toString('utf8'));
      if (
        data.version !== 1 ||
        !Array.isArray(data.operations) ||
        data.operations.length > 10000 ||
        !data.operations.every(
          (entry: RemovalOperation) =>
            entry &&
            text(entry.id) &&
            text(entry.group) &&
            text(entry.space) &&
            strings(entry.ids) &&
            strings(entry.profiles) &&
            (entry.scope === undefined ||
              entry.scope === `group:${entry.group}`) &&
            Number.isInteger(entry.next) &&
            entry.next >= 0 &&
            entry.next <= removalSteps(entry).length
        )
      )
        throw new Error('Group removal recovery data is invalid.');
      this.operations = data.operations;
      this.index();
    } finally {
      fs.closeSync(descriptor);
    }
  }

  private save(operations: RemovalOperation[]) {
    const bytes = JSON.stringify({ version: 1, operations });
    if (Buffer.byteLength(bytes) > MAX_BYTES)
      throw new Error('Group removal recovery data is full.');
    writePrivateFile(this.filename, bytes);
    const directory = fs.openSync(path.dirname(this.filename), 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
    this.operations = operations;
    this.index();
  }

  begin(intent: RemovalIntent) {
    if (
      this.operations.some(
        (entry) =>
          entry.next < removalSteps(entry).length &&
          (entry.group !== intent.group || entry.space !== intent.space)
      )
    )
      throw new Error(
        'Finish the pending group cleanup before removing another group.'
      );
    const previous = this.operations.find(
      (entry) =>
        entry.group === intent.group &&
        entry.space === intent.space &&
        entry.next < removalSteps(entry).length
    );
    if (previous) {
      if (!sameIntent(previous, intent))
        throw new Error(
          'This group changed since cleanup began. Its remaining data was kept.'
        );
      return previous;
    }
    const operation = { ...intent, id: randomUUID(), next: 0 };
    this.save([...this.operations, operation]);
    return operation;
  }

  advance(operation: RemovalOperation) {
    const next = { ...operation, next: operation.next + 1 };
    this.save(
      this.operations.map((entry) => (entry.id === operation.id ? next : entry))
    );
    return next;
  }

  hasRestrictions() {
    return !!(this.removedIds.size || this.pendingGroups.size);
  }

  removed(id: string) {
    return this.removedIds.has(id);
  }

  blocks(item: IApp) {
    if (!this.hasRestrictions()) return false;
    return (
      this.removedIds.has(item.id) ||
      this.pendingIds.has(item.id) ||
      this.pendingGroups.has(
        JSON.stringify([groupKey(item), item.spaceId || 'default'])
      ) ||
      this.pendingProfiles.has(loginProfileKey(item))
    );
  }

  blocksScope(scope?: string) {
    return !!scope && this.pendingScopes.has(scope);
  }
}

let active: GroupRemovalJournal | undefined;
let activeFilename: string | undefined;

export function activateGroupRemovalJournal(filename: string) {
  if (active && activeFilename === filename) return active;
  active = new GroupRemovalJournal(filename);
  activeFilename = filename;
  return active;
}
export function assertRemovalScopeWritable(scope?: string) {
  if (active?.blocksScope(scope))
    throw new Error(
      'This group is being removed. Retry cleanup before saving data to it.'
    );
}
