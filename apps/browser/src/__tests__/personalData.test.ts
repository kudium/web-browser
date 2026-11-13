/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createCipheriv,
  createDecipheriv,
  scryptSync,
  randomBytes,
} from 'crypto';
import { difference } from '../main/passwordManager/records';
import { PasswordVault } from '../main/passwordManager/vault';
import type { VaultItem } from '../browser/passwordManager';
import { personalDataScope } from '../utils/groups';
import { importDocument } from '../main/passwordManager/documents';

const credential = 'long test encryption credential';
const profile: VaultItem = {
  id: 'profile',
  title: 'Job profile',
  kind: 'profile',
  origin: '',
  username: '',
  password: '',
  allowAI: true,
  fields: [
    { name: 'email', value: 'global@example.com', secret: false },
    { name: 'organization', value: 'Global Company', secret: false },
  ],
  notes: 'Frontend engineer',
};
let directory: string;
let vault: PasswordVault;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-data-'));
  vault = new PasswordVault(path.join(directory, 'vault.json'));
  vault.unlock(credential, true);
  vault.settings(true, true, true);
});
afterEach(() => {
  vault.lock();
  fs.rmSync(directory, { recursive: true, force: true });
});

it('inherits global records, persists only changed fields, and isolates groups', () => {
  vault.save(profile);
  vault.save(
    {
      ...vault.edit(profile.id, 'group:a'),
      fields: [
        { ...profile.fields[0], value: 'local@example.com' },
        profile.fields[1],
      ],
    },
    'group:a'
  );
  expect(vault.edit(profile.id, 'group:a').fields[0].value).toBe(
    'local@example.com'
  );
  expect(vault.edit(profile.id, 'group:b').fields[0].value).toBe(
    'global@example.com'
  );
  vault.save({
    ...profile,
    fields: [
      profile.fields[0],
      { ...profile.fields[1], value: 'Updated Company' },
    ],
  });
  expect(vault.edit(profile.id, 'group:a').fields[1].value).toBe(
    'Updated Company'
  );
  expect(vault.status('group:a').items[0].overridden).toBe(true);
  vault.hide(profile.id, 'group:b');
  expect(vault.search('email', 'group:b')).toEqual([]);
  expect(vault.status('group:b').hidden).toHaveLength(1);
  vault.reset(profile.id, 'group:b');
  expect(vault.search('email', 'group:b')).toHaveLength(1);
  vault.reset(profile.id, 'group:a');
  expect(vault.edit(profile.id, 'group:a').fields[0].value).toBe(
    'global@example.com'
  );
});
it('cannot read, fill, overwrite or delete another group’s record', () => {
  vault.save({ ...profile, id: 'local' }, 'group:a');
  expect(() => vault.edit('local', 'group:b')).toThrow();
  expect(() => vault.readSafe('local', 'group:b')).toThrow();
  expect(() =>
    vault.forFill('local', 'https://example.com', true, 'group:b')
  ).toThrow();
  expect(() => vault.save({ ...profile, id: 'local' }, 'group:b')).toThrow();
  expect(() => vault.delete('local', 'group:b')).toThrow();
});
it('moves local data only on explicit disposition and keeps global originals', () => {
  vault.save(profile);
  vault.save({ ...profile, id: 'local' }, 'group:a');
  vault.removeScope('group:a', 'move');
  expect(vault.status().items).toHaveLength(2);
  vault.save({ ...profile, id: 'discard' }, 'group:b');
  vault.removeScope('group:b', 'delete');
  expect(vault.status().items).toHaveLength(2);
});
it('protects secrets before search, bounds results, and rechecks disabled access', () => {
  for (let index = 0; index < 10; index += 1)
    vault.save({
      ...profile,
      id: `p${index}`,
      fields: [
        { name: 'experience', value: 'engineer '.repeat(400), secret: false },
        { name: 'passport', value: 'secret-passport', secret: true },
        { name: 'cc-number', value: 'secret-card', secret: false },
      ],
    });
  const matches = vault.search('engineer');
  expect(matches.length).toBeLessThanOrEqual(5);
  expect(JSON.stringify(matches).length).toBeLessThanOrEqual(4000);
  expect(vault.search('secret-passport')).toEqual([]);
  expect(vault.search('secret-card')).toEqual([]);
  expect(JSON.stringify(vault.readSafe('p0'))).not.toContain('secret-passport');
  expect(JSON.stringify(vault.readSafe('p0')).length).toBeLessThanOrEqual(4000);
  vault.settings(true, true, false);
  expect(() => vault.search('engineer')).toThrow('disabled');
});
it('encrypts document originals, text, notes and field values and returns metadata while locked', async () => {
  const filename = path.join(directory, 'resume.txt');
  fs.writeFileSync(filename, 'unique-resume-text');
  const item = await importDocument(filename, true);
  const id = vault.save(item);
  const disk = fs.readFileSync(path.join(directory, 'vault.json'), 'utf8');
  expect(disk).not.toContain('unique-resume-text');
  expect(disk).not.toContain(
    Buffer.from('unique-resume-text').toString('base64')
  );
  expect(vault.search('resume')[0].source).toBe('resume.txt');
  vault.lock();
  expect(vault.status().items[0]).not.toHaveProperty('document');
  vault.unlock(credential);
  expect(vault.edit(id).document?.text).toBe('unique-resume-text');
});
it('migrates legacy encrypted data atomically and preserves credentials, IDs and permissions', () => {
  vault.save({
    ...profile,
    kind: 'login',
    origin: 'https://example.com',
    password: 'legacy-secret',
  });
  vault.lock();
  const filename = path.join(directory, 'vault.json');
  const envelope = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const key = scryptSync(credential, Buffer.from(envelope.salt, 'base64'), 32, {
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
    ]).toString()
  );
  delete legacy.version;
  delete legacy.overrides;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  envelope.version = 1;
  envelope.iv = iv.toString('base64');
  envelope.ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(legacy)),
    cipher.final(),
  ]).toString('base64');
  envelope.tag = cipher.getAuthTag().toString('base64');
  fs.writeFileSync(filename, JSON.stringify(envelope));
  vault.unlock(credential);
  expect(vault.edit('profile').password).toBe('legacy-secret');
  expect(vault.edit('profile').allowAI).toBe(true);
  expect(JSON.parse(fs.readFileSync(filename, 'utf8')).version).toBe(2);
  expect(fs.existsSync(`${filename}.v1-backup`)).toBe(true);
});
it('keeps scope stable across group names, spaces and cookie profiles', () => {
  const tab = {
    sessionId: 'stable',
    sessionName: 'Old',
    spaceId: 'one',
  } as any;
  expect(personalDataScope(tab)).toBe(
    personalDataScope({
      ...tab,
      sessionName: 'New',
      spaceId: 'two',
      sessionProfileId: 'other',
    })
  );
  expect(personalDataScope(tab)).not.toBe(
    personalDataScope({ ...tab, sessionId: 'new' })
  );
});
it('rejects oversized and unsupported imports', async () => {
  const filename = path.join(directory, 'big.txt');
  fs.writeFileSync(filename, Buffer.alloc(20 * 1024 * 1024 + 1));
  await expect(importDocument(filename, false)).rejects.toThrow('20 MB');
  const image = path.join(directory, 'image.png');
  fs.writeFileSync(image, 'image');
  await expect(importDocument(image, false)).rejects.toThrow('PDF');
});

it('AI partial updates preserve protected fields and cannot replace them', () => {
  vault.save({
    ...profile,
    fields: [
      ...profile.fields,
      { name: 'passport', value: 'private-passport', secret: true },
    ],
  });
  vault.saveMemory({
    id: profile.id,
    title: profile.title,
    kind: 'profile',
    fields: [{ name: 'email', value: 'updated@example.com', secret: false }],
  });
  expect(
    vault.edit(profile.id).fields.find((field) => field.name === 'passport')
      ?.value
  ).toBe('private-passport');
  expect(
    vault.edit(profile.id).fields.find((field) => field.name === 'organization')
      ?.value
  ).toBe('Global Company');
  expect(() =>
    vault.saveMemory({
      id: profile.id,
      title: profile.title,
      kind: 'profile',
      fields: [{ name: 'passport', value: 'replace', secret: false }],
    })
  ).toThrow('Protected');
  expect(() =>
    vault.saveMemory({
      title: 'Secret',
      kind: 'profile',
      fields: [{ name: 'cc-number', value: 'card', secret: false }],
    })
  ).toThrow('Protected');
});

it('protects sensitive aliases and excludes source URL query data from public metadata', () => {
  vault.save({
    ...profile,
    fields: [
      {
        name: 'payment-code',
        aliases: ['cc-csc'],
        value: 'private-code',
        secret: false,
      },
    ],
    source: {
      label: 'Form',
      url: 'https://example.com?token=private-query',
      capturedAt: 'now',
    },
  });
  expect(vault.search('private-code')).toEqual([]);
  expect(vault.readSafe(profile.id).fields).toEqual([]);
  expect(JSON.stringify(vault.status())).not.toContain('private-query');
});

it('does not duplicate inherited fields when empty aliases are normalized', () => {
  const next = {
    ...profile,
    fields: profile.fields.map((field) => ({ ...field, aliases: [] })),
  };
  expect(difference(profile, next, 'group:a').fields).toEqual([]);
});

it('searches permitted login references without exposing their secrets or notes', () => {
  vault.save({
    ...profile,
    kind: 'login',
    title: 'Example login',
    origin: 'https://example.com',
    password: 'private-password',
    notes: 'private-login-note',
  });
  expect(vault.search('Example')).toHaveLength(1);
  expect(JSON.stringify(vault.readSafe(profile.id))).not.toContain(
    'private-password'
  );
  expect(JSON.stringify(vault.search('private-login-note'))).not.toContain(
    'private-login-note'
  );
});

it('normalizes human field names and allows every entry to use an optional website', () => {
  vault.save({
    ...profile,
    fields: [
      { name: 'Card number', value: 'private-card', secret: false },
      { name: 'Expiry date', value: '12/30', secret: false },
    ],
    allowAI: false,
  });
  const saved = vault.edit(profile.id);
  expect(saved.allowAI).toBe(false);
  expect(() => vault.readSafe(profile.id)).toThrow('AI access disabled');
  expect(saved.fields[0]).toMatchObject({
    secret: true,
    aliases: ['cc-number'],
  });
  expect(saved.fields[1]).toMatchObject({ secret: true, aliases: ['cc-exp'] });
  vault.save({ ...saved, allowAI: true });
  expect(vault.readSafe(profile.id).fields).toEqual([]);
  vault.save({
    ...profile,
    kind: 'login',
    origin: '',
    password: 'private-password',
  });
  expect(vault.forFill(profile.id, 'https://example.com', true).password).toBe(
    'private-password'
  );
});

it('uses site-specific entries only on that website while global entries remain available', () => {
  vault.save({ ...profile, id: 'site', origin: 'https://example.com' });
  vault.save({ ...profile, id: 'anywhere' });
  expect(
    vault
      .search('engineer', undefined, 'https://other.test')
      .map((item) => item.id)
  ).toEqual(['anywhere']);
  expect(() =>
    vault.readSafe('site', undefined, 0, 'https://other.test')
  ).toThrow('unavailable');
  expect(
    vault.readSafe('site', undefined, 0, 'https://example.com/path').id
  ).toBe('site');
});

it('keeps privately saved documents private through lock, reload and editing', () => {
  const item: VaultItem = {
    ...profile,
    id: 'resume',
    kind: 'knowledge',
    title: 'Resume',
    fields: [],
    allowAI: false,
    document: {
      name: 'resume.txt',
      mime: 'text/plain',
      content: Buffer.from('private resume text').toString('base64'),
      text: 'private resume text',
    },
  };
  vault.save(item);
  expect(vault.search('private resume')).toEqual([]);
  vault.lock();
  vault.unlock(credential);
  expect(vault.edit('resume').allowAI).toBe(false);
  vault.save({ ...vault.edit('resume'), title: 'Updated resume' });
  expect(vault.search('private resume')).toEqual([]);
  vault.save({ ...vault.edit('resume'), allowAI: true });
  expect(vault.search('private resume')).toHaveLength(1);
  expect(
    fs.readFileSync(path.join(directory, 'vault.json'), 'utf8')
  ).not.toContain('private resume text');
});

it('preserves an explicit fill mapping when a known field name means something else', () => {
  const saved = vault.save({
    ...profile,
    fields: [
      { name: 'Name', aliases: ['given-name'], value: 'Alex', secret: false },
    ],
  });
  expect(vault.edit(saved).fields[0].aliases).toEqual(['given-name']);
});
