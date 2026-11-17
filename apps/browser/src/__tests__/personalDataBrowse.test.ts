/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PasswordVault } from '../main/passwordManager/vault';
import { browseSavedData } from '../main/passwordManager/browse';

it('browses other websites in the current group before browser-wide data without revealing protected values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-browse-test-'));
  const vault = new PasswordVault(path.join(root, 'vault.json'));
  try {
    vault.unlock('long disposable master password', true);
    const save = (id: string, scope?: string) => vault.save({
      id, title: id, kind: 'knowledge', origin: 'https://another.example', username: '', password: '', allowAI: false,
      fields: [{ name: 'Email', value: `${id}@example.com`, secret: false }, { name: 'Password', value: 'protected-value', secret: false }, { name: 'Access', aliases: ['current-password'], value: 'protected-alias', secret: false }],
    }, scope);
    save('browser'); save('group', 'group:current'); save('other-group', 'group:other');
    const found = browseSavedData(vault, 'group:current');
    expect(found.map((record) => record.id)).toEqual(['group', 'browser']);
    expect(found.map((record) => record.sourceLabel)).toEqual(['Group data', 'Browser data']);
    expect(found.every((record) => record.fields.length === 1)).toBe(true);
    expect(JSON.stringify(found)).not.toContain('protected-');
    expect(browseSavedData(vault).map((record) => record.id)).toEqual(['browser']);
  } finally { vault.lock(); fs.rmSync(root, { recursive: true, force: true }); }
});
