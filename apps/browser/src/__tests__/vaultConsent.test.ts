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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-consent-'));
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
