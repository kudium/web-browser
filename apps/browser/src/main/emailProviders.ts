/**
 * Provider clients behind the shared email catalog. Each client is stateless:
 * it receives the stored field values on every call and never caches secrets.
 * Register a new provider by adding its descriptor to `browser/email.ts` and
 * its client to the matching map below.
 */
import type {
  EmailAccountInfo,
  EmailAlias,
  EmailMessage,
  EmailProviderValues,
} from '../browser/email';
import { simpleLoginClient } from './emailSimpleLogin';
import { imapMailboxClient, oauthMailboxClient } from './emailImap';

export interface AliasProviderClient {
  /** Validate credentials and describe the account; throws a user-facing error. */
  verify(values: EmailProviderValues): Promise<{ summary: string; account?: EmailAccountInfo; destinations?: { id: string; email: string }[] }>;
  createAlias(
    values: EmailProviderValues,
    input: { hostname?: string; note?: string; mailboxId?: string }
  ): Promise<EmailAlias>;
  listAliases(values: EmailProviderValues): Promise<EmailAlias[]>;
  setAliasEnabled(values: EmailProviderValues, id: string, enabled: boolean): Promise<void>;
  deleteAlias(values: EmailProviderValues, id: string): Promise<void>;
}

export interface MailboxFetchOptions {
  /** Only messages received at or after this time. */
  since: number;
  limit: number;
  signal?: AbortSignal;
}

export interface MailboxProviderClient {
  /** Refresh expiring credentials; returns replacement values to persist, or undefined. */
  prepare?(values: EmailProviderValues): Promise<EmailProviderValues | undefined>;
  verify(values: EmailProviderValues): Promise<{ summary: string }>;
  fetchMessages(values: EmailProviderValues, options: MailboxFetchOptions): Promise<EmailMessage[]>;
  /** Drop pooled connections; called on disconnect and shutdown. */
  dispose?(values?: EmailProviderValues): Promise<void>;
}

export const aliasProviderClients: Record<string, AliasProviderClient> = {
  simplelogin: simpleLoginClient,
};

export const mailboxProviderClients: Record<string, MailboxProviderClient> = {
  imap: imapMailboxClient,
  google: oauthMailboxClient('google'),
  microsoft: oauthMailboxClient('microsoft'),
};

export function aliasClient(providerId: string) {
  const client = aliasProviderClients[providerId];
  if (!client) throw new Error('This alias provider is not supported.');
  return client;
}

export function mailboxClient(providerId: string) {
  const client = mailboxProviderClients[providerId];
  if (!client) throw new Error('This mailbox provider is not supported.');
  return client;
}
