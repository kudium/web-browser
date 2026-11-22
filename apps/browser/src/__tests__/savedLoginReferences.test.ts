import { autofillReferences, savedLoginReferences } from '../main/passwordManager/loginCredentials';
import type { VaultItem } from '../browser/passwordManager';

const captured: VaultItem = {
  id: 'captured', title: 'Website credentials', origin: 'https://example.com',
  kind: 'knowledge', username: '', password: '', allowAI: true,
  fields: [
    { name: 'account', aliases: ['email'], value: 'atlas@example.com', secret: false },
    { name: 'pass', aliases: ['current-password'], value: 'private-password', secret: true },
  ],
};
it('includes captured website credentials with a non-secret username for account selection', () => {
  expect(savedLoginReferences([captured])).toEqual([{
    accountId: 'captured', title: 'Website credentials', origin: 'https://example.com', username: 'atlas@example.com', fields: ['username', 'current-password'],
  }]);
  expect(JSON.stringify(savedLoginReferences([captured]))).not.toContain('private-password');
});
it('excludes unrelated facts, ambiguous accounts and records without a website', () => {
  expect(savedLoginReferences([
    { ...captured, fields: captured.fields.slice(0, 1) },
    { ...captured, fields: [...captured.fields, { name: 'username', value: 'another', secret: false }] },
    { ...captured, origin: '' },
  ])).toEqual([]);
});

it('lists autofill keys and references with ordinary values, and respects AI opt-outs', () => {
  const refs = autofillReferences([captured, { ...captured, id: 'disabled', allowAI: false }]);
  expect(refs).toHaveLength(1);
  expect(refs[0].recordId).toBe('captured');
  expect(refs[0].fields).toEqual([
    { name: 'account', aliases: ['email'], secret: false, value: 'atlas@example.com' },
    { name: 'pass', aliases: ['current-password'], secret: true },
  ]);
  expect(JSON.stringify(refs)).toContain('atlas@example.com');
  expect(JSON.stringify(refs)).not.toContain('private-password');
  expect(savedLoginReferences([{ ...captured, allowAI: false }])).toEqual([]);
});

it('exposes protected keys but excludes values even when the secret flag is missing', () => {
  const protectedNames = ['password', 'api key', 'webhook', 'otp', 'card number', 'cvv'];
  const refs = autofillReferences([{ ...captured, fields: [
    { name: 'given-name', value: 'Atlas', secret: false },
    ...protectedNames.map((name) => ({ name, value: `protected-${name}`, secret: false })),
  ] }]);
  expect(refs[0].fields[0]).toMatchObject({ value: 'Atlas', secret: false });
  for (const field of refs[0].fields.slice(1)) {
    expect(field.secret).toBe(true);
    expect(field).not.toHaveProperty('value');
  }
});

it('provides account names to distinguish saved logins while keeping both passwords local', () => {
  const refs = savedLoginReferences([
    { ...captured, id: 'one', kind: 'login', username: 'personal', password: 'first-private' },
    { ...captured, id: 'two', kind: 'login', username: 'work', password: 'second-private' },
  ]);
  expect(refs.map((ref) => ref.username)).toEqual(['personal', 'work']);
  expect(JSON.stringify(refs)).not.toContain('first-private');
  expect(JSON.stringify(refs)).not.toContain('second-private');
});
