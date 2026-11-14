/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { PasswordVault } from '../main/passwordManager/vault';
import { saveWebsiteFields } from '../main/passwordManager/websiteFields';
import { hasSavedWebsiteLogin } from '../main/passwordManager/websiteLogin';
import {
  entryForEditor,
  entryForSave,
  VaultItem,
} from '../browser/passwordManager';

const password = 'disposable consent test credential';
let root: string;
let filename: string;
let vault: PasswordVault;
const record: VaultItem = {
  id: 'record',
  title: 'Private profile',
  kind: 'profile',
  origin: '',
  username: '',
  password: '',
  notes: 'confidential test fact',
  fields: [{ name: 'email', value: 'fixture@example.test', secret: false }],
  allowAI: false,
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-consent-'));
  filename = path.join(root, 'vault.json');
  vault = new PasswordVault(filename);
  vault.unlock(password, true);
});
afterEach(() => {
  vault.lock();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(['login', 'profile', 'payment', 'knowledge'] as const)(
  'preserves explicit false and true through %s editor/save/restart',
  (kind) => {
    const input = { ...record, kind };
    expect(entryForSave(entryForEditor(input)).allowAI).toBe(false);
    vault.save(entryForSave(entryForEditor(input)));
    expect(vault.edit(record.id).allowAI).toBe(false);
    expect(vault.search('confidential')).toEqual([]);
    expect(() => vault.readSafe(record.id)).toThrow('AI access disabled');
    expect(() =>
      vault.forFill(record.id, 'https://fixture.example', true)
    ).toThrow();
    vault.save({ ...vault.edit(record.id), allowAI: true });
    vault.lock();
    vault.unlock(password);
    expect(vault.edit(record.id).allowAI).toBe(true);
    vault.save({ ...vault.edit(record.id), allowAI: false });
    vault.lock();
    vault.unlock(password);
    expect(vault.edit(record.id).allowAI).toBe(false);
  }
);

it('defaults missing consent and new AI-saved memories to off', () => {
  const { allowAI, ...missing } = record;
  vault.save(missing as VaultItem);
  expect(vault.edit(record.id).allowAI).toBe(false);
  vault.saveMemory({
    kind: 'knowledge',
    title: 'Saved fact',
    fields: [],
    notes: 'new fact',
  });
  expect(vault.records().find((item) => item.id !== record.id)?.allowAI).toBe(
    false
  );
});

it('preserves group overrides and their inheritance across restart', () => {
  vault.save({ ...record, allowAI: true });
  vault.save({ ...vault.edit(record.id, 'group'), allowAI: false }, 'group');
  vault.lock();
  vault.unlock(password);
  expect(vault.edit(record.id).allowAI).toBe(true);
  expect(vault.edit(record.id, 'group').allowAI).toBe(false);
  expect(vault.search('confidential', 'group')).toEqual([]);
  vault.reset(record.id, 'group');
  expect(vault.edit(record.id, 'group').allowAI).toBe(true);
});

it('does not enable missing/false legacy record, override or global consent', () => {
  vault.save({ ...record, allowAI: true });
  vault.lock();
  const envelope = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const key = scryptSync(password, Buffer.from(envelope.salt, 'base64'), 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const legacy = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  );
  delete legacy.unifiedAccess;
  legacy.ai = false;
  legacy.items[0].allowAI = false;
  legacy.items.push({ ...legacy.items[0], id: 'missing' });
  delete legacy.items[1].allowAI;
  legacy.overrides = [
    { scope: 'group', recordId: record.id, patch: { allowAI: false } },
  ];
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  envelope.iv = iv.toString('base64');
  envelope.ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(legacy)),
    cipher.final(),
  ]).toString('base64');
  envelope.tag = cipher.getAuthTag().toString('base64');
  key.fill(0);
  fs.writeFileSync(filename, JSON.stringify(envelope));
  vault.unlock(password);
  expect(vault.edit(record.id).allowAI).toBe(false);
  expect(vault.edit('missing').allowAI).toBe(false);
  expect(vault.edit(record.id, 'group').allowAI).toBe(false);
  expect(vault.status().ai).toBe(false);
});


it.each(['login', 'knowledge'] as const)('recognizes saved %s credentials only for the matching website, values and group', (kind) => {
  vault.save({ ...record, kind, origin: 'https://fixture.example', username: kind === 'login' ? 'sam@example.test' : '', password: kind === 'login' ? 'saved-secret' : '', fields: kind === 'login' ? [] : [
    { name: 'Email address', aliases: ['email'], value: 'sam@example.test', secret: false },
    { name: 'Account secret', aliases: ['current-password'], value: 'saved-secret', secret: true },
  ] });
  const check = (url = 'https://fixture.example/account', scope?: string, user = 'sam@example.test', secret = 'saved-secret') => hasSavedWebsiteLogin(vault, url, scope, user, secret);
  expect(check()).toBe(true);
  expect(check('https://other.example')).toBe(false);
  expect(check(undefined, undefined, 'another@example.test')).toBe(false);
  expect(check(undefined, undefined, undefined, 'changed-secret')).toBe(false);
  vault.save({ ...vault.edit(record.id), username: 'group-user', password: 'group-secret', fields: [] }, 'group');
  expect(check(undefined, 'group')).toBe(false);
  expect(check()).toBe(true);
});

it('does not combine credentials from separate records or treat a general profile as a website login', () => {
  vault.save({ ...record, fields: [{ name: 'Username', value: 'sam', secret: false }, { name: 'Password', value: 'secret', secret: true }] });
  expect(hasSavedWebsiteLogin(vault, 'https://fixture.example', undefined, 'sam', 'secret')).toBe(false);
  vault.save({ ...record, origin: 'https://fixture.example', fields: [{ name: 'Username', value: 'sam', secret: false }] });
  vault.save({ ...record, id: 'other', origin: 'https://fixture.example', fields: [{ name: 'Password', value: 'secret', secret: true }] });
  expect(hasSavedWebsiteLogin(vault, 'https://fixture.example', undefined, 'sam', 'secret')).toBe(false);
});


it('saves separate website accounts and updates only the matching identity after confirmation', () => {
  const url = 'https://fixture.example/login';
  const fields = (user: string, secret: string) => [
    { name: 'Username', value: user, secret: false, aliases: ['email'] },
    { name: 'Password', value: secret, secret: true },
  ];
  expect(saveWebsiteFields(vault, url, undefined, fields('first', 'first-secret')).saved).toBe(true);
  expect(saveWebsiteFields(vault, url, undefined, fields('second', 'second-secret')).saved).toBe(true);
  expect(vault.matching(url)).toHaveLength(2);
  expect(hasSavedWebsiteLogin(vault, url, undefined, 'first', 'first-secret')).toBe(true);
  expect(hasSavedWebsiteLogin(vault, url, undefined, 'second', 'second-secret')).toBe(true);
  expect(saveWebsiteFields(vault, url, undefined, fields('second', 'changed'))).toEqual({ needsUpdate: true, saved: false });
  expect(hasSavedWebsiteLogin(vault, url, undefined, 'second', 'second-secret')).toBe(true);
  expect(saveWebsiteFields(vault, url, undefined, fields('second', 'changed'), true)).toEqual({ saved: true, updated: true });
  expect(hasSavedWebsiteLogin(vault, url, undefined, 'first', 'first-secret')).toBe(true);
  expect(hasSavedWebsiteLogin(vault, url, undefined, 'second', 'changed')).toBe(true);
  expect(vault.matching(url)).toHaveLength(2);
});


it('updates a legacy saved login without creating another record or silently replacing its password', () => {
  const url = 'https://fixture.example';
  vault.save({ ...record, kind: 'login', origin: url, username: 'sam', password: 'old', fields: [] });
  const incoming = [{ name: 'Username', value: 'sam', secret: false }, { name: 'Password', value: 'new', secret: true }];
  expect(saveWebsiteFields(vault, url, undefined, incoming)).toEqual({ needsUpdate: true, saved: false });
  expect(vault.edit(record.id).password).toBe('old');
  saveWebsiteFields(vault, url, undefined, incoming, true);
  expect(vault.edit(record.id).password).toBe('new');
  expect(vault.matching(url)).toHaveLength(1);
});
