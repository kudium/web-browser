/**
 * Browser sign-in for mailbox providers: the OAuth authorization-code flow
 * with PKCE and a loopback redirect, the shape Google and Microsoft require
 * for desktop apps. Tokens are returned to the caller; nothing is stored here.
 *
 * Client IDs are not secrets for desktop apps but are per-installation of
 * Kudium. They come from environment variables at build time or from
 * `<appData>/Kudium/email-oauth.json` on this Mac.
 */
import { app } from 'electron';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import type { EmailProviderValues } from '../browser/email';

export interface OAuthEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Extra authorize parameters, e.g. offline access for Google. */
  authorizeParams?: Record<string, string>;
  imap: { host: string; port: number };
}

export const OAUTH_PROVIDERS: Record<string, OAuthEndpoints> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://mail.google.com/', 'openid', 'email'],
    authorizeParams: { access_type: 'offline', prompt: 'consent' },
    imap: { host: 'imap.gmail.com', port: 993 },
  },
  microsoft: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['https://outlook.office.com/IMAP.AccessAsUser.All', 'offline_access', 'openid', 'email'],
    authorizeParams: { prompt: 'select_account' },
    imap: { host: 'outlook.office365.com', port: 993 },
  },
};

export interface OAuthClient {
  clientId: string;
  clientSecret?: string;
}

const ENV_KEYS: Record<string, { id: string; secret: string }> = {
  google: { id: 'KUDIUM_GOOGLE_OAUTH_CLIENT_ID', secret: 'KUDIUM_GOOGLE_OAUTH_CLIENT_SECRET' },
  microsoft: { id: 'KUDIUM_MICROSOFT_OAUTH_CLIENT_ID', secret: 'KUDIUM_MICROSOFT_OAUTH_CLIENT_SECRET' },
};

let fileConfig: Record<string, OAuthClient> | undefined;
let configWatcher: fs.FSWatcher | undefined;
function configFile() {
  return path.join(app.getPath('appData'), 'Kudium', 'email-oauth.json');
}
function readFileConfig() {
  if (fileConfig) return fileConfig;
  const file = configFile();
  if (!configWatcher) {
    try {
      // Watch the directory so atomic replacement and first-time creation both
      // invalidate the cache. Provider pickers continue to use cached metadata.
      configWatcher = fs.watch(path.dirname(file), { persistent: false }, (_event, name) => {
        if (!name || name.toString() === path.basename(file)) fileConfig = undefined;
      });
      configWatcher.on('error', () => {
        configWatcher?.close();
        configWatcher = undefined;
        fileConfig = undefined;
      });
    } catch {
      // The directory may not exist yet; don't permanently cache its absence.
    }
  }
  fileConfig = {};
  try {
    if (fs.existsSync(file) && fs.statSync(file).size < 64 * 1024) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      Object.entries(parsed || {}).forEach(([id, value]) => {
        const entry = value as { clientId?: unknown; clientSecret?: unknown };
        if (typeof entry?.clientId === 'string' && entry.clientId)
          fileConfig![id] = {
            clientId: entry.clientId,
            ...(typeof entry.clientSecret === 'string' && entry.clientSecret ? { clientSecret: entry.clientSecret } : {}),
          };
      });
    }
  } catch {
    /* A malformed config only disables browser sign-in. */
  }
  const result = fileConfig;
  if (!configWatcher) fileConfig = undefined;
  return result;
}

/** Credentials for a provider, or undefined when this build cannot offer it. */
export function oauthClient(providerId: string, env: NodeJS.ProcessEnv = process.env): OAuthClient | undefined {
  const keys = ENV_KEYS[providerId];
  if (!keys || !OAUTH_PROVIDERS[providerId]) return undefined;
  const clientId = env[keys.id];
  if (clientId) return { clientId, ...(env[keys.secret] ? { clientSecret: env[keys.secret] } : {}) };
  return readFileConfig()[providerId];
}

export function oauthProviderIds() {
  return Object.keys(OAUTH_PROVIDERS);
}

function base64url(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeIdToken(token: unknown): Record<string, unknown> {
  if (typeof token !== 'string') return {};
  const payload = token.split('.')[1];
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(
  providerId: string,
  client: OAuthClient,
  form: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<TokenResponse> {
  const endpoints = OAUTH_PROVIDERS[providerId];
  const body = new URLSearchParams({ client_id: client.clientId, ...form });
  if (client.clientSecret) body.set('client_secret', client.clientSecret);
  let response: Response;
  try {
    response = await fetchImpl(endpoints.tokenUrl, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
  } catch {
    throw new Error('The sign-in service could not be reached.');
  }
  const text = await response.text();
  if (text.length > 256 * 1024) throw new Error('The sign-in response is too large.');
  let data: TokenResponse = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The sign-in service returned an unexpected response.');
  }
  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error;
    throw new Error(detail ? `Sign-in failed: ${String(detail).slice(0, 200)}` : 'Sign-in failed.');
  }
  return data;
}

function toTokens(data: TokenResponse, previous?: { refreshToken?: string; email?: string }, now = Date.now()): OAuthTokens {
  const claims = decodeIdToken(data.id_token);
  const email = [claims.email, claims.preferred_username, previous?.email].find(
    (value): value is string => typeof value === 'string' && value.includes('@')
  );
  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiresAt: now + Math.max(60, Number(data.expires_in) || 3600) * 1000 - 60000,
    email,
  };
}

const CALLBACK_PATH = '/callback';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const DONE_PAGE =
  '<!doctype html><meta charset="utf-8"><title>Kudium</title><body style="font:15px -apple-system,system-ui;padding:40px;color:#333"><p>Signed in. You can close this tab and return to Kudium.</p></body>';

/**
 * Run the loopback flow. `open` receives the consent URL to show in a tab; the
 * promise settles when the provider redirects back, on abort, or after five minutes.
 */
export async function authorizeMailbox(
  providerId: string,
  options: { open: (url: string) => void; signal?: AbortSignal; fetchImpl?: typeof fetch; listen?: (server: http.Server) => Promise<void> }
): Promise<OAuthTokens> {
  const endpoints = OAUTH_PROVIDERS[providerId];
  const client = oauthClient(providerId);
  if (!endpoints || !client) throw new Error('Browser sign-in is not configured for this provider in this build.');
  options.signal?.throwIfAborted();
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(24));
  const server = http.createServer();
  const code = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      server.close();
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () => finish(new Error('Sign-in was cancelled.'));
    const timer = setTimeout(() => finish(new Error('Sign-in timed out. Try again.')), SIGN_IN_TIMEOUT_MS);
    timer.unref?.();
    options.signal?.addEventListener('abort', abort, { once: true });
    server.on('request', (request, response) => {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(DONE_PAGE);
      if (url.searchParams.get('state') !== state) return;
      const error = url.searchParams.get('error');
      const received = url.searchParams.get('code');
      if (error || !received) finish(new Error(error === 'access_denied' ? 'Sign-in was declined.' : 'Sign-in failed.'));
      else finish(undefined, received);
    });
    server.on('error', (error) => finish(error));
    (options.listen || ((instance) => new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve))))(server)
      .then(() => {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Sign-in could not start.');
        const redirect = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
        const authorize = new URL(endpoints.authorizeUrl);
        Object.entries({
          client_id: client.clientId,
          redirect_uri: redirect,
          response_type: 'code',
          scope: endpoints.scopes.join(' '),
          state,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          ...endpoints.authorizeParams,
        }).forEach(([key, value]) => authorize.searchParams.set(key, value));
        (server as http.Server & { redirectUri?: string }).redirectUri = redirect;
        options.open(authorize.href);
        return undefined;
      })
      .catch((error) => finish(error instanceof Error ? error : new Error('Sign-in could not start.')));
  });
  const redirectUri = (server as http.Server & { redirectUri?: string }).redirectUri!;
  const data = await tokenRequest(providerId, client, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }, options.fetchImpl);
  return toTokens(data);
}

export async function refreshMailboxTokens(providerId: string, tokens: OAuthTokens, fetchImpl?: typeof fetch): Promise<OAuthTokens> {
  const client = oauthClient(providerId);
  if (!client) throw new Error('Browser sign-in is not configured for this provider in this build.');
  if (!tokens.refreshToken) throw new Error('The mailbox sign-in expired. Connect it again.');
  const data = await tokenRequest(providerId, client, { grant_type: 'refresh_token', refresh_token: tokens.refreshToken }, fetchImpl);
  return toTokens(data, tokens);
}

/** Stored provider values for a signed-in mailbox: tokens plus the IMAP endpoint. */
export function oauthValues(providerId: string, tokens: OAuthTokens): EmailProviderValues {
  const { imap } = OAUTH_PROVIDERS[providerId];
  return {
    host: imap.host,
    port: String(imap.port),
    user: tokens.email || '',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || '',
    expiresAt: String(tokens.expiresAt),
  };
}

export function tokensFromValues(values: EmailProviderValues): OAuthTokens {
  return {
    accessToken: values.accessToken,
    refreshToken: values.refreshToken || undefined,
    expiresAt: Number(values.expiresAt) || 0,
    email: values.user || undefined,
  };
}
