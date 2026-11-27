/** @jest-environment node */
import { performance } from 'perf_hooks';
import { EmailService } from '../main/email';
import { aliasFor } from '../browser/email';

jest.mock('electron', () => ({ app: { getPath: () => '/email-test', on: jest.fn() }, ipcMain: { handle: jest.fn() } }));
jest.mock('../main/localStorage', () => ({ safeStorage: {} }));
jest.mock('../main/emailImap', () => ({ imapMailboxClient: {}, oauthMailboxClient: () => ({}) }));
jest.mock('../main/emailOAuth', () => ({ oauthProviderIds: () => [] }));
it('measures a bounded 20-mailbox fixture and compares repeated status projection and payloads', async () => {
  const aliases = Array.from({ length: 10000 }, (_, index) => ({ id: String(index), accountId: 'aliases', providerId: 'simplelogin', email: `alias${index}@fixture.test`, enabled: true, createdAt: 1 }));
  const mailboxes = Array.from({ length: 20 }, (_, index) => ({ id: `mailbox${index}`, providerId: 'imap', label: 'Fixture', summary: `inbox${index}@fixture.test`, configuredAt: 1, values: { user: String(index), host: 'imap.fixture.test', password: 'not-real' } }));
  const service = new EmailService({ load: () => ({ version: 2, aliasProviders: [], mailboxes, aliases }), save: () => {} }, {
    alias: () => { throw new Error('unused'); },
    mailbox: () => ({ verify: async () => ({ summary: '' }), fetchMessages: async (values) => Array.from({ length: 50 }, (_, index) => ({ id: `${values.user}:${index}`, from: 'sender@fixture.test', to: ['alias9999@fixture.test'], subject: 'Fixture', receivedAt: Date.now(), text: 'x'.repeat(20000), links: [], codes: [] })) }),
  });
  await service.refresh({ force: true });
  const coldStart = performance.now(); const all = service.status(); const coldMs = performance.now() - coldStart;
  const start = performance.now();
  const legacy = all.messages.map((message) => ({ ...message, alias: aliasFor(message, aliases) })).sort((a, b) => b.receivedAt - a.receivedAt);
  const legacyMs = performance.now() - start;
  const warmStart = performance.now(); for (let index = 0; index < 30; index++) service.status(); const warmAverageMs = (performance.now() - warmStart) / 30;
  expect(all.messages).toEqual(legacy);
  expect(all.messages).toHaveLength(1000);
  const scoped = service.status({ mailboxId: 'mailbox0' }); const metadata = service.status({ summariesOnly: true });
  expect(scoped.messages).toHaveLength(50); expect(metadata.messages).toHaveLength(0);
  const fullBytes = Buffer.byteLength(JSON.stringify(all)); const scopedBytes = Buffer.byteLength(JSON.stringify(scoped));
  expect(scopedBytes).toBeLessThan(fullBytes / 5);
  console.log(JSON.stringify({ fixture: '20 mailboxes, 1000 messages, 10000 aliases; synthetic data', legacyProjectionMs: Number(legacyMs.toFixed(2)), coldProjectionMs: Number(coldMs.toFixed(2)), warmStatusAverageMs: Number(warmAverageMs.toFixed(3)), fullBytes, scopedBytes, metadataBytes: Buffer.byteLength(JSON.stringify(metadata)) }));
});
