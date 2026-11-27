/** @jest-environment node */
import { EventEmitter } from 'events';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { imapMailboxClient } from '../main/emailImap';

jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('mailparser', () => ({ simpleParser: jest.fn(async (source: Buffer) => ({ text: source.toString(), from: { text: 'Sender' }, subject: 'Verification', date: new Date(1_000_000) })) }));
jest.mock('../main/emailOAuth', () => ({}));
const values = { host: 'imap.zoho.com', port: '993', user: 'owner@example.com', password: 'private-password' };
function fixture() {
  let messages = Array.from({ length: 80 }, (_, index) => ({ uid: index + 1, internalDate: new Date(1_000_000 + index), size: 100, source: Buffer.from(`Code ${index + 100000}`) }));
  const fetchedBodies: number[] = [];
  const client = Object.assign(new EventEmitter(), {
    usable: true, mailbox: { uidValidity: 1n }, connect: jest.fn(async () => {}),
    close: jest.fn(() => { client.usable = false; client.emit('close'); }), logout: jest.fn(async () => { client.close(); }),
    getMailboxLock: jest.fn(async () => ({ release: jest.fn() })), search: jest.fn(async () => messages.map((item) => item.uid)),
    fetch: jest.fn(async function* (range: string, query: { source?: unknown }) {
      const requested = new Set(range.split(',').map(Number));
      for (const message of messages) {
        if (!requested.has(message.uid)) continue;
        if (query.source) { fetchedBodies.push(message.uid); yield { uid: message.uid, source: message.source }; }
        else yield { uid: message.uid, size: message.size, internalDate: message.internalDate };
      }
    }),
  });
  (ImapFlow as unknown as jest.Mock).mockImplementation(() => client);
  return { client, fetchedBodies, setMessages: (next: typeof messages) => { messages = next; }, messages };
}
beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { await imapMailboxClient.dispose!(); });
it('downloads at most 50 new bodies, then reuses them on unchanged refreshes', async () => {
  const { client, fetchedBodies } = fixture();
  const first = await imapMailboxClient.fetchMessages(values, { since: 999000, limit: 50 });
  expect(first).toHaveLength(50);
  expect(fetchedBodies).toHaveLength(50);
  expect(Math.min(...fetchedBodies)).toBe(31);
  await imapMailboxClient.fetchMessages(values, { since: 999000, limit: 50 });
  expect(fetchedBodies).toHaveLength(50);
  expect(simpleParser).toHaveBeenCalledTimes(50);
  expect(client.connect).toHaveBeenCalledTimes(1);
});
it('fetches only one added message and invalidates the cache after UIDVALIDITY changes', async () => {
  const { client, messages, setMessages, fetchedBodies } = fixture();
  await imapMailboxClient.fetchMessages(values, { since: 999000, limit: 50 });
  setMessages([...messages, { uid: 81, internalDate: new Date(1_000_081), size: 100, source: Buffer.from('New code') }]);
  await imapMailboxClient.fetchMessages(values, { since: 999000, limit: 50 });
  expect(fetchedBodies).toHaveLength(51);
  expect(fetchedBodies.at(-1)).toBe(81);
  client.mailbox.uidValidity = 2n;
  await imapMailboxClient.fetchMessages(values, { since: 999000, limit: 50 });
  expect(fetchedBodies).toHaveLength(101);
});
it('skips old, oversized and truncated messages before parsing their content', async () => {
  const { setMessages, fetchedBodies } = fixture();
  setMessages([
    { uid: 1, internalDate: new Date(1), size: 100, source: Buffer.from('Old') },
    { uid: 2, internalDate: new Date(1_000_000), size: 700000, source: Buffer.from('Attachment') },
    { uid: 3, internalDate: new Date(1_000_000), size: 100, source: Buffer.alloc(512 * 1024 + 1) },
    { uid: 4, internalDate: new Date(1_000_000), size: 100, source: Buffer.from('Valid') },
  ]);
  const result = await imapMailboxClient.fetchMessages(values, { since: 999000, limit: 50 });
  expect(fetchedBodies).toEqual([3, 4]);
  expect(simpleParser).toHaveBeenCalledTimes(1);
  expect(result).toHaveLength(1);
});
it('does not reuse a connection authenticated with a different app password', async () => {
  const first = fixture();
  await imapMailboxClient.verify(values);
  const second = fixture();
  await imapMailboxClient.verify({ ...values, password: 'changed-password' });
  expect(first.client.connect).toHaveBeenCalledTimes(1);
  expect(second.client.connect).toHaveBeenCalledTimes(1);
  expect(ImapFlow).toHaveBeenCalledTimes(2);
});

it('ignores a late close from an idle connection after its replacement connects', async () => {
  const first = fixture();
  jest.useFakeTimers();
  let finish!: () => void;
  try {
    await imapMailboxClient.verify(values);
    first.client.logout.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    jest.advanceTimersByTime(90000);
    const second = fixture();
    await imapMailboxClient.verify(values);
    first.client.close();
    finish();
    expect(second.client.close).not.toHaveBeenCalled();
    expect(second.client.usable).toBe(true);
  } finally { jest.useRealTimers(); }
});
