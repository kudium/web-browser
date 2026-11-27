import { ImapFlow } from 'imapflow';
import { createHash } from 'crypto';
import { simpleParser } from 'mailparser';
import type { EmailMessage, EmailProviderValues } from '../browser/email';
import { EMAIL_LIMITS, extractLinks, extractVerificationCodes, htmlToText } from '../browser/email';
import type { MailboxProviderClient } from './emailProviders';
import { oauthValues, refreshMailboxTokens, tokensFromValues } from './emailOAuth';

const CONNECT_TIMEOUT_MS = 20000;
const IDLE_MS = 90000;
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_CANDIDATES = 80;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

interface Pooled {
  client: ImapFlow;
  timer?: NodeJS.Timeout;
}
const pool = new Map<string, Pooled>();
const queues = new Map<string, Promise<unknown>>();
const messageCaches = new WeakMap<ImapFlow, { uidValidity: string; messages: Map<number, EmailMessage> }>();

function poolKey(values: EmailProviderValues) {
  // A refreshed access token must not reuse a connection authenticated with the old one.
  return createHash('sha256').update(JSON.stringify([values.host.toLowerCase(), Number(values.port || 993), values.user, values.accessToken || values.password])).digest('hex');
}

export function imapOptions(values: EmailProviderValues) {
  const host = values.host.toLowerCase();
  const port = Number(values.port || 993);
  const secure = port === 993;
  return {
    host,
    port,
    secure,
    auth: values.accessToken ? { user: values.user, accessToken: values.accessToken } : { user: values.user, pass: values.password },
    logger: false as const,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: 120000,
    disableAutoIdle: true,
    clientInfo: { name: 'Kudium Browser' },
    // Local bridges such as Proton Mail Bridge present self-signed certificates.
    ...(LOOPBACK.has(host) ? { tls: { rejectUnauthorized: false } } : {}),
  };
}

function userMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  if (/auth|login|credentials|invalid|AUTHENTICATIONFAILED/i.test(text))
    return 'The mailbox rejected the sign-in. Reconnect it, or use an app password for IMAP providers.';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) return 'The IMAP server could not be found.';
  if (/ECONNREFUSED|ETIMEDOUT|timeout|ECONNRESET/i.test(text)) return 'The IMAP server did not respond.';
  if (/certificate|self signed|CERT/i.test(text)) return 'The IMAP server certificate could not be verified.';
  return 'The mailbox could not be read.';
}

async function connect(values: EmailProviderValues): Promise<ImapFlow> {
  const key = poolKey(values);
  const existing = pool.get(key);
  if (existing && existing.client.usable) {
    if (existing.timer) clearTimeout(existing.timer);
    return existing.client;
  }
  if (existing) pool.delete(key);
  const client = new ImapFlow(imapOptions(values));
  client.on('error', () => drop(key, client));
  client.on('close', () => drop(key, client));
  try {
    await client.connect();
  } catch (error) {
    client.close();
    throw new Error(userMessage(error));
  }
  pool.set(key, { client });
  return client;
}

function drop(key: string, expectedClient?: ImapFlow) {
  const entry = pool.get(key);
  if (!entry || (expectedClient && entry.client !== expectedClient)) return;
  pool.delete(key);
  if (entry.timer) clearTimeout(entry.timer);
  try {
    entry.client.close();
  } catch {
    /* Already closed. */
  }
}

function release(values: EmailProviderValues) {
  const key = poolKey(values);
  const entry = pool.get(key);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    const current = pool.get(key);
    if (!current) return;
    pool.delete(key);
    current.client.logout().catch(() => current.client.close());
  }, IDLE_MS);
  entry.timer.unref?.();
}

/** Serialize work per mailbox so one pooled connection is never shared mid-command. */
async function withMailbox<T>(values: EmailProviderValues, work: (client: ImapFlow) => Promise<T>): Promise<T> {
  const key = poolKey(values);
  const run = async () => {
    const client = await connect(values);
    try {
      return await work(client);
    } catch (error) {
      drop(key);
      throw error instanceof Error && error.name === 'AbortError' ? error : new Error(userMessage(error));
    } finally {
      release(values);
    }
  };
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(key, next);
  try {
    return await next;
  } finally {
    if (queues.get(key) === next) queues.delete(key);
  }
}

function addressText(list: { address?: string; name?: string }[] | undefined) {
  return (list || [])
    .filter((item) => item.address)
    .map((item) => (item.name ? `${item.name} <${item.address}>` : item.address!));
}

export async function parseEmailSource(source: Buffer, fallback: { id: string; receivedAt: number }): Promise<EmailMessage> {
  const parsed = await simpleParser(source, { skipImageLinks: true, skipTextLinks: true, skipTextToHtml: true });
  const html = typeof parsed.html === 'string' ? parsed.html : undefined;
  const text = (parsed.text || (html ? htmlToText(html) : '')).trim().slice(0, EMAIL_LIMITS.messageText);
  const to = Array.isArray(parsed.to) ? parsed.to.flatMap((item) => item.value) : parsed.to?.value;
  return {
    id: parsed.messageId || fallback.id,
    from: parsed.from?.text || '',
    to: addressText(to),
    subject: (parsed.subject || '').slice(0, 300),
    receivedAt: parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime()) ? parsed.date.getTime() : fallback.receivedAt,
    text,
    links: extractLinks(text, html),
    codes: extractVerificationCodes(`${parsed.subject || ''}\n${text}`),
  };
}

export const imapMailboxClient: MailboxProviderClient = {
  async verify(values) {
    await withMailbox(values, async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      lock.release();
    });
    return { summary: values.user };
  },
  async fetchMessages(values, { since, limit, signal }) {
    return withMailbox(values, async (client) => {
      signal?.throwIfAborted();
      const lock = await client.getMailboxLock('INBOX');
      try {
        // IMAP SINCE is date-granular; filter precisely on the fetched dates.
        const uids = await client.search({ since: new Date(since - 86400000) }, { uid: true });
        if (!Array.isArray(uids) || !uids.length) return [];
        const candidates = uids.slice(-MAX_CANDIDATES);
        const uidValidity = client.mailbox ? String(client.mailbox.uidValidity) : '';
        let cache = messageCaches.get(client);
        if (!cache || cache.uidValidity !== uidValidity) {
          cache = { uidValidity, messages: new Map() };
          messageCaches.set(client, cache);
        }
        const retained = new Set(candidates);
        for (const uid of cache.messages.keys()) if (!retained.has(uid)) cache.messages.delete(uid);
        const eligible: { uid: number; receivedAt: number }[] = [];
        // Read small metadata first. Never download an old or oversized message body.
        for await (const item of client.fetch(candidates.join(','), { uid: true, internalDate: true, size: true }, { uid: true })) {
          signal?.throwIfAborted();
          const receivedAt = item.internalDate ? new Date(item.internalDate).getTime() : 0;
          if (receivedAt >= since && Number.isFinite(item.size) && item.size! >= 0 && item.size! <= MAX_SOURCE_BYTES) eligible.push({ uid: item.uid, receivedAt });
        }
        const selected = eligible.sort((a, b) => b.receivedAt - a.receivedAt).slice(0, Math.min(limit, EMAIL_LIMITS.messages));
        const missing = selected.filter((item) => !cache!.messages.has(item.uid));
        if (missing.length) {
          const receivedAt = new Map(missing.map((item) => [item.uid, item.receivedAt]));
          for await (const item of client.fetch(missing.map((item) => item.uid).join(','), { uid: true, source: { maxLength: MAX_SOURCE_BYTES + 1 } }, { uid: true })) {
            signal?.throwIfAborted();
            if (!item.source || item.source.length > MAX_SOURCE_BYTES || !receivedAt.has(item.uid)) continue;
            cache.messages.set(item.uid, await parseEmailSource(item.source, { id: `${values.user}:${uidValidity}:${item.uid}`, receivedAt: receivedAt.get(item.uid)! }));
            // Let native input and IPC run between MIME parses on an initial inbox load.
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
        }
        return selected.flatMap((item) => {
          const message = cache!.messages.get(item.uid);
          return message ? [message] : [];
        }).sort((a, b) => b.receivedAt - a.receivedAt);

      } finally {
        lock.release();
      }
    });
  },
  async dispose(values) {
    await Promise.all(
      (values ? [poolKey(values)] : [...pool.keys()]).map(async (key) => {
        const entry = pool.get(key);
        pool.delete(key);
        if (!entry) return;
        if (entry.timer) clearTimeout(entry.timer);
        await entry.client.logout().catch(() => entry.client.close());
      })
    );
  },
};

/** Token-authenticated mailbox for a browser sign-in provider; refreshes before expiry. */
export function oauthMailboxClient(providerId: string): MailboxProviderClient {
  return {
    async prepare(values) {
      if (!values.accessToken) throw new Error('Connect the mailbox again.');
      if (Number(values.expiresAt) > Date.now()) return undefined;
      const tokens = await refreshMailboxTokens(providerId, tokensFromValues(values));
      return { ...values, ...oauthValues(providerId, { ...tokens, email: tokens.email || values.user }) };
    },
    verify: (values) => imapMailboxClient.verify(values),
    fetchMessages: (values, options) => imapMailboxClient.fetchMessages(values, options),
    dispose: (values) => imapMailboxClient.dispose!(values),
  };
}
