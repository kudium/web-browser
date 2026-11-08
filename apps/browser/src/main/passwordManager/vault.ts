import fs from 'fs';
import path from 'path';
import {
  randomBytes,
  randomUUID,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from 'crypto';
import {
  isProtectedField,
  inferredFieldAliases,
} from '../../browser/passwordManager';
import {
  summaryOf,
  effectiveRecords,
  difference,
  safeRecord,
  searchRecords,
} from './records';
import type {
  VaultItem,
  VaultStatus,
  DataOverride,
} from '../../browser/passwordManager';

import type { HookNotificationGrant } from '../../browser/siteDeveloper';

interface Data {
  version?: 2;
  unifiedAccess?: true;
  overrides?: DataOverride[];
  enabled: boolean;
  autofill: boolean;
  ai: boolean;
  items: VaultItem[];
  hookNotifications?: HookNotificationGrant[];
}
type Summary = Pick<VaultStatus, 'items' | 'enabled' | 'autofill' | 'ai'>;
export interface SummaryProtection {
  seal(value: Summary): Summary | { osEncrypted: string };
  open(value: Summary | { osEncrypted: string }): Summary;
}
interface Envelope {
  version: 1 | 2;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
  summary?: Summary | { osEncrypted: string };
}
export function secureOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Use an HTTPS website without embedded credentials.');
  return url.origin;
}
/** Independent encrypted store. No renderer, Electron, or AI dependencies. */
export class PasswordVault {
  private changeListeners = new Set<() => void>();

  onChange(listener: () => void) {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private changed() {
    this.changeListeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* Permission observers cannot interrupt a committed write. */
      }
    });
  }

  private key?: Buffer;

  private data?: Data;

  private salt?: Buffer;

  private expires = 0;

  private failures = 0;

  private retryAt = 0;

  private file: string;

  private now: () => number;

  constructor(
    file: string,
    now?: () => number,
    private summaryProtection?: SummaryProtection,
    private assertScopeWritable: (scope?: string) => void = () => {}
  ) {
    this.file = file;
    this.now = now || Date.now;
  }

  lock() {
    this.key?.fill(0);
    this.key = undefined;
    this.data = undefined;
    this.salt = undefined;
    this.expires = 0;
  }

  private requireData() {
    if (this.now() >= this.expires) this.lock();
    if (!this.data || !this.key)
      throw new Error('Unlock Kudium Browser Personal Data first.');
    return this.data;
  }

  retainUntilLock() {
    this.requireData();
    this.expires = Infinity;
  }

  status(scope?: string): VaultStatus {
    if (this.now() >= this.expires) this.lock();
    let summary: Summary | undefined;
    if (!this.data && fs.existsSync(this.file)) {
      try {
        if (fs.statSync(this.file).size > 128 * 1024 * 1024) throw new Error();
        const saved = JSON.parse(fs.readFileSync(this.file, 'utf8')).summary;
        summary = this.summaryProtection
          ? this.summaryProtection.open(saved)
          : saved;
      } catch {
        summary = undefined;
      }
    }
    const items = this.data
      ? effectiveRecords(this.data.items, this.data.overrides || [], scope).map(
          summaryOf
        )
      : (Array.isArray(summary?.items) ? summary.items : [])
          .filter((item) => !item.scope || item.scope === scope)
          .map((item) => ({
            id: String(item.id).slice(0, 100),
            title: String(item.title).slice(0, 120),
            origin: String(item.origin).slice(0, 4096),
            username: String(item.username).slice(0, 1000),
            kind: (['login', 'profile', 'payment', 'knowledge'].includes(
              item.kind
            )
              ? item.kind
              : 'profile') as VaultItem['kind'],
            allowAI: item.allowAI === true,
            fieldCount: item.fieldCount || 0,
            scope: item.scope,
            inherited: !!scope && !item.scope,
          }));
    return {
      initialized: fs.existsSync(this.file),
      metadataReady: !!this.data || !!summary || !fs.existsSync(this.file),
      locked: !this.data,
      enabled: this.data?.enabled ?? summary?.enabled === true,
      autofill: this.data?.autofill ?? summary?.autofill === true,
      ai: this.data?.ai ?? summary?.ai === true,
      items,
      hidden:
        this.data && scope
          ? (this.data.overrides || [])
              .filter((entry) => entry.scope === scope && entry.hidden)
              .flatMap((entry) =>
                this.data!.items.filter(
                  (item) => item.id === entry.recordId
                ).map(summaryOf)
              )
          : [],
    };
  }

  unlock(password: string, create = false) {
    if (typeof password !== 'string' || password.length > 1024)
      throw new Error('Invalid master password.');
    if (this.now() < this.retryAt)
      throw new Error('Wait before trying to unlock again.');
    this.lock();
    if (create) {
      if (fs.existsSync(this.file)) throw new Error('A vault already exists.');
      if (password.length < 12)
        throw new Error('Use a master password of at least 12 characters.');
      this.salt = randomBytes(32);
      this.key = scryptSync(password, this.salt, 32, {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      });
      this.data = {
        version: 2,
        overrides: [],
        enabled: true,
        autofill: true,
        ai: true,
        unifiedAccess: true,
        items: [],
      };
      this.expires = this.now() + 5 * 60 * 1000;
      try {
        this.persist();
      } catch {
        this.lock();
        throw new Error('Unable to save encrypted vault.');
      }
      return;
    }
    try {
      if (fs.statSync(this.file).size > 128 * 1024 * 1024) throw new Error();
      const saved: Envelope = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (![1, 2].includes(saved.version)) throw new Error();
      const salt = Buffer.from(saved.salt, 'base64');
      if (salt.length !== 32) throw new Error();
      const key = scryptSync(password, salt, 32, {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      });
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(saved.iv, 'base64')
        );
        decipher.setAuthTag(Buffer.from(saved.tag, 'base64'));
        const plain = Buffer.concat([
          decipher.update(Buffer.from(saved.ciphertext, 'base64')),
          decipher.final(),
        ]);
        try {
          this.data = JSON.parse(plain.toString('utf8'));
        } finally {
          plain.fill(0);
        }
        this.key = key;
        this.salt = salt;
      } catch (error) {
        key.fill(0);
        throw error;
      }
      this.expires = this.now() + 5 * 60 * 1000;
      this.failures = 0;
      if (!this.data?.unifiedAccess) {
        this.data!.items = this.data!.items.map((item) => ({
          ...item,
          allowAI: item.allowAI === true,
        }));
        this.data!.overrides = (this.data!.overrides || []).map((entry) => ({
          ...entry,
          patch: {
            ...entry.patch,
            ...(entry.patch.allowAI === undefined
              ? {}
              : { allowAI: entry.patch.allowAI === true }),
          },
        }));
        this.data!.unifiedAccess = true;
        if (this.data!.version === 2) this.persist();
      }
      if (this.data?.version !== 2) {
        const backup = `${this.file}.v1-backup`;
        if (!fs.existsSync(backup))
          fs.copyFileSync(this.file, backup, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(backup, 0o600);
        this.data!.version = 2;
        this.data!.overrides = [];
        this.data!.items = this.data!.items.map((item) => ({
          ...item,
          version: 2,
        }));
        this.persist();
      }
    } catch {
      this.lock();
      this.failures += 1;
      this.retryAt =
        this.now() + Math.min(30000, 1000 * 2 ** Math.min(this.failures, 5));
      throw new Error('Unable to unlock vault. Check your master password.');
    }
  }

  private persist() {
    const data = this.requireData();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key!, iv);
    const plain = Buffer.from(JSON.stringify(data));
    if (plain.length > 90 * 1024 * 1024) {
      plain.fill(0);
      throw new Error(
        'Personal Data storage is full. Remove unused documents.'
      );
    }
    let ciphertext: Buffer;
    try {
      ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    } finally {
      plain.fill(0);
    }
    const envelope: Envelope = {
      version: 2,
      salt: this.salt!.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      summary: {
        items: data.items.map(summaryOf),
        enabled: data.enabled,
        autofill: data.autofill,
        ai: data.ai,
      },
    };
    if (envelope.summary && this.summaryProtection)
      envelope.summary = this.summaryProtection.seal(
        envelope.summary as Summary
      );
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(envelope), {
        mode: 0o600,
        flag: 'wx',
      });
      fs.renameSync(temporary, this.file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  settings(enabled: boolean, autofill: boolean, ai: boolean) {
    const data = this.requireData();
    const previous = { ...data };
    Object.assign(data, {
      enabled: enabled === true,
      autofill: autofill === true,
      ai: ai === true,
    });
    try {
      this.persist();
    } catch (error) {
      this.data = previous;
      throw error;
    }
    this.changed();
  }

  save(input: VaultItem, scope?: string) {
    this.assertScopeWritable(scope);
    const data = this.requireData();
    const bounded = (value: unknown, limit: number) => {
      if (typeof value !== 'string' || value.length > limit)
        throw new Error('Invalid field value.');
      return value;
    };
    if (
      !input ||
      !['login', 'profile', 'payment', 'knowledge'].includes(input.kind) ||
      !Array.isArray(input.fields) ||
      input.fields.length > 30 ||
      (data.items.length >= 1000 &&
        !data.items.some((item) => item.id === input.id))
    )
      throw new Error('Invalid vault item.');
    const item: VaultItem = {
      id: bounded(input.id, 100) || randomUUID(),
      title: bounded(input.title, 120),
      origin: input.origin ? secureOrigin(input.origin) : '',
      version: 2,
      scope,
      notes: bounded(input.notes || '', 100000),
      source: input.source
        ? {
            label: bounded(input.source.label, 200),
            url: input.source.url ? bounded(input.source.url, 4096) : undefined,
            capturedAt: bounded(input.source.capturedAt, 100),
          }
        : undefined,
      document: input.document
        ? {
            name: bounded(input.document.name, 200),
            mime: bounded(input.document.mime, 100),
            content: bounded(input.document.content, 28 * 1024 * 1024),
            text: bounded(input.document.text, 2000000),
          }
        : undefined,
      kind: input.kind,
      username: bounded(input.username, 1000),
      password: bounded(input.password, 4096),
      allowAI: input.allowAI === true,
      fields: input.fields.map((field) => ({
        name: bounded(field.name, 120),
        value: bounded(field.value, 4096),
        secret: isProtectedField(field) || input.kind === 'payment',
        aliases: Array.from(
          new Set([
            ...(field.aliases || [])
              .slice(0, 10)
              .map((alias) => bounded(alias, 120)),
            ...inferredFieldAliases(field.name),
          ])
        ),
      })),
    };
    if (
      !item.title.trim() ||
      item.fields.some((field) => !field.name.trim()) ||
      new Set(item.fields.map((field) => field.name)).size !==
        item.fields.length
    )
      throw new Error('Provide a title and unique field names.');
    const base = data.items.find((existing) => existing.id === item.id);
    if (base?.scope && base.scope !== scope)
      throw new Error('Record outside this group.');
    if (base && scope && !base.scope) {
      this.mutate(() => {
        data.overrides = [
          ...(data.overrides || []).filter(
            (entry) => !(entry.scope === scope && entry.recordId === base.id)
          ),
          difference(base, item, scope),
        ];
      });
    } else {
      this.mutate(() => {
        data.items = [
          ...data.items.filter((existing) => existing.id !== item.id),
          item,
        ];
      });
    }
    return item.id;
  }

  /** AI updates are partial and cannot erase or replace protected fields. */
  saveMemory(
    input: Partial<VaultItem>,
    scope?: string,
    source?: VaultItem['source']
  ) {
    this.checkAccess(true);
    if (
      !input ||
      !['profile', 'knowledge'].includes(String(input.kind)) ||
      !Array.isArray(input.fields)
    )
      throw new Error('Only basic facts and knowledge can be saved by AI.');
    const base = input.id
      ? this.records(scope).find(
          (item) =>
            item.id === input.id &&
            item.allowAI &&
            ['profile', 'knowledge'].includes(item.kind)
        )
      : undefined;
    if (input.id && !base)
      throw new Error('Record unavailable or AI access disabled.');
    if (
      input.fields.some(
        (field) =>
          !field ||
          typeof field.name !== 'string' ||
          /password|passwd|token|otp|cvc|cvv|cc-|card|security.?code/i.test(
            [field.name, ...(field.aliases || [])].join(' ')
          ) ||
          base?.fields.some(
            (entry) => entry.name === field.name && isProtectedField(entry)
          )
      )
    )
      throw new Error('Protected fields must be edited in Personal Data.');
    const fields = [...(base?.fields || [])];
    input.fields.forEach((field) => {
      const index = fields.findIndex((entry) => entry.name === field.name);
      if (index < 0) fields.push(field);
      else fields[index] = field;
    });
    return this.save(
      {
        ...(base || {}),
        id: input.id || '',
        title: input.title || base?.title || '',
        kind: input.kind!,
        origin: base?.origin || '',
        username: base?.username || '',
        password: base?.password || '',
        fields,
        notes: input.notes ?? base?.notes ?? '',
        allowAI: base?.allowAI === true,
        source: source || base?.source,
      },
      scope
    );
  }

  private mutate(change: () => void) {
    const previous = JSON.parse(JSON.stringify(this.requireData())) as Data;
    try {
      change();
      this.persist();
    } catch (error) {
      this.data = previous;
      throw error;
    }
    this.changed();
  }

  records(scope?: string) {
    return effectiveRecords(
      this.requireData().items,
      this.requireData().overrides || [],
      scope
    );
  }

  hookNotifications(scope?: string, origin?: string) {
    this.checkAccess(true);
    return (this.requireData().hookNotifications || [])
      .filter(
        (grant) => grant.scope === scope && (!origin || grant.origin === origin)
      )
      .map((grant) => ({ ...grant }));
  }

  saveHookNotification(grant: HookNotificationGrant) {
    this.checkAccess(true);
    this.mutate(() => {
      const data = this.requireData();
      const previous = (data.hookNotifications || []).filter(
        (item) =>
          item.id !== grant.id &&
          !(
            item.groupId === grant.groupId &&
            item.origin === grant.origin &&
            item.key === grant.key
          )
      );
      if (previous.length >= 100)
        throw new Error('Remove an unused notification permission first.');
      data.hookNotifications = [...previous, { ...grant }];
    });
  }

  revokeHookNotification(id: string, groupId: string, scope?: string) {
    this.mutate(() => {
      const data = this.requireData();
      data.hookNotifications = (data.hookNotifications || []).filter(
        (grant) =>
          !(
            grant.id === id &&
            grant.groupId === groupId &&
            grant.scope === scope
          )
      );
    });
  }

  hide(id: string, scope: string) {
    this.assertScopeWritable(scope);
    const data = this.requireData();
    if (!data.items.some((item) => item.id === id && !item.scope))
      throw new Error('Only inherited records can be hidden.');
    this.mutate(() => {
      data.overrides = [
        ...(data.overrides || []).filter(
          (entry) => !(entry.scope === scope && entry.recordId === id)
        ),
        { scope, recordId: id, hidden: true, patch: {} },
      ];
    });
  }

  reset(id: string, scope: string) {
    this.assertScopeWritable(scope);
    const data = this.requireData();
    this.mutate(() => {
      data.overrides = (data.overrides || []).filter(
        (entry) => !(entry.scope === scope && entry.recordId === id)
      );
    });
  }

  removeScope(scope: string, disposition: 'delete' | 'move') {
    const data = this.requireData();
    this.mutate(() => {
      data.hookNotifications = (data.hookNotifications || []).filter(
        (grant) => grant.scope !== scope
      );
      data.items = data.items.flatMap((item) => {
        if (item.scope !== scope) return [item];
        if (disposition === 'move') return [{ ...item, scope: undefined }];
        return [];
      });
      // Materialize customized inherited records only when the user elects to keep local data.
      if (disposition === 'move')
        effectiveRecords(data.items, data.overrides || [], scope)
          .filter((item) => item.overridden)
          .forEach((item) => {
            data.items.push({
              ...item,
              id: randomUUID(),
              scope: undefined,
              inherited: undefined,
              overridden: undefined,
              title: `${item.title} (from group)`,
            });
          });
      data.overrides = (data.overrides || []).filter(
        (entry) => entry.scope !== scope
      );
    });
  }

  search(query: string, scope?: string, origin?: string) {
    this.checkAccess(true);
    const site = origin ? new URL(origin).origin : undefined;
    return searchRecords(
      this.records(scope).filter(
        (item) => !site || !item.origin || item.origin === site
      ),
      query
    );
  }

  readSafe(
    id: string,
    scope?: string,
    offset = 0,
    origin: string | undefined = undefined
  ) {
    this.checkAccess(true);
    const item = this.records(scope).find(
      (entry) =>
        entry.id === id &&
        entry.allowAI &&
        (!origin || !entry.origin || entry.origin === new URL(origin).origin)
    );
    if (!item) throw new Error('Record unavailable or AI access disabled.');
    const safe = safeRecord(item);
    const text = safe.document?.text || safe.notes;
    const start = Number.isInteger(offset) && offset >= 0 ? offset : 0;
    const result = {
      ...safe,
      origin: safe.origin.slice(0, 512),
      fields: safe.fields
        .slice(0, 30)
        .map((field) => ({ ...field, value: field.value.slice(0, 500) })),
      notes: safe.document ? '' : text.slice(start, start + 2000),
      document: safe.document
        ? { name: safe.document.name, text: text.slice(start, start + 2000) }
        : undefined,
      nextOffset: text.length > start + 2000 ? start + 2000 : null,
    };
    while (JSON.stringify(result).length > 4000 && result.fields.length)
      result.fields.pop();
    return result;
  }

  private checkAccess(ai: boolean) {
    const data = this.requireData();
    if (!data.enabled || (ai && !data.ai) || (!ai && !data.autofill))
      throw new Error('Personal Data access is disabled.');
  }

  refreshSummary() {
    this.persist();
  }

  edit(id: string, scope?: string) {
    const item = this.records(scope).find((saved) => saved.id === id);
    if (!item) throw new Error('Saved item unavailable.');
    return JSON.parse(JSON.stringify(item)) as VaultItem;
  }

  changePassword(password: string) {
    this.requireData();
    if (
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 1024
    )
      throw new Error('Use a master password of at least 12 characters.');
    const oldKey = this.key!;
    const oldSalt = this.salt!;
    this.salt = randomBytes(32);
    this.key = scryptSync(password, this.salt, 32, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    try {
      this.persist();
      oldKey.fill(0);
    } catch {
      this.key.fill(0);
      this.key = oldKey;
      this.salt = oldSalt;
      throw new Error('Unable to update master password.');
    }
  }

  delete(id: string, scope?: string) {
    const data = this.requireData();
    const item = data.items.find((entry) => entry.id === id);
    if (item?.scope !== scope)
      throw new Error('Only records belonging to this scope can be deleted.');
    this.mutate(() => {
      data.hookNotifications = (data.hookNotifications || []).filter(
        (grant) => grant.recordId !== id
      );
      data.items = data.items.filter((entry) => entry.id !== id);
      data.overrides = (data.overrides || []).filter(
        (entry) => entry.recordId !== id
      );
    });
  }

  matching(origin: string, ai = false, scope: string | undefined = undefined) {
    this.checkAccess(ai);
    const target = secureOrigin(origin);
    return this.records(scope)
      .filter(
        (item) =>
          (item.origin === target || !item.origin) && (!ai || item.allowAI)
      )
      .map(summaryOf);
  }

  forFill(
    id: string,
    origin: string,
    ai = false,
    scope: string | undefined = undefined
  ): VaultItem {
    if (!this.matching(origin, ai, scope).some((item) => item.id === id))
      throw new Error('This account is not authorized for this website.');
    return {
      ...this.records(scope).find((item) => item.id === id)!,
      origin: secureOrigin(origin),
    };
  }
}
