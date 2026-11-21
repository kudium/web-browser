/** @jest-environment node */
import {
  autofillMetadata,
  AutofillMetadataCache,
} from '../main/passwordManager/autofillMetadata';
import type { VaultItem } from '../browser/passwordManager';
const base: VaultItem = {
  id: 'global',
  title: 'Profile',
  kind: 'profile',
  origin: '',
  username: '',
  password: '',
  fields: [{ name: 'email', value: 'private@example.test', secret: false }],
  notes: 'private note',
  allowAI: false,
};
it('indexes website fields before global fields and applies group overrides without exposing values', () => {
  const site = {
    ...base,
    id: 'site',
    kind: 'knowledge' as const,
    origin: 'https://example.com',
    fields: [
      { name: 'Username', value: 'private-user', secret: false },
      { name: 'Password', value: 'private-password', secret: true },
    ],
  };
  const metadata = autofillMetadata(
    [base, site, { ...site, id: 'business', scope: 'group:business' }],
    [
      { recordId: 'site', scope: 'group:hidden', hidden: true, patch: {} },
      {
        recordId: 'site',
        scope: 'group:alternate',
        patch: {},
        removedFields: ['Username'],
        fields: [
          { name: 'Email', value: 'alternate@example.test', secret: false },
        ],
      },
    ],
  );
  expect(JSON.stringify(metadata)).not.toMatch(
    /private@example.test|private-user|private-password|private note|alternate@example.test/,
  );
  const cache = new AutofillMetadataCache(metadata);
  expect(
    cache.availability('https://example.com').map((item) => item.kind),
  ).toEqual(['knowledge', 'profile']);
  expect(
    cache.availability('https://other.example').map((item) => item.kind),
  ).toEqual(['profile']);
  expect(
    cache.availability('https://example.com', 'group:hidden'),
  ).toHaveLength(1);
  expect(
    cache.availability('https://example.com', 'group:business'),
  ).toHaveLength(3);
  expect(
    cache
      .availability('https://example.com', 'group:alternate')[0]
      .fields.map((field) => field.name),
  ).toEqual(['Password', 'Email']);
});
