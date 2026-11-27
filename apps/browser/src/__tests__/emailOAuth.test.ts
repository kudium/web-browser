/** @jest-environment node */
import http from 'http';
import fs from 'fs';
import { authorizeMailbox, oauthClient, oauthValues, refreshMailboxTokens, tokensFromValues } from '../main/emailOAuth';

jest.mock('electron', () => ({ app: { getPath: (name: string) => `/email-oauth-test/${name}` } }));

const idToken = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

function json(status: number, body: unknown) {
  return { ok: status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

describe('client configuration', () => {
  it('reads client IDs from the environment and reports missing ones', () => {
    expect(oauthClient('google', {})).toBeUndefined();
    expect(oauthClient('google', { KUDIUM_GOOGLE_OAUTH_CLIENT_ID: 'id', KUDIUM_GOOGLE_OAUTH_CLIENT_SECRET: 's' })).toEqual({ clientId: 'id', clientSecret: 's' });
    expect(oauthClient('microsoft', { KUDIUM_MICROSOFT_OAUTH_CLIENT_ID: 'm' })).toEqual({ clientId: 'm' });
    expect(oauthClient('unknown', { KUDIUM_GOOGLE_OAUTH_CLIENT_ID: 'id' })).toBeUndefined();
  });

  it('invalidates cached missing and replaced config on directory events', () => {
    let change: (event: string, name: string | null) => void = () => {};
    const watcher = { on: jest.fn(), close: jest.fn() };
    const watch = jest.spyOn(fs, 'watch').mockImplementation(((_dir: string, _options: unknown, listener: typeof change) => {
      change = listener;
      return watcher;
    }) as unknown as typeof fs.watch);
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as fs.Stats);
    const read = jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ google: { clientId: 'first' }, microsoft: { clientId: 'ms' } }));
    try {
      jest.isolateModules(() => {
        const client = require('../main/emailOAuth').oauthClient;
        expect(client('google', {})).toBeUndefined();
        exists.mockReturnValue(true);
        expect(client('google', {})).toBeUndefined();
        expect(read).not.toHaveBeenCalled();
        change('rename', 'email-oauth.json');
        expect(client('google', {})).toEqual({ clientId: 'first' });
        expect(client('microsoft', {})).toEqual({ clientId: 'ms' });
        expect(read).toHaveBeenCalledTimes(1);
        read.mockReturnValue(JSON.stringify({ google: { clientId: 'replacement' } }));
        change('rename', 'unrelated.json');
        expect(client('google', {})).toEqual({ clientId: 'first' });
        change('rename', 'email-oauth.json');
        expect(client('google', {})).toEqual({ clientId: 'replacement' });
        expect(client('microsoft', {})).toBeUndefined();
        exists.mockReturnValue(false);
        change('rename', null);
        expect(client('google', {})).toBeUndefined();
        expect(watch).toHaveBeenCalledWith('/email-oauth-test/appData/Kudium', { persistent: false }, expect.any(Function));
      });
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('retries configuration when its directory did not exist initially', () => {
    jest.spyOn(fs, 'watch').mockImplementation(() => { throw new Error('ENOENT'); });
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 100 } as fs.Stats);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ google: { clientId: 'created' } }));
    try {
      jest.isolateModules(() => {
        const client = require('../main/emailOAuth').oauthClient;
        expect(client('google', {})).toBeUndefined();
        exists.mockReturnValue(true);
        expect(client('google', {})).toEqual({ clientId: 'created' });
      });
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('loopback sign-in', () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, KUDIUM_GOOGLE_OAUTH_CLIENT_ID: 'client', KUDIUM_GOOGLE_OAUTH_CLIENT_SECRET: 'secret' };
  });
  afterEach(() => {
    process.env = env;
  });

  it('exchanges the code with PKCE after the provider redirects back', async () => {
    const fetchImpl = jest.fn(async (_url: string | URL, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('grant_type')).toBe('authorization_code');
      expect(form.get('code')).toBe('the-code');
      expect(form.get('client_secret')).toBe('secret');
      expect(form.get('code_verifier')).toHaveLength(64);
      return json(200, { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, id_token: idToken({ email: 'me@gmail.com' }) });
    });
    let opened = '';
    const tokens = await authorizeMailbox('google', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      open: (url) => {
        opened = url;
        const authorize = new URL(url);
        expect(authorize.origin + authorize.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
        expect(authorize.searchParams.get('access_type')).toBe('offline');
        const redirect = new URL(authorize.searchParams.get('redirect_uri')!);
        // A wrong state is ignored; the real redirect completes the flow.
        http.get(`${redirect.href}?state=wrong&code=bad`, () => {
          http.get(`${redirect.href}?state=${authorize.searchParams.get('state')}&code=the-code`);
        });
      },
    });
    expect(opened).toContain('client_id=client');
    expect(tokens).toMatchObject({ accessToken: 'access', refreshToken: 'refresh', email: 'me@gmail.com' });
    expect(tokens.expiresAt).toBeGreaterThan(Date.now() + 3000000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails cleanly when the user declines or cancels', async () => {
    await expect(
      authorizeMailbox('google', {
        open: (url) => {
          const authorize = new URL(url);
          http.get(`${authorize.searchParams.get('redirect_uri')}?state=${authorize.searchParams.get('state')}&error=access_denied`);
        },
      })
    ).rejects.toThrow('Sign-in was declined.');
    const controller = new AbortController();
    const pending = authorizeMailbox('google', { open: () => controller.abort(), signal: controller.signal });
    await expect(pending).rejects.toThrow('Sign-in was cancelled.');
    await expect(authorizeMailbox('microsoft', { open: () => {} })).rejects.toThrow('not configured');
  });

  it('refreshes tokens and maps them to stored values', async () => {
    const fetchImpl = jest.fn(async (_url: string | URL, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('grant_type')).toBe('refresh_token');
      expect(form.get('refresh_token')).toBe('refresh');
      return json(200, { access_token: 'access-2', expires_in: 1800 });
    });
    const refreshed = await refreshMailboxTokens('google', { accessToken: 'old', refreshToken: 'refresh', expiresAt: 0, email: 'me@gmail.com' }, fetchImpl as unknown as typeof fetch);
    expect(refreshed).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh', email: 'me@gmail.com' });
    const values = oauthValues('google', refreshed);
    expect(values).toMatchObject({ host: 'imap.gmail.com', port: '993', user: 'me@gmail.com', accessToken: 'access-2', refreshToken: 'refresh' });
    expect(tokensFromValues(values)).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh', email: 'me@gmail.com' });
    await expect(
      refreshMailboxTokens('google', { accessToken: 'old', expiresAt: 0 }, fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow('Connect it again');
    await expect(
      refreshMailboxTokens('google', { accessToken: 'old', refreshToken: 'r', expiresAt: 0 }, (async () => json(400, { error: 'invalid_grant', error_description: 'Token revoked' })) as unknown as typeof fetch)
    ).rejects.toThrow('Token revoked');
  });
});
