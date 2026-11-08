/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PasswordVault, secureOrigin } from '../main/passwordManager/vault';

const password = 'a long unique master password';
describe('Password Manager vault', () => {
  let directory: string;
  let file: string;
  let now: number;
  let vault: PasswordVault;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-vault-'));
    file = path.join(directory, 'vault.json');
    now = 1000;
    vault = new PasswordVault(file, () => now);
  });
  afterEach(() => {
    vault.lock();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const save = () =>
    vault.save({
      id: '',
      title: 'Example',
      origin: 'https://example.com/login',
      kind: 'login',
      username: 'person@example.com',
      password: 'unique-secret-123',
      allowAI: true,
      fields: [{ name: 'tel', value: '5551234', secret: false }],
    });
  it('preserves the encrypted store when migration marks writes unavailable', () => {
    let writable = true;
    vault = new PasswordVault(
      file,
      () => now,
      undefined,
      undefined,
      () => {
        if (!writable) throw new Error('Recovery required');
      }
    );
    vault.unlock(password, true);
    save();
    const original = fs.readFileSync(file);
    writable = false;
    expect(() => vault.settings(false, false, false)).toThrow(
      'Recovery required'
    );
    expect(fs.readFileSync(file)).toEqual(original);
    expect(vault.status().items).toHaveLength(1);
  });
  it('encrypts the entire payload and returns only safe summaries', () => {
    vault.unlock(password, true);
    save();
    const disk = fs.readFileSync(file, 'utf8');
    expect(disk).not.toContain('unique-secret-123');
    expect(disk).toContain('person@example.com');
    expect(disk).not.toContain('5551234');
    expect(vault.status().items[0]).not.toHaveProperty('password');
    expect(vault.status().items[0]).not.toHaveProperty('fields');
    vault.lock();
    expect(vault.status().items).toHaveLength(1);
    expect(vault.status().items[0]).not.toHaveProperty('password');
    vault.unlock(password);
    expect(vault.status().items).toHaveLength(1);
    if (process.platform !== 'win32') { expect(fs.statSync(file).mode % 512).toBe(0o600); }
  });
  it('rejects wrong passwords and tampering without resetting the vault', () => {
    vault.unlock(password, true);
    save();
    vault.lock();
    expect(() => vault.unlock('wrong')).toThrow('Unable to unlock');
    expect(() => vault.unlock(password)).toThrow('Wait');
    now += 4000;
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    envelope.tag = Buffer.alloc(16).toString('base64');
    fs.writeFileSync(file, JSON.stringify(envelope));
    expect(() => vault.unlock(password)).toThrow('Unable to unlock');
    expect(vault.status().locked).toBe(true);
  });
  it('requires enabled access and exact HTTPS origins', () => {
    vault.unlock(password, true);
    save();
    const { id } = vault.status().items[0];
    expect(() => vault.forFill(id, 'https://evil.example.com')).toThrow(
      'not authorized'
    );
    expect(() => vault.forFill(id, 'https://example.com:444')).toThrow(
      'not authorized'
    );
    expect(() => vault.forFill(id, 'http://example.com')).toThrow('HTTPS');
    vault.settings(true, true, false);
    expect(() => vault.forFill(id, 'https://example.com', true)).toThrow(
      'disabled'
    );
    vault.settings(true, true, true);
    expect(vault.forFill(id, 'https://example.com', true).password).toBe(
      'unique-secret-123'
    );
    vault.settings(false, true, true);
    vault.settings(true, true, false);
    expect(() => vault.forFill(id, 'https://example.com', true)).toThrow(
      'disabled'
    );
  });
  it('locks on expiry, deletes persistently and prevents vault overwrite', () => {
    expect(() => vault.unlock('short', true)).toThrow('12');
    vault.unlock(password, true);
    save();
    const { id } = vault.status().items[0];
    vault.delete(id);
    vault.lock();
    vault.unlock(password);
    expect(vault.status().items).toEqual([]);
    now += 300001;
    expect(vault.status().locked).toBe(true);
    expect(() => vault.forFill(id, 'https://example.com')).toThrow('Unlock');
    expect(() => vault.unlock(password, true)).toThrow('already exists');
  });
  it('rejects unsafe website schemes and malformed fields', () => {
    expect(() => secureOrigin('https://user:password@example.com')).toThrow();
    expect(() => secureOrigin('file:///tmp/a')).toThrow();
    vault.unlock(password, true);
    expect(() => vault.save({ fields: [] } as any)).toThrow();
  });
  it('rotates the master password while preserving encrypted items', () => {
    vault.unlock(password, true);
    save();
    vault.changePassword('another strong master password');
    vault.lock();
    expect(() => vault.unlock(password)).toThrow();
    now += 4000;
    vault.unlock('another strong master password');
    expect(vault.status().items).toHaveLength(1);
  });
  it('does not retain an update when writing the encrypted file fails', () => {
    vault.unlock(password, true);
    save();
    const write = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => vault.settings(false, false, false)).toThrow();
    expect(vault.status().enabled).toBe(true);
    expect(() => vault.delete(vault.status().items[0].id)).toThrow();
    expect(vault.status().items).toHaveLength(1);
    write.mockRestore();
  });
  it('keeps public item metadata visible after restart and retains an authorized session until explicit lock', () => {
    vault.unlock(password, true);
    save();
    vault.retainUntilLock();
    now += 24 * 60 * 60 * 1000;
    expect(vault.status().locked).toBe(false);
    vault.lock();
    const reopened = new PasswordVault(file);
    expect(reopened.status().locked).toBe(true);
    expect(reopened.status().items).toHaveLength(1);
    expect(() => reopened.edit(reopened.status().items[0].id)).toThrow(
      'Unlock'
    );
  });
});
