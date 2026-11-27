import type { EmailAlias, EmailProviderValues } from '../browser/email';
import { EMAIL_LIMITS, isEmailAddress, normalizeHostname } from '../browser/email';
import type { AliasProviderClient } from './emailProviders';

const DEFAULT_BASE = 'https://app.simplelogin.io';
const TIMEOUT_MS = 20000;
const MAX_BODY = 2 * 1024 * 1024;
const PAGE_SIZE = 20;
const MAX_PAGES = 25;

function baseUrl(values: EmailProviderValues) {
  const raw = values.baseUrl || DEFAULT_BASE;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('The SimpleLogin server address is invalid.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new Error('The SimpleLogin server must use HTTPS.');
  return url.origin;
}

interface SimpleLoginAlias {
  id: number;
  email: string;
  enabled: boolean;
  note?: string | null;
  creation_timestamp?: number;
  nb_forward?: number;
  mailboxes?: { id: number; email: string }[];
}

/** Fetch wrapper: fixed timeout, no redirects, bounded JSON, SimpleLogin errors surfaced. */
export async function simpleLoginRequest<T>(
  values: EmailProviderValues,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  if (!values.apiKey) throw new Error('A SimpleLogin API key is required.');
  const url = new URL(path, baseUrl(values));
  Object.entries(init.query || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: init.method || (init.body ? 'POST' : 'GET'),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authentication: values.apiKey,
        Accept: 'application/json',
        'User-Agent': 'Kudium Browser',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new Error('SimpleLogin could not be reached.');
  }
  const content = await response.text();
  if (content.length > MAX_BODY) throw new Error('SimpleLogin response is too large.');
  let data: any = {};
  if (content) {
    try {
      data = JSON.parse(content);
    } catch {
      if (response.ok) throw new Error('SimpleLogin returned an unexpected response.');
    }
  }
  if (response.status === 401) throw new Error('SimpleLogin rejected the API key.');
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error.slice(0, 300) : '';
    throw new Error(message || `SimpleLogin request failed (${response.status}).`);
  }
  return data as T;
}

function toAlias(alias: SimpleLoginAlias): EmailAlias {
  const note = typeof alias.note === 'string' ? alias.note : undefined;
  const name = note?.startsWith('Kudium · name: ') ? note.slice('Kudium · name: '.length, EMAIL_LIMITS.aliasNote) : undefined;
  const hostname = name ? undefined : normalizeHostname(note?.match(/^Kudium · ([^\s·]+)/)?.[1]);
  return {
    id: String(alias.id),
    email: alias.email,
    providerId: 'simplelogin',
    hostname,
    ...(name ? { name } : {}),
    note: note?.slice(0, EMAIL_LIMITS.aliasNote),
    enabled: alias.enabled !== false,
    createdAt: alias.creation_timestamp ? alias.creation_timestamp * 1000 : Date.now(),
    forwards: typeof alias.nb_forward === 'number' ? alias.nb_forward : undefined,
    ...(Array.isArray(alias.mailboxes) ? {
      forwardTo: alias.mailboxes.map((item) => item.email).filter(isEmailAddress),
      forwardingMailboxes: alias.mailboxes.filter((item) => Number.isInteger(item.id) && isEmailAddress(item.email)).map((item) => ({ id: String(item.id), email: item.email })),
    } : {}),
  };
}

function validAliasId(id: string) {
  if (!/^\d{1,12}$/.test(id)) throw new Error('Unknown alias.');
  return id;
}

export const simpleLoginClient: AliasProviderClient = {
  async verify(values) {
    const info = await simpleLoginRequest<{
      email?: string;
      is_premium?: boolean;
      max_alias_free_plan?: number;
    }>(values, '/api/user_info');
    return {
      summary: typeof info.email === 'string' ? info.email : 'SimpleLogin account',
      account: {
        email: typeof info.email === 'string' ? info.email : undefined,
        premium: info.is_premium === true,
        aliasLimit: info.is_premium ? undefined : info.max_alias_free_plan,
      },
    };
  },
  async createAlias(values, input) {
    const note = (input.hostname ? `Kudium · ${input.hostname}${input.note ? ` · ${input.note}` : ''}` : input.note ? `Kudium · name: ${input.note}` : 'Kudium · general').slice(
      0,
      EMAIL_LIMITS.aliasNote
    );
    const alias = await simpleLoginRequest<SimpleLoginAlias>(values, '/api/alias/random/new', {
      method: 'POST',
      query: { hostname: input.hostname, mode: 'word' },
      body: { note },
    });
    if (typeof alias?.email !== 'string' || alias.id === undefined)
      throw new Error('SimpleLogin did not return the new alias.');
    if (input.mailboxId) {
      try {
        await simpleLoginRequest(values, `/api/aliases/${validAliasId(String(alias.id))}`, {
          method: 'PATCH', body: { mailbox_ids: [Number(validAliasId(input.mailboxId))] },
        });
        const updated = await simpleLoginRequest<SimpleLoginAlias>(values, `/api/aliases/${validAliasId(String(alias.id))}`);
        if (!updated.mailboxes?.some((mailbox) => String(mailbox.id) === input.mailboxId)) throw new Error('Forwarding was not confirmed.');
        return toAlias({ ...updated, note: updated.note ?? note });
      } catch {
        throw new Error(`Alias ${alias.email} was created, but its forwarding address could not be confirmed. Refresh aliases before trying again.`);
      }
    }
    return toAlias({ ...alias, note: alias.note ?? note });
  },
  async listAliases(values) {
    const aliases: EmailAlias[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await simpleLoginRequest<{ aliases?: SimpleLoginAlias[] }>(values, '/api/v2/aliases', {
        query: { page_id: String(page) },
      });
      const batch = Array.isArray(result.aliases) ? result.aliases : [];
      batch.forEach((alias) => {
        if (typeof alias?.email === 'string' && alias.id !== undefined) aliases.push(toAlias(alias));
      });
      if (batch.length < PAGE_SIZE) break;
    }
    return aliases;
  },
  async setAliasEnabled(values, id, enabled) {
    const result = await simpleLoginRequest<{ enabled?: boolean }>(values, `/api/aliases/${validAliasId(id)}/toggle`, {
      method: 'POST',
    });
    if (result.enabled !== enabled)
      await simpleLoginRequest(values, `/api/aliases/${validAliasId(id)}/toggle`, { method: 'POST' });
  },
  async deleteAlias(values, id) {
    await simpleLoginRequest(values, `/api/aliases/${validAliasId(id)}`, { method: 'DELETE' });
  },
};
