/**
 * Email identities for AI sign-ups. An alias provider creates a forwarding
 * address per website; a mailbox provider reads the inbox those aliases
 * forward to. Providers are declared here so the UI, the main-process
 * service and the AI tools share one catalog; adding a provider means adding
 * a descriptor here and a client in `main/emailProviders`.
 */
export type EmailProviderKind = 'alias' | 'mailbox';

export interface EmailProviderField {
  key: string;
  label: string;
  kind?: 'text' | 'password' | 'number';
  /** Stored encrypted and never returned to the renderer or the AI. */
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: string;
  advanced?: boolean;
}

export interface EmailProviderPreset {
  id: string;
  label: string;
  values: Record<string, string>;
  hint?: string;
  /** Prefilled fields that users may change for regional/account-specific servers. */
  editableFields?: readonly string[];
  /** Alternative servers belonging to this preset, for account display labels. */
  hosts?: readonly string[];
}

export interface EmailProviderDescriptor {
  id: string;
  kind: EmailProviderKind;
  label: string;
  description: string;
  /** OAuth providers sign in through a browser tab instead of collecting fields. */
  auth?: 'oauth';
  /** Where the user obtains credentials. */
  website?: string;
  fields: EmailProviderField[];
  presets?: EmailProviderPreset[];
}

/** Web inboxes use the chosen tab group's existing browser session. */
export const EMAIL_BROWSER_PROVIDERS = [
  { id: 'google', label: 'Gmail', url: 'https://mail.google.com/', hosts: ['mail.google.com'] },
  { id: 'microsoft', label: 'Outlook', url: 'https://outlook.live.com/mail/', hosts: ['outlook.live.com', 'outlook.office.com', 'outlook.office365.com'] },
  { id: 'icloud', label: 'iCloud Mail', url: 'https://www.icloud.com/mail/', hosts: ['www.icloud.com', 'icloud.com'] },
  { id: 'fastmail', label: 'Fastmail', url: 'https://app.fastmail.com/', hosts: ['app.fastmail.com'] },
  { id: 'proton', label: 'Proton Mail', url: 'https://mail.proton.me/', hosts: ['mail.proton.me'] },
  { id: 'zoho', label: 'Zoho Mail', url: 'https://mail.zoho.com/', hosts: ['mail.zoho.com', 'mail.zoho.eu', 'mail.zoho.in', 'mail.zoho.com.au', 'mail.zoho.jp', 'mail.zoho.ca', 'mail.zoho.sa', 'mail.zoho.com.cn', 'mail.zohocloud.cn'] },
  { id: 'custom', label: 'Other webmail', url: '', hosts: [] },
] as const;

export interface EmailBrowserInbox {
  id?: string;
  providerId: typeof EMAIL_BROWSER_PROVIDERS[number]['id'];
  address: string;
  url: string;
}

/** Only ordinary account metadata is saved with the group; never cookies or tokens. */
export function parseEmailBrowserInbox(value: unknown): EmailBrowserInbox | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const provider = EMAIL_BROWSER_PROVIDERS.find((item) => item.id === input.providerId);
  const address = typeof input.address === 'string' ? input.address.trim() : '';
  if (!provider || !isEmailAddress(address)) return undefined;
  if (typeof input.url !== 'string' || input.url.length > 2048) return undefined;
  try {
    const url = new URL(input.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return undefined;
    if (provider.id !== 'custom' && !(provider.hosts as readonly string[]).includes(url.hostname)) return undefined;
    if (input.id !== undefined && (typeof input.id !== 'string' || !input.id || input.id.length > 300)) return undefined;
    return { ...(typeof input.id === 'string' ? { id: input.id } : {}), providerId: provider.id, address, url: url.href };
  } catch {
    return undefined;
  }
}

const IMAP_FIELDS: EmailProviderField[] = [
  { key: 'host', label: 'IMAP server', required: true, placeholder: 'imap.example.com' },
  { key: 'port', label: 'Port', kind: 'number', defaultValue: '993' },
  { key: 'user', label: 'Username', required: true, placeholder: 'you@example.com' },
  { key: 'password', label: 'App password', kind: 'password', secret: true, required: true },
];

export const EMAIL_PROVIDERS: readonly EmailProviderDescriptor[] = [
  {
    id: 'simplelogin',
    kind: 'alias',
    label: 'SimpleLogin',
    description:
      'Creates a forwarding alias for each website. The free plan includes 10 aliases; forwarded mail is unlimited.',
    website: 'https://app.simplelogin.io/dashboard/api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        kind: 'password',
        secret: true,
        required: true,
        hint: 'Create one under API Keys in your SimpleLogin dashboard.',
      },
      {
        key: 'baseUrl',
        label: 'Server',
        advanced: true,
        placeholder: 'https://app.simplelogin.io',
        defaultValue: 'https://app.simplelogin.io',
        hint: 'Only change this for a self-hosted SimpleLogin.',
      },
    ],
  },
  {
    id: 'google',
    kind: 'mailbox',
    label: 'Google',
    description: 'Sign in with Google. Kudium only reads mail; nothing is sent or deleted.',
    auth: 'oauth',
    fields: [],
  },
  {
    id: 'microsoft',
    kind: 'mailbox',
    label: 'Microsoft',
    description: 'Sign in with your Outlook.com or Microsoft 365 account. Kudium only reads mail.',
    auth: 'oauth',
    fields: [],
  },
  {
    id: 'imap',
    kind: 'mailbox',
    label: 'Other IMAP server',
    description: 'Any mail server that supports IMAP, using an app password.',
    fields: IMAP_FIELDS,
    presets: [
      {
        id: 'icloud',
        label: 'iCloud Mail',
        values: { host: 'imap.mail.me.com', port: '993' },
        hint: 'Use an app-specific password from appleid.apple.com.',
      },
      {
        id: 'fastmail',
        label: 'Fastmail',
        values: { host: 'imap.fastmail.com', port: '993' },
        hint: 'Create an app password with IMAP access.',
      },
      {
        id: 'zoho',
        label: 'Zoho Mail',
        values: { host: 'imap.zoho.com', port: '993' },
        editableFields: ['host'],
        hosts: ['imap.zoho.com', 'imappro.zoho.com', 'imap.zoho.eu', 'imappro.zoho.eu', 'imap.zoho.in', 'imappro.zoho.in', 'imap.zoho.com.au', 'imappro.zoho.com.au', 'imap.zoho.jp', 'imappro.zoho.jp', 'imap.zoho.ca', 'imappro.zoho.ca', 'imap.zoho.sa', 'imappro.zoho.sa', 'imap.zoho.com.cn', 'imappro.zoho.com.cn', 'imap.zohocloud.cn', 'imappro.zohocloud.cn'],
        hint: 'Enable IMAP in Zoho Mail and use the server shown in Settings → Mail accounts. Use an app password if two-factor authentication is on. Your plan must include IMAP access.',
      },
      {
        id: 'proton',
        label: 'Proton Mail Bridge',
        values: { host: '127.0.0.1', port: '1143' },
        hint: 'Requires Proton Mail Bridge running on this Mac; use its generated password.',
      },
    ],
  },
];

export function emailProvider(id: unknown): EmailProviderDescriptor | undefined {
  return EMAIL_PROVIDERS.find((provider) => provider.id === id);
}

export function emailProviders(kind: EmailProviderKind) {
  return EMAIL_PROVIDERS.filter((provider) => provider.kind === kind);
}

export const EMAIL_LIMITS = {
  fieldValue: 500,
  aliasNote: 200,
  hostname: 253,
  messageText: 20000,
  messages: 50,
  links: 20,
  waitSeconds: 180,
  recentDays: 7,
} as const;

export interface EmailProviderValues {
  [key: string]: string;
}

/** Validate submitted provider fields; defaults fill optional blanks. */
export function validateEmailProviderValues(
  descriptor: EmailProviderDescriptor,
  input: unknown
): EmailProviderValues {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Provider settings are required.');
  const raw = input as Record<string, unknown>;
  const values: EmailProviderValues = {};
  descriptor.fields.forEach((field) => {
    const value = raw[field.key];
    const text = typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();
    if (text.length > EMAIL_LIMITS.fieldValue || /[\u0000-\u001f\u007f]/.test(text))
      throw new Error(`${field.label} is invalid.`);
    const resolved = text || field.defaultValue || '';
    if (!resolved && field.required) throw new Error(`${field.label} is required.`);
    if (field.kind === 'number' && resolved) {
      const number = Number(resolved);
      if (!Number.isInteger(number) || number < 1 || number > 65535)
        throw new Error(`${field.label} must be a number between 1 and 65535.`);
    }
    values[field.key] = resolved;
  });
  return values;
}

export function emailSecretKeys(descriptor: EmailProviderDescriptor) {
  return descriptor.fields.filter((field) => field.secret).map((field) => field.key);
}

export interface EmailAlias {
  id: string;
  email: string;
  providerId: string;
  accountId?: string;
  /** Actual forwarding destinations returned by the alias provider. */
  forwardTo?: string[];
  forwardingMailboxes?: { id: string; email: string }[];
  hostname?: string;
  name?: string;
  note?: string;
  enabled: boolean;
  createdAt: number;
  forwards?: number;
}

export interface EmailMessage {
  id: string;
  mailboxId?: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: number;
  text: string;
  links: string[];
  codes: string[];
  /** The known alias this message was sent to, when any. */
  alias?: string;
}

export interface EmailAccountInfo {
  email?: string;
  premium?: boolean;
  aliasLimit?: number;
}

export interface EmailProviderConnection {
  id?: string;
  providerId: string;
  label: string;
  /** Non-secret identity shown in the UI, e.g. the mailbox address. */
  summary: string;
  configuredAt: number;
  account?: EmailAccountInfo;
  destinations?: { id: string; email: string }[];
  refreshing?: boolean;
  refreshedAt?: number;
  messageCount?: number;
  error?: string;
}

export interface EmailStatus {
  revision?: number;
  /** Absent means all messages; null means metadata only; an ID scopes the message list. */
  messagesFor?: string | null;
  available: boolean;
  /** Provider IDs this build cannot offer, e.g. OAuth clients without configured credentials. */
  unavailable: string[];
  /** Provider currently waiting for a browser sign-in. */
  connecting?: string;
  alias?: EmailProviderConnection;
  mailbox?: EmailProviderConnection;
  aliasProviders?: EmailProviderConnection[];
  mailboxes?: EmailProviderConnection[];
  aliases: EmailAlias[];
  messages: EmailMessage[];
  refreshedAt?: number;
  refreshing?: boolean;
  error?: string;
}

export interface EmailBrowserDetection {
  accounts: { address: string; tabId: string; url: string }[];
}

export type EmailRequest =
  | { action: 'detectBrowserInbox'; groupId: string; providerId: EmailBrowserInbox['providerId'] }
  | { action: 'status'; mailboxId?: string; summariesOnly?: boolean }
  | { action: 'connect'; providerId: string; values: Record<string, unknown>; accountId?: string }
  | { action: 'disconnect'; kind: EmailProviderKind; accountId?: string }
  | { action: 'cancelConnect' }
  | { action: 'refresh'; mailboxId?: string; automatic?: boolean }
  | { action: 'refreshAliases'; accountId?: string }
  | { action: 'createAlias'; hostname?: string; note?: string; accountId?: string; forwardTo?: string }
  | { action: 'setAliasEnabled'; id: string; enabled: boolean; accountId?: string }
  | { action: 'deleteAlias'; id: string; accountId?: string };

export interface EmailWaitFilter {
  mailboxId?: string;
  to?: string;
  from?: string;
  subject?: string;
  since: number;
}

export function isEmailAddress(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
  );
}

/** Accepts a hostname or URL and returns a lowercase hostname. */
export function normalizeHostname(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return undefined;
  let host = trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      host = new URL(trimmed).hostname;
    } catch {
      return undefined;
    }
  } else host = trimmed.split(/[/?#]/)[0].replace(/^www\./i, '');
  host = host.toLowerCase().replace(/^www\./, '');
  return host.length <= EMAIL_LIMITS.hostname &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)
    ? host
    : undefined;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Plain text for display and code extraction; links are collected separately. */
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|pre|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const VERIFY_HINT = /verif|confirm|activat|validat|magic|token=|code=|signup|sign-up|register|welcome/i;
const TRACKING = /unsubscribe|optout|opt-out|privacy|terms|facebook\.com|twitter\.com|instagram\.com|linkedin\.com/i;

/** Links from HTML hrefs and bare URLs, verification-looking ones first. */
export function extractLinks(text: string, html?: string) {
  const found: string[] = [];
  const add = (candidate: string) => {
    const cleaned = decodeEntities(candidate).replace(/[)>.,;:'"\]]+$/, '');
    try {
      const url = new URL(cleaned);
      if (!['http:', 'https:'].includes(url.protocol) || url.href.length > 2048) return;
      if (!found.includes(url.href)) found.push(url.href);
    } catch {
      /* Not a link. */
    }
  };
  if (html) {
    const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let match = href.exec(html);
    while (match) {
      add(match[1] ?? match[2]);
      match = href.exec(html);
    }
  }
  const bare = /https?:\/\/[^\s<>"']+/gi;
  let match = bare.exec(text);
  while (match) {
    add(match[0]);
    match = bare.exec(text);
  }
  const rank = (url: string) => (VERIFY_HINT.test(url) ? 0 : TRACKING.test(url) ? 2 : 1);
  return found
    .map((url, index) => ({ url, index, rank: rank(url) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, EMAIL_LIMITS.links)
    .map((item) => item.url);
}

const CODE_CONTEXT = /(?:code|pin|otp|passcode|password|token|verification|verify|confirm|security|one-time|2fa)/i;

/**
 * Likely one-time codes: 4–8 digit groups near a code-like word first, then
 * standalone 6-digit groups. Years, phone numbers and prices are skipped.
 */
export function extractVerificationCodes(text: string) {
  const codes: string[] = [];
  const push = (code: string) => {
    if (!codes.includes(code)) codes.push(code);
  };
  const near = /([A-Za-z-]+)[^\dA-Za-z]{0,3}(?:[^\d]{0,40}?)\b([A-Z0-9]{3,4}[- ]?[A-Z0-9]{3,4}|\d{4,8})\b/g;
  let match = near.exec(text);
  while (match) {
    const window = text.slice(Math.max(0, match.index - 60), match.index + match[0].length);
    const code = match[2].replace(/\s/g, '');
    if (CODE_CONTEXT.test(window) && /\d/.test(code) && !/^(19|20)\d{2}$/.test(code) && !/^[\d-]*\d{9,}/.test(code))
      push(code);
    match = near.exec(text);
  }
  const standalone = /(?<![\d.,$€£-])\b(\d{6})\b(?![\d.,%-])/g;
  match = standalone.exec(text);
  while (match) {
    push(match[1]);
    match = standalone.exec(text);
  }
  return codes.slice(0, 5);
}

function includesAddress(list: string[], address: string) {
  const wanted = address.toLowerCase();
  return list.some((item) => item.toLowerCase() === wanted || item.toLowerCase().endsWith(`<${wanted}>`));
}

export function matchesEmailFilter(message: EmailMessage, filter: EmailWaitFilter) {
  if (message.receivedAt < filter.since) return false;
  if (filter.to && !includesAddress(message.to, filter.to)) return false;
  if (filter.from && !message.from.toLowerCase().includes(filter.from.toLowerCase())) return false;
  if (filter.subject && !message.subject.toLowerCase().includes(filter.subject.toLowerCase())) return false;
  return true;
}

/** Attach the alias a message was delivered to, when it is one we know. */
export function aliasFor(message: Pick<EmailMessage, 'to'>, aliases: Pick<EmailAlias, 'email'>[]) {
  return aliases.find((alias) => includesAddress(message.to, alias.email))?.email;
}
