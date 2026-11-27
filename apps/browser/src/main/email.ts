/**
 * Email identities: encrypted provider settings, the alias list and a bounded
 * in-memory view of recent inbox messages. Secrets stay in this process; the
 * renderer and the AI only ever see connection summaries, aliases and parsed
 * messages.
 */
import { app, ipcMain, WebContents } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { safeStorage } from './localStorage';
import { openWindowLink } from './windowNavigation';
import { detectEmailForWindow } from './emailBrowserDetection';
import {
  EMAIL_LIMITS,
  emailProvider,
  matchesEmailFilter,
  normalizeHostname,
  validateEmailProviderValues,
} from '../browser/email';
import type {
  EmailAlias,
  EmailMessage,
  EmailProviderConnection,
  EmailProviderKind,
  EmailProviderValues,
  EmailRequest,
  EmailStatus,
  EmailWaitFilter,
} from '../browser/email';
import {
  aliasClient as defaultAliasClient,
  mailboxClient as defaultMailboxClient,
  mailboxProviderClients,
} from './emailProviders';
import { authorizeMailbox, oauthClient, oauthProviderIds, oauthValues } from './emailOAuth';

interface StoredConnection extends EmailProviderConnection {
  id: string;
  values: EmailProviderValues;
}
interface StoredState {
  version: 1 | 2;
  alias?: StoredConnection;
  mailbox?: StoredConnection;
  aliasProviders?: StoredConnection[];
  mailboxes?: StoredConnection[];
  aliases: EmailAlias[];
}
interface AccountState extends StoredState {
  version: 2;
  aliasProviders: StoredConnection[];
  mailboxes: StoredConnection[];
}
export interface EmailPersistence {
  load(): StoredState | undefined;
  save(state: StoredState): void;
}
interface EmailClients {
  alias: typeof defaultAliasClient;
  mailbox: typeof defaultMailboxClient;
  authorize?: typeof authorizeMailbox;
  oauthAvailable?: () => string[];
}
export interface EmailConnectOptions {
  open?: (url: string) => void;
  accountId?: string;
}
interface InboxState {
  messages: EmailMessage[];
  refreshedAt?: number;
  attemptedAt?: number;
  refreshing?: Promise<void>;
  error?: string;
}
const REFRESH_THROTTLE_MS = 15000;
const WAIT_POLL_MS = 4000;
const RECENT_MS = EMAIL_LIMITS.recentDays * 86400000;
const MAX_ACCOUNTS = 20;
function publicConnection(connection: StoredConnection): EmailProviderConnection {
  const { values, ...rest } = connection;
  return rest;
}
function destinations(aliases: EmailAlias[]) {
  return [...new Map(aliases.flatMap((alias) => alias.forwardingMailboxes || []).map((item) => [item.id, item])).values()];
}

export class EmailService {
  private state?: AccountState;
  private revision = 0;
  private projectedMessages?: EmailMessage[];
  private inboxes = new Map<string, InboxState>();
  private listeners = new Set<() => void>();
  private signIn?: { providerId: string; controller: AbortController };
  constructor(
    private persistence: EmailPersistence,
    private clients: EmailClients = {
      alias: defaultAliasClient, mailbox: defaultMailboxClient,
      authorize: authorizeMailbox,
      oauthAvailable: () => oauthProviderIds().filter((id) => oauthClient(id)),
    },
    private now: () => number = Date.now
  ) {}
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private notify() { this.revision += 1; this.listeners.forEach((listener) => listener()); }
  private stored(): AccountState {
    if (!this.state) {
      const loaded = this.persistence.load();
      const aliasProviders = loaded?.aliasProviders || (loaded?.alias ? [{ ...loaded.alias, id: loaded.alias.id || 'legacy-alias' }] : []);
      const mailboxes = loaded?.mailboxes || (loaded?.mailbox ? [{ ...loaded.mailbox, id: loaded.mailbox.id || 'legacy-mailbox' }] : []);
      this.state = {
        version: 2, aliasProviders, mailboxes,
        aliases: (loaded?.aliases || []).map((alias) => ({ ...alias, accountId: alias.accountId || aliasProviders[0]?.id })),
      };
    }
    return this.state;
  }
  private save(update: Partial<AccountState>) {
    const next = { ...this.stored(), ...update };
    this.persistence.save(next);
    this.state = next;
    if (update.aliases || update.mailboxes) this.projectedMessages = undefined;
    this.notify();
  }
  get aliases() { return this.stored().aliases; }
  status(options: { mailboxId?: string; summariesOnly?: boolean } = {}): EmailStatus {
    const state = this.stored();
    const offered = new Set(this.clients.oauthAvailable?.() || []);
    const aliasProviders = state.aliasProviders.map(publicConnection);
    const mailboxes = state.mailboxes.map((connection) => {
      const runtime = this.inboxes.get(connection.id);
      return { ...publicConnection(connection), refreshing: !!runtime?.refreshing, refreshedAt: runtime?.refreshedAt, error: runtime?.error, messageCount: runtime?.messages.length || 0 };
    });
    if (!options.summariesOnly && !this.projectedMessages) {
      const aliases = new Map<string, { email: string; index: number }>();
      state.aliases.forEach((alias, index) => { if (!aliases.has(alias.email.toLowerCase())) aliases.set(alias.email.toLowerCase(), { email: alias.email, index }); });
      this.projectedMessages = state.mailboxes.flatMap((connection) => (this.inboxes.get(connection.id)?.messages || []).map((message) => {
        let match: { email: string; index: number } | undefined;
        message.to.forEach((recipient) => {
          const lower = recipient.toLowerCase();
          const bracket = lower.lastIndexOf('<');
          const address = lower.endsWith('>') && bracket >= 0 ? lower.slice(bracket + 1, -1) : lower;
          const found = aliases.get(address);
          if (found && (!match || found.index < match.index)) match = found;
        });
        return { ...message, mailboxId: connection.id, alias: match?.email };
      })).sort((a, b) => b.receivedAt - a.receivedAt);
    }
    const messages = options.summariesOnly ? [] : options.mailboxId ? this.projectedMessages!.filter((message) => message.mailboxId === options.mailboxId) : this.projectedMessages!;
    return {
      revision: this.revision, ...(options.summariesOnly ? { messagesFor: null } : options.mailboxId ? { messagesFor: options.mailboxId } : {}),
      available: true, unavailable: oauthProviderIds().filter((id) => !offered.has(id)),
      connecting: this.signIn?.providerId, aliasProviders, mailboxes,
      alias: aliasProviders[0], mailbox: mailboxes[0], aliases: state.aliases, messages,
      refreshedAt: mailboxes[0]?.refreshedAt, refreshing: mailboxes.some((item) => item.refreshing), error: mailboxes[0]?.error,
    };
  }
  async connect(providerId: string, input: unknown, options: EmailConnectOptions = {}) {
    const descriptor = emailProvider(providerId);
    if (!descriptor) throw new Error('Unknown email provider.');
    const existing = descriptor.kind === 'alias' ? this.stored().aliasProviders : this.stored().mailboxes;
    if (options.accountId && !existing.some((item) => item.id === options.accountId)) throw new Error('This email account is unavailable.');
    if (!options.accountId && existing.length >= MAX_ACCOUNTS) throw new Error('You can connect up to 20 accounts of each type.');
    const values = descriptor.auth === 'oauth' ? await this.signInValues(providerId, options) : validateEmailProviderValues(descriptor, input);
    const client = descriptor.kind === 'alias' ? this.clients.alias(providerId) : this.clients.mailbox(providerId);
    const prepared = descriptor.kind === 'mailbox' ? await this.clients.mailbox(providerId).prepare?.(values) || values : values;
    const verified = await client.verify(prepared);
    const fetched = descriptor.kind === 'alias' ? await this.clients.alias(providerId).listAliases(prepared) : [];
    const current = descriptor.kind === 'alias' ? this.stored().aliasProviders : this.stored().mailboxes;
    if (options.accountId && !current.some((item) => item.id === options.accountId)) throw new Error('This email account was removed during setup.');
    const duplicate = current.find((item) => item.providerId === providerId && item.summary.toLowerCase() === verified.summary.toLowerCase() && (item.values.host || item.values.baseUrl) === (prepared.host || prepared.baseUrl));
    const id = options.accountId || duplicate?.id || randomUUID();
    if (!current.some((item) => item.id === id) && current.length >= MAX_ACCOUNTS) throw new Error('You can connect up to 20 accounts of each type.');
    const label = descriptor.presets?.find((preset) => preset.values.host === prepared.host || preset.hosts?.includes(prepared.host))?.label || descriptor.label;
    const connection: StoredConnection = { id, providerId, label, configuredAt: this.now(), ...verified, values: prepared };
    const accounts = current.some((item) => item.id === id) ? current.map((item) => item.id === id ? connection : item) : [...current, connection];
    if (descriptor.kind === 'alias') {
      connection.destinations = destinations(fetched);
      this.save({ aliasProviders: accounts, aliases: [...this.stored().aliases.filter((item) => item.accountId !== id), ...fetched.map((alias) => ({ ...alias, accountId: id }))].sort((a, b) => b.createdAt - a.createdAt) });
    } else {
      this.inboxes.delete(id);
      this.save({ mailboxes: accounts });
      void this.refresh({ force: true, mailboxId: id }).catch(() => undefined);
    }
    return this.status();
  }
  private async signInValues(providerId: string, options: EmailConnectOptions) {
    if (!this.clients.authorize || !options.open) throw new Error('Browser sign-in is unavailable here.');
    this.signIn?.controller.abort();
    const controller = new AbortController();
    this.signIn = { providerId, controller };
    this.notify();
    try {
      const tokens = await this.clients.authorize(providerId, { open: options.open, signal: controller.signal });
      controller.signal.throwIfAborted();
      if (!tokens.email) throw new Error('The sign-in did not include an email address.');
      return oauthValues(providerId, tokens);
    } finally {
      if (this.signIn?.controller === controller) this.signIn = undefined;
      this.notify();
    }
  }
  cancelSignIn() { this.signIn?.controller.abort(); }
  async disconnect(kind: EmailProviderKind, accountId?: string) {
    const accounts = kind === 'alias' ? this.stored().aliasProviders : this.stored().mailboxes;
    if (!accountId && accounts.length > 1) throw new Error('Choose the email account to remove.');
    const target = accounts.find((item) => !accountId || item.id === accountId);
    if (!target) { if (accountId) throw new Error('Unknown email account.'); return this.status(); }
    if (kind === 'alias') this.save({ aliasProviders: accounts.filter((item) => item.id !== target.id), aliases: this.aliases.filter((alias) => alias.accountId !== target.id) });
    else {
      this.save({ mailboxes: accounts.filter((item) => item.id !== target.id) });
      this.inboxes.delete(target.id);
      await this.clients.mailbox(target.providerId).dispose?.(target.values);
    }
    return this.status();
  }
  private aliasConnection(accountId?: string) {
    const accounts = this.stored().aliasProviders;
    if (!accounts.length) throw new Error('Connect an alias provider in the Email sidebar first.');
    if (!accountId && accounts.length > 1) throw new Error('Choose an alias provider account.');
    const connection = accounts.find((item) => !accountId || item.id === accountId);
    if (!connection) throw new Error('Unknown alias provider account.');
    return { connection, client: this.clients.alias(connection.providerId) };
  }
  private findAlias(id: string, accountId?: string) {
    const found = this.aliases.filter((alias) => alias.id === id && (!accountId || alias.accountId === accountId));
    if (found.length !== 1) throw new Error(found.length ? 'Choose the alias provider account.' : 'Unknown alias.');
    return found[0];
  }
  async createAlias(input: { hostname?: unknown; note?: unknown; accountId?: string; forwardTo?: string }) {
    const { connection, client } = this.aliasConnection(input.accountId);
    const hostname = input.hostname === undefined || input.hostname === '' ? undefined : normalizeHostname(input.hostname);
    if (input.hostname && !hostname) throw new Error('Provide a valid website hostname.');
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, EMAIL_LIMITS.aliasNote) : undefined;
    const destination = input.forwardTo ? connection.destinations?.find((item) => item.email.toLowerCase() === input.forwardTo!.toLowerCase()) : undefined;
    if (input.forwardTo && !destination) throw new Error('Choose a forwarding address from this provider account.');
    let alias: EmailAlias;
    try { alias = await client.createAlias(connection.values, { hostname, note, ...(destination ? { mailboxId: destination.id } : {}) }); }
    catch (error) { await this.refreshAliases(connection.id).catch(() => undefined); throw error; }
    if (!this.stored().aliasProviders.some((item) => item.id === connection.id && item.values === connection.values)) throw new Error('The provider changed while the alias was being created. Refresh aliases before trying again.');
    const created = { ...alias, accountId: connection.id, hostname: alias.hostname || hostname };
    const aliases = [created, ...this.aliases.filter((item) => !(item.id === created.id && item.accountId === connection.id))];
    this.save({ aliases, aliasProviders: this.stored().aliasProviders.map((item) => item.id === connection.id ? { ...item, destinations: destinations(aliases.filter((entry) => entry.accountId === connection.id)) } : item) });
    return created;
  }
  async refreshAliases(accountId?: string) {
    const { connection, client } = this.aliasConnection(accountId);
    const aliases = await client.listAliases(connection.values);
    if (!this.stored().aliasProviders.includes(connection)) return;
    this.save({ aliasProviders: this.stored().aliasProviders.map((item) => item.id === connection.id ? { ...item, destinations: destinations(aliases) } : item), aliases: [...this.aliases.filter((alias) => alias.accountId !== connection.id), ...aliases.map((alias) => ({ ...alias, accountId: connection.id }))].sort((a, b) => b.createdAt - a.createdAt) });
  }
  async setAliasEnabled(id: string, enabled: boolean, accountId?: string) {
    const alias = this.findAlias(id, accountId);
    const { connection, client } = this.aliasConnection(alias.accountId);
    await client.setAliasEnabled(connection.values, id, enabled);
    if (!this.stored().aliasProviders.some((item) => item.id === connection.id && item.values === connection.values)) return;
    this.save({ aliases: this.aliases.map((item) => item.id === id && item.accountId === alias.accountId ? { ...item, enabled } : item) });
  }
  async deleteAlias(id: string, accountId?: string) {
    const alias = this.findAlias(id, accountId);
    const { connection, client } = this.aliasConnection(alias.accountId);
    await client.deleteAlias(connection.values, id);
    if (!this.stored().aliasProviders.some((item) => item.id === connection.id && item.values === connection.values)) return;
    this.save({ aliases: this.aliases.filter((item) => !(item.id === id && item.accountId === alias.accountId)) });
  }
  private refreshOne(connection: StoredConnection, options: { force?: boolean; signal?: AbortSignal }) {
    let runtime = this.inboxes.get(connection.id);
    if (!runtime) { runtime = { messages: [] }; this.inboxes.set(connection.id, runtime); }
    if (runtime.refreshing) return runtime.refreshing;
    if (!options.force && runtime.attemptedAt !== undefined && this.now() - runtime.attemptedAt < REFRESH_THROTTLE_MS) return Promise.resolve();
    const state = runtime;
    state.attemptedAt = this.now();
    const live = () => this.inboxes.get(connection.id) === state && this.stored().mailboxes.some((item) => item.id === connection.id);
    const since = Math.max(this.now() - RECENT_MS, state.refreshedAt ? state.refreshedAt - 600000 : 0);
    state.refreshing = Promise.resolve().then(async () => {
      this.notify();
      try {
        const client = this.clients.mailbox(connection.providerId);
        const prepared = await client.prepare?.(connection.values);
        if (!live()) return;
        if (prepared) this.save({ mailboxes: this.stored().mailboxes.map((item) => item.id === connection.id ? { ...item, values: prepared } : item) });
        const messages = await client.fetchMessages(prepared || connection.values, { since, limit: EMAIL_LIMITS.messages, signal: options.signal });
        if (!live()) return;
        const byId = new Map(state.messages.map((message) => [message.id, message]));
        messages.forEach((message) => byId.set(message.id, message));
        state.messages = [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, EMAIL_LIMITS.messages);
        this.projectedMessages = undefined;
        state.refreshedAt = this.now(); state.error = undefined;
      } catch (error) {
        if (live() && !(error instanceof Error && error.name === 'AbortError')) state.error = error instanceof Error ? error.message : 'The mailbox could not be read.';
        throw error;
      } finally { state.refreshing = undefined; this.notify(); }
    });
    return state.refreshing;
  }
  refresh(options: { force?: boolean; signal?: AbortSignal; mailboxId?: string } = {}) {
    const accounts = this.stored().mailboxes;
    if (!accounts.length) throw new Error('Connect a mailbox in the Email sidebar first.');
    if (options.mailboxId) {
      const account = accounts.find((item) => item.id === options.mailboxId);
      if (!account) throw new Error('Unknown mailbox.');
      return this.refreshOne(account, options);
    }
    if (accounts.length === 1) return this.refreshOne(accounts[0], options);
    return Promise.allSettled(accounts.map((account) => this.refreshOne(account, options))).then(() => undefined);
  }
  async waitForMessage(filter: EmailWaitFilter, options: { timeoutMs: number; signal?: AbortSignal; pollMs?: number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> }): Promise<EmailMessage | undefined> {
    const accounts = this.stored().mailboxes;
    const alias = filter.to && this.aliases.find((item) => item.email.toLowerCase() === filter.to!.toLowerCase());
    const recipients = alias ? alias.forwardTo || [] : filter.to ? [filter.to] : [];
    const candidates = filter.mailboxId ? accounts.filter((item) => item.id === filter.mailboxId) : accounts.filter((item) => recipients.some((address) => address.toLowerCase() === item.summary.toLowerCase()));
    const target = candidates.length === 1 ? candidates[0] : !filter.mailboxId && !candidates.length && accounts.length === 1 ? accounts[0] : undefined;
    if (!target) throw new Error('Choose a mailbox with mailboxId from get_email_context.');
    const deadline = this.now() + options.timeoutMs;
    for (;;) {
      options.signal?.throwIfAborted();
      if (!this.stored().mailboxes.some((item) => item.id === target.id)) throw new Error('This mailbox was removed.');
      await this.refresh({ force: true, signal: options.signal, mailboxId: target.id }).catch((error) => { if (error instanceof Error && error.name === 'AbortError') throw error; });
      const found = this.inboxes.get(target.id)?.messages.find((message) => matchesEmailFilter(message, filter));
      if (found) return { ...found, mailboxId: target.id };
      const remaining = deadline - this.now();
      if (remaining <= 0) return undefined;
      await (options.sleep || defaultSleep)(Math.min(options.pollMs ?? WAIT_POLL_MS, remaining), options.signal);
    }
  }
  async dispose() { this.cancelSignIn(); await Promise.all(Object.values(mailboxProviderClients).map((client) => client.dispose?.())); }
}

function defaultSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function encryptedEmailPersistence(file: string): EmailPersistence {
  const check = () => {
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend() === 'basic_text')
      throw new Error('Secure storage is unavailable, so email credentials cannot be saved.');
  };
  return {
    load() {
      if (!fs.existsSync(file)) return undefined;
      check();
      if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('Email settings are too large.');
      const state = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
      if (![1, 2].includes(state?.version) || !Array.isArray(state.aliases) || (state.version === 2 && (!Array.isArray(state.aliasProviders) || !Array.isArray(state.mailboxes)))) throw new Error('Invalid email settings.');
      return state as StoredState;
    },
    save(state) {
      check();
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(state)), { mode: 0o600, flag: 'wx' });
        fs.renameSync(temporary, file);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    },
  };
}

let service: EmailService | undefined;
export function emailService() {
  if (!service) service = new EmailService(encryptedEmailPersistence(path.join(app.getPath('userData'), 'email.bin')));
  return service;
}

export async function handleEmailRequest(email: EmailService, request: EmailRequest, options: EmailConnectOptions = {}) {
  if (request && typeof request === 'object') {
    for (const key of ['accountId', 'mailboxId'] as const) {
      const value = (request as unknown as Record<string, unknown>)[key];
      if (value !== undefined && (typeof value !== 'string' || !value || value.length > 300)) throw new Error('Invalid email account.');
    }
  }
  switch (request?.action) {
    case 'status':
      if (request.summariesOnly !== undefined && typeof request.summariesOnly !== 'boolean') throw new Error('Invalid status request.');
      return email.status(request);
    case 'connect':
      if (typeof request.providerId !== 'string') throw new Error('Choose a provider.');
      return email.connect(request.providerId, request.values, { ...options, accountId: request.accountId }).then(() => email.status({ summariesOnly: true }));
    case 'disconnect':
      if (request.kind !== 'alias' && request.kind !== 'mailbox') throw new Error('Invalid request.');
      return email.disconnect(request.kind, request.accountId).then(() => email.status({ summariesOnly: true }));
    case 'cancelConnect':
      email.cancelSignIn();
      return email.status({ summariesOnly: true });
    case 'refresh':
      if (request.automatic !== undefined && typeof request.automatic !== 'boolean') throw new Error('Invalid refresh request.');
      return email.refresh({ force: !request.automatic, mailboxId: request.mailboxId }).then(() => email.status({ mailboxId: request.mailboxId }));
    case 'refreshAliases': {
      const ids = request.accountId ? [request.accountId] : (email.status().aliasProviders || []).map((item) => item.id!);
      await Promise.all(ids.map((id) => email.refreshAliases(id)));
      return email.status({ summariesOnly: true });
    }
    case 'createAlias':
      return email.createAlias(request);
    case 'setAliasEnabled':
      if (typeof request.id !== 'string' || typeof request.enabled !== 'boolean') throw new Error('Invalid request.');
      return email.setAliasEnabled(request.id, request.enabled, request.accountId).then(() => email.status({ summariesOnly: true }));
    case 'deleteAlias':
      if (typeof request.id !== 'string') throw new Error('Invalid request.');
      return email.deleteAlias(request.id, request.accountId).then(() => email.status({ summariesOnly: true }));
    default:
      throw new Error('Unsupported email request.');
  }
}

export function registerEmail(isTrusted: (contents: WebContents) => boolean) {
  const watchers = new Set<WebContents>();
  let subscribed = false;
  ipcMain.handle('email', (event, request: EmailRequest) => {
    if (!isTrusted(event.sender) || event.senderFrame !== event.sender.mainFrame)
      throw new Error('Unauthorized email request.');
    if (request?.action === 'detectBrowserInbox') return detectEmailForWindow(event.sender, request.groupId, request.providerId);
    const email = emailService();
    if (!subscribed) {
      subscribed = true;
      email.subscribe(() => {
        watchers.forEach((contents) => {
          if (!contents.isDestroyed()) contents.send('email-changed');
        });
      });
    }
    if (!watchers.has(event.sender)) {
      watchers.add(event.sender);
      event.sender.once('destroyed', () => watchers.delete(event.sender));
    }
    const sender = event.sender;
    return handleEmailRequest(email, request, {
      open: (url) => {
        if (!sender.isDestroyed()) openWindowLink(sender, url);
      },
    });
  });
  app.on('before-quit', () => {
    void service?.dispose();
  });
}
