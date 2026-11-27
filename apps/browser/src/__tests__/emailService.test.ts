/** @jest-environment node */
import { EmailService, handleEmailRequest } from '../main/email';
import type { EmailAlias, EmailMessage } from '../browser/email';

jest.mock('electron', () => ({ app: { getPath: () => '/email-test', on: jest.fn() }, ipcMain: { handle: jest.fn() } }));
jest.mock('../main/localStorage', () => ({ safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'os_crypt' } }));
jest.mock('../main/emailImap', () => ({ imapMailboxClient: {}, oauthMailboxClient: () => ({}) }));
jest.mock('../main/emailOAuth', () => ({ authorizeMailbox: jest.fn(), oauthClient: () => undefined, oauthProviderIds: () => ['google', 'microsoft'], oauthValues: jest.requireActual('../main/emailOAuth').oauthValues }));

function message(overrides: Partial<EmailMessage>): EmailMessage {
  return {
    id: 'm1',
    from: 'no-reply@site.test',
    to: ['alias@sl.test'],
    subject: 'Verify',
    receivedAt: 1_000_000,
    text: 'Code 123456',
    links: [],
    codes: ['123456'],
    ...overrides,
  };
}

function fixture() {
  let saved: any;
  const persistence = { load: () => saved, save: jest.fn((state: any) => { saved = state; }) };
  const aliases: EmailAlias[] = [];
  const alias = {
    verify: jest.fn(async () => ({ summary: 'me@mail.test', account: { email: 'me@mail.test', aliasLimit: 10 } })),
    createAlias: jest.fn(async (_values: unknown, input: { hostname?: string }) => {
      const created: EmailAlias = { id: String(aliases.length + 1), email: `a${aliases.length + 1}@sl.test`, providerId: 'simplelogin', hostname: input.hostname, enabled: true, createdAt: aliases.length + 1 };
      aliases.push(created);
      return created;
    }),
    listAliases: jest.fn(async () => [...aliases]),
    setAliasEnabled: jest.fn(async () => undefined),
    deleteAlias: jest.fn(async () => undefined),
  };
  let inbox: EmailMessage[] = [];
  const mailbox = {
    verify: jest.fn(async (_values: unknown) => ({ summary: 'me@mail.test' })),
    fetchMessages: jest.fn(async (_values: unknown, { since }: { since: number }) => inbox.filter((item) => item.receivedAt >= since)),
  };
  let now = 1_000_000;
  const authorize = jest.fn(async () => ({ accessToken: 'tok', refreshToken: 'ref', expiresAt: now + 3600000, email: 'me@gmail.com' }));
  const service = new EmailService(persistence, { alias: () => alias, mailbox: () => mailbox, authorize, oauthAvailable: () => ['google'] }, () => now);
  return { service, persistence, alias, mailbox, aliases, authorize, setInbox: (next: EmailMessage[]) => { inbox = next; }, tick: (ms: number) => { now += ms; } };
}

it('connects providers, stores secrets only in persistence and reports summaries', async () => {
  const { service, persistence, alias } = fixture();
  await service.connect('simplelogin', { apiKey: 'secret' });
  expect(alias.verify).toHaveBeenCalledWith({ apiKey: 'secret', baseUrl: 'https://app.simplelogin.io' });
  expect(persistence.save).toHaveBeenLastCalledWith(expect.objectContaining({ aliasProviders: [expect.objectContaining({ values: { apiKey: 'secret', baseUrl: 'https://app.simplelogin.io' } })] }));
  const status = service.status();
  expect(status.alias).toEqual(expect.objectContaining({ providerId: 'simplelogin', label: 'SimpleLogin', summary: 'me@mail.test' }));
  expect(JSON.stringify(status)).not.toContain('secret');
  await expect(service.connect('nope', {})).rejects.toThrow('Unknown email provider.');
  await expect(service.connect('imap', { host: 'x', user: 'u' })).rejects.toThrow('App password is required.');
});

it('creates, toggles and deletes aliases through the provider and remembers the website', async () => {
  const { service, alias } = fixture();
  await expect(service.createAlias({ hostname: 'example.com' })).rejects.toThrow('Connect an alias provider');
  await service.connect('simplelogin', { apiKey: 'k' });
  const created = await service.createAlias({ hostname: 'https://www.Example.com/signup' });
  expect(alias.createAlias).toHaveBeenCalledWith(expect.anything(), { hostname: 'example.com', note: undefined });
  expect(created.hostname).toBe('example.com');
  expect(service.aliases).toEqual([expect.objectContaining({ email: 'a1@sl.test', hostname: 'example.com' })]);
  await expect(service.createAlias({ hostname: 'not valid' })).rejects.toThrow('valid website hostname');
  await service.setAliasEnabled('1', false);
  expect(alias.setAliasEnabled).toHaveBeenCalledWith(expect.anything(), '1', false);
  expect(service.aliases[0].enabled).toBe(false);
  await service.deleteAlias('1');
  expect(service.aliases).toEqual([]);
  await expect(service.deleteAlias('1')).rejects.toThrow('Unknown alias.');
});

it('shows mailbox messages with alias labels and throttles each inbox refresh', async () => {
  const { service, mailbox, setInbox, tick } = fixture();
  await service.connect('imap', { host: 'imap.test', user: 'me', password: 'pw' });
  await service.refresh({ force: true });
  setInbox([message({ id: 'personal', to: ['me@mail.test'] }), message({ id: 'alias', to: ['a1@sl.test'] })]);
  await service.refresh({ force: true });
  expect(service.status().messages.map((item) => item.id)).toEqual(['personal', 'alias']);
  await service.refresh();
  expect(mailbox.fetchMessages).toHaveBeenCalledTimes(2);
  tick(20000);
  await service.refresh();
  expect(mailbox.fetchMessages).toHaveBeenCalledTimes(3);
  await service.connect('simplelogin', { apiKey: 'k' });
  await service.createAlias({ hostname: 'site.test' });
  expect(service.status().messages.map((item) => item.id)).toEqual(['personal', 'alias']);
  expect(service.status().messages[1].alias).toBe('a1@sl.test');
});

it('waits for a matching message and times out cleanly', async () => {
  const { service, setInbox, tick } = fixture();
  await service.connect('imap', { host: 'imap.test', user: 'me', password: 'pw' });
  await service.connect('simplelogin', { apiKey: 'k' });
  await service.createAlias({ hostname: 'site.test' });
  const sleep = jest.fn(async (ms: number) => {
    tick(ms);
    if (sleep.mock.calls.length === 2) setInbox([message({ id: 'late', to: ['a1@sl.test'], receivedAt: 1_000_000 + 5000 })]);
  });
  const found = await service.waitForMessage({ since: 1_000_000, to: 'a1@sl.test' }, { timeoutMs: 20000, pollMs: 4000, sleep });
  expect(found?.id).toBe('late');
  expect(sleep).toHaveBeenCalledTimes(2);
  const missing = await service.waitForMessage({ since: 1_000_000, subject: 'nothing' }, { timeoutMs: 8000, pollMs: 4000, sleep });
  expect(missing).toBeUndefined();
  const controller = new AbortController();
  controller.abort();
  await expect(service.waitForMessage({ since: 0 }, { timeoutMs: 1000, signal: controller.signal })).rejects.toThrow();
});

it('routes IPC requests and rejects malformed ones', async () => {
  const { service } = fixture();
  expect(await handleEmailRequest(service, { action: 'status' })).toEqual(expect.objectContaining({ available: true, aliases: [], unavailable: ['microsoft'] }));
  await expect(handleEmailRequest(service, { action: 'disconnect', kind: 'x' as never })).rejects.toThrow('Invalid request.');
  await expect(handleEmailRequest(service, { action: 'nope' } as never)).rejects.toThrow('Unsupported email request.');
  await expect(handleEmailRequest(service, { action: 'setAliasEnabled', id: 1 as never, enabled: true })).rejects.toThrow('Invalid request.');
});

it('signs mailboxes in through the browser and stores the token values', async () => {
  const { service, mailbox, authorize, persistence } = fixture();
  await expect(service.connect('google', {})).rejects.toThrow('Browser sign-in is unavailable here.');
  const open = jest.fn();
  const status = await service.connect('google', {}, { open });
  expect(authorize).toHaveBeenCalledWith('google', expect.objectContaining({ open }));
  expect(mailbox.verify).toHaveBeenCalledWith(expect.objectContaining({ host: 'imap.gmail.com', user: 'me@gmail.com', accessToken: 'tok' }));
  expect(status.mailbox).toEqual(expect.objectContaining({ providerId: 'google', label: 'Google', summary: 'me@mail.test' }));
  expect(status.connecting).toBeUndefined();
  expect(JSON.stringify(status)).not.toContain('tok');
  expect(persistence.save).toHaveBeenLastCalledWith(expect.objectContaining({ mailboxes: [expect.objectContaining({ values: expect.objectContaining({ refreshToken: 'ref' }) })] }));
});

it('reports a pending sign-in and cancels it', async () => {
  const { service } = fixture();
  let abort: AbortSignal | undefined;
  const slow = jest.fn((_id: string, options: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
    abort = options.signal;
    options.signal?.addEventListener('abort', () => reject(new Error('Sign-in was cancelled.')));
  }));
  const pending = new EmailService({ load: () => undefined, save: jest.fn() }, { alias: () => { throw new Error('x'); }, mailbox: () => { throw new Error('x'); }, authorize: slow as never, oauthAvailable: () => ['google'] });
  const connect = pending.connect('google', {}, { open: () => {} });
  await Promise.resolve();
  expect(pending.status().connecting).toBe('google');
  await handleEmailRequest(pending, { action: 'cancelConnect' });
  expect(abort?.aborted).toBe(true);
  await expect(connect).rejects.toThrow('cancelled');
  expect(pending.status().connecting).toBeUndefined();
  expect(service.status().connecting).toBeUndefined();
});

it('refreshes expiring mailbox credentials before reading and persists them', async () => {
  const { service, mailbox, persistence, setInbox } = fixture();
  (mailbox as { prepare?: jest.Mock }).prepare = jest.fn(async (values: Record<string, string>) => ({ ...values, password: 'rotated' }));
  await service.connect('imap', { host: 'imap.test', user: 'me', password: 'pw' });
  await service.refresh({ force: true });
  setInbox([message({ id: 'a' })]);
  await service.refresh({ force: true });
  expect(mailbox.fetchMessages).toHaveBeenLastCalledWith(expect.objectContaining({ password: 'rotated' }), expect.anything());
  expect(persistence.save).toHaveBeenLastCalledWith(expect.objectContaining({ mailboxes: [expect.objectContaining({ values: expect.objectContaining({ password: 'rotated' }) })] }));
});

it('keeps multiple inbox accounts separate even when their message IDs collide', async () => {
  const { service, mailbox, setInbox } = fixture();
  mailbox.verify.mockImplementation(async (values: any) => ({ summary: values.user }));
  mailbox.fetchMessages.mockImplementation(async (values: any) => [message({ id: 'same-id', to: [values.user], subject: values.user })]);
  await service.connect('imap', { host: 'imap.test', user: 'work@example.com', password: 'work-secret' });
  await service.connect('imap', { host: 'imap.test', user: 'personal@example.com', password: 'personal-secret' });
  await service.refresh({ force: true });
  const status = service.status();
  expect(status.mailboxes).toHaveLength(2);
  expect(status.messages).toHaveLength(2);
  const work = status.mailboxes!.find((account) => account.summary === 'work@example.com')!;
  const personal = status.mailboxes!.find((account) => account.summary === 'personal@example.com')!;
  expect(new Set(status.messages.map((item) => item.mailboxId)).size).toBe(2);
  await expect(service.waitForMessage({ since: 0 }, { timeoutMs: 1 })).rejects.toThrow('Choose a mailbox');
  expect((await service.waitForMessage({ since: 0, mailboxId: work.id }, { timeoutMs: 1 }))?.subject).toBe('work@example.com');
  await service.disconnect('mailbox', work.id);
  expect(service.status().mailboxes).toEqual([expect.objectContaining({ id: personal.id })]);
  expect(service.status().messages.map((item) => item.subject)).toEqual(['personal@example.com']);
  expect(JSON.stringify(service.status())).not.toContain('secret');
});

it('routes colliding alias IDs through their own provider accounts and preserves the others on removal', async () => {
  let saved: any;
  const createAlias = jest.fn(async (values: any) => ({ id: '1', email: `${values.apiKey}@sl.test`, providerId: 'simplelogin', enabled: true, createdAt: 1 }));
  const toggle = jest.fn(async () => undefined);
  const alias = { verify: async (values: any) => ({ summary: `${values.apiKey}@example.com` }), listAliases: async () => [], createAlias, setAliasEnabled: toggle, deleteAlias: async () => undefined };
  const service = new EmailService({ load: () => saved, save: (state) => { saved = state; } }, { alias: () => alias, mailbox: () => { throw new Error('Unused'); } });
  await service.connect('simplelogin', { apiKey: 'work' });
  await service.connect('simplelogin', { apiKey: 'personal' });
  const [work, personal] = service.status().aliasProviders!;
  await expect(service.createAlias({ hostname: 'example.com' })).rejects.toThrow('Choose an alias provider account');
  await service.createAlias({ accountId: work.id, hostname: 'example.com' });
  await service.createAlias({ accountId: personal.id, hostname: 'example.com' });
  await expect(service.setAliasEnabled('1', false)).rejects.toThrow('Choose the alias provider account');
  await service.setAliasEnabled('1', false, personal.id);
  expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'personal' }), '1', false);
  expect(service.aliases.find((item) => item.accountId === work.id)?.enabled).toBe(true);
  await service.disconnect('alias', personal.id);
  expect(service.status().aliasProviders).toHaveLength(1);
  expect(service.aliases).toEqual([expect.objectContaining({ accountId: work.id, email: 'work@sl.test' })]);
});

it('migrates existing single-account settings without losing credentials or aliases', async () => {
  const legacy: any = { version: 1, alias: { providerId: 'simplelogin', label: 'SimpleLogin', summary: 'work@example.com', configuredAt: 1, values: { apiKey: 'keep-this-secret' } }, mailbox: { providerId: 'imap', label: 'IMAP', summary: 'work@example.com', configuredAt: 1, values: { user: 'work@example.com', host: 'imap.test', password: 'mail-secret' } }, aliases: [{ id: '1', email: 'alias@sl.test', providerId: 'simplelogin', enabled: true, createdAt: 1 }] };
  const save = jest.fn();
  const service = new EmailService({ load: () => legacy, save }, { alias: () => { throw new Error('Unused'); }, mailbox: () => ({ verify: async () => ({ summary: '' }), fetchMessages: async () => [], dispose: async () => {} }) });
  expect(service.status().aliasProviders?.[0].id).toBe('legacy-alias');
  expect(service.status().mailboxes?.[0].id).toBe('legacy-mailbox');
  expect(service.aliases[0].accountId).toBe('legacy-alias');
  await service.disconnect('mailbox', 'legacy-mailbox');
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ version: 2, aliasProviders: [expect.objectContaining({ values: { apiKey: 'keep-this-secret' } })], aliases: [expect.objectContaining({ id: '1' })] }));
  expect(JSON.stringify(service.status())).not.toContain('secret');
});

it('ignores an inbox fetch that finishes after its account is removed', async () => {
  const { service, mailbox } = fixture();
  let finish: (messages: EmailMessage[]) => void = () => {};
  mailbox.fetchMessages.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await service.connect('imap', { host: 'imap.test', user: 'me', password: 'pw' });
  const pending = service.refresh({ force: true });
  await Promise.resolve();
  const id = service.status().mailboxes![0].id;
  await service.disconnect('mailbox', id);
  finish([message({ subject: 'stale' })]);
  await pending;
  expect(service.status().messages).toEqual([]);
  expect(service.status().mailboxes).toEqual([]);
});

it('monitors Zoho personal, business and regional servers through the shared IMAP client', async () => {
  const { service, mailbox, setInbox } = fixture();
  for (const host of ['imap.zoho.com', 'imappro.zoho.com', 'imappro.zoho.eu']) {
    await service.connect('imap', { host, user: 'owner@example.com', password: 'private-zoho-password' });
  }
  const status = service.status();
  expect(status.mailboxes).toHaveLength(3);
  expect(status.mailboxes!.every((account) => account.label === 'Zoho Mail')).toBe(true);
  expect(JSON.stringify(status)).not.toContain('private-zoho-password');
  setInbox([message({ id: 'zoho-message', subject: 'Zoho verification' })]);
  await service.refresh({ force: true, mailboxId: status.mailboxes![2].id });
  expect(mailbox.fetchMessages).toHaveBeenCalledWith(expect.objectContaining({ host: 'imappro.zoho.eu', port: '993' }), expect.anything());
  expect(service.status().messages).toEqual([expect.objectContaining({ id: 'zoho-message', mailboxId: status.mailboxes![2].id })]);
});

it('scopes UI status payloads and reuses the message projection until content changes', async () => {
  const { service, mailbox, setInbox } = fixture();
  mailbox.verify.mockImplementation(async (values: any) => ({ summary: values.user }));
  await service.connect('imap', { host: 'imap.test', user: 'work@example.com', password: 'pw' });
  await service.connect('imap', { host: 'imap.test', user: 'personal@example.com', password: 'pw' });
  await service.refresh({ force: true });
  const [work, personal] = service.status().mailboxes!;
  setInbox([message({ id: 'work-message' })]);
  await service.refresh({ force: true, mailboxId: work.id });
  setInbox([message({ id: 'personal-message' })]);
  await service.refresh({ force: true, mailboxId: personal.id });
  const all = service.status();
  expect(service.status().messages).toBe(all.messages);
  expect(service.status({ summariesOnly: true })).toMatchObject({ messages: [], messagesFor: null });
  expect(service.status({ mailboxId: personal.id }).messages.map((item) => item.id)).toEqual(['personal-message']);
  expect(service.status({ summariesOnly: true }).mailboxes!.map((item) => item.messageCount)).toEqual([1, 1]);
  await service.disconnect('mailbox', personal.id);
  expect(service.status().revision).toBeGreaterThan(all.revision!);
  expect(service.status().messages).toHaveLength(1);
});
it('coalesces simultaneous refreshes and throttles automatic retries after failures', async () => {
  const { service, mailbox, tick } = fixture();
  await service.connect('imap', { host: 'imap.test', user: 'me', password: 'pw' });
  await service.refresh({ force: true });
  mailbox.fetchMessages.mockClear();
  let finish!: (messages: EmailMessage[]) => void;
  mailbox.fetchMessages.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = service.refresh({ force: true });
  const second = service.refresh({ force: true });
  await Promise.resolve(); await Promise.resolve();
  expect(mailbox.fetchMessages).toHaveBeenCalledTimes(1);
  finish([]);
  await Promise.all([first, second]);
  tick(20000);
  mailbox.fetchMessages.mockRejectedValueOnce(new Error('Offline'));
  await expect(service.refresh()).rejects.toThrow('Offline');
  const attempts = mailbox.fetchMessages.mock.calls.length;
  await service.refresh();
  expect(mailbox.fetchMessages).toHaveBeenCalledTimes(attempts);
  expect(service.status().mailbox?.error).toBe('Offline');
  await service.refresh({ force: true });
  expect(mailbox.fetchMessages).toHaveBeenCalledTimes(attempts + 1);
});
