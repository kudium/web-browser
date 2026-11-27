import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createHash, randomBytes } from 'node:crypto';
import type { Authenticate } from '../auth';
import { RELAY_CEILINGS, type RelayCeiling } from '../relay-protocol';
import { RelayError, RelayService } from './service';
import type { RelayStore, RelayToken } from './store';
import type { RelaySocketData, UpgradeServer } from './websocket';

export interface RelayOptions {
  store: RelayStore;
  service: RelayService;
  /** Account bearer check (the desktop sign-in credential); absent in tests without auth. */
  authenticate?: Authenticate;
  /** Public relay host such as `relay.kudium.com`; devices get `<id>.<host>` when set. */
  relayHost?: string;
  now?: () => number;
}

const DEVICE_ID = /^[a-z0-9]{16}$/;
const MAX_BODY = 1024 * 1024;
const CODE_TTL_MS = 5 * 60_000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const id16 = () => randomBytes(10).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(16, '0').slice(0, 16);
const secret = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;

type Env = { Bindings: { remoteAddress?: string; server?: UpgradeServer } };
type Ctx = Context<Env>;

const relayFailure = (error: unknown) => {
  if (error instanceof RelayError) throw new HTTPException(error.status as 400, { message: error.code });
  throw error;
};

const validRedirect = (value: string) => {
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
};

/**
 * Relay routes: device management for signed-in accounts, the device socket,
 * OAuth 2.1 for cloud clients and the forwarded MCP endpoint. Every endpoint
 * exists in two shapes: host-based (`https://<device>.<relayHost>/mcp`) and
 * path-based (`/relay/d/<device>/mcp`) for deployments without wildcard DNS.
 */
export function createRelay(options: RelayOptions) {
  const { store, service, authenticate } = options;
  const now = options.now ?? Date.now;
  const app = new Hono<Env>();
  // Standalone (tests) the sub-app answers like the main app: JSON errors, no stack traces.
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error('Relay request failed');
    return c.json({ error: 'internal_error' }, 500);
  });

  // Bun fills the Host header for real requests; app.request() in tests only has the URL.
  const hostOf = (c: Ctx) => (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase();
  const requestOrigin = (c: Ctx) => {
    const url = new URL(c.req.url);
    const proto = c.req.header('x-forwarded-proto') ?? url.protocol.replace(':', '');
    return `${proto}://${hostOf(c)}`;
  };
  const deviceURLs = (origin: string, deviceId: string) => ({
    ...(options.relayHost ? { host: `https://${deviceId}.${options.relayHost}/mcp` } : {}),
    path: `${origin}/relay/d/${deviceId}/mcp`,
  });
  /** Issuer for a device: the device host when present, otherwise the path form. */
  const issuerFor = (c: Ctx, deviceId: string, hostForm: boolean) =>
    hostForm ? requestOrigin(c) : `${requestOrigin(c)}/relay/d/${deviceId}`;
  const hostDevice = (c: Ctx) => {
    if (!options.relayHost) return undefined;
    const host = hostOf(c).split(':')[0];
    const suffix = `.${options.relayHost.toLowerCase()}`;
    if (!host.endsWith(suffix)) return undefined;
    const id = host.slice(0, -suffix.length);
    return DEVICE_ID.test(id) ? id : undefined;
  };
  const deviceParam = (value: string | undefined) => {
    if (!value || !DEVICE_ID.test(value)) throw new HTTPException(404, { message: 'unknown_device' });
    return value;
  };

  // Account or device-token authorization for management routes.
  const bearer = (c: Ctx) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ') || header.length > 4096) return undefined;
    return header.slice(7);
  };
  const accountFor = async (c: Ctx) => {
    const token = bearer(c);
    if (!token || !authenticate) throw new HTTPException(401, { message: 'unauthorized' });
    try {
      return await authenticate(token);
    } catch {
      throw new HTTPException(401, { message: 'unauthorized' });
    }
  };
  const ownedDevice = async (c: Ctx, deviceId: string) => {
    const device = await store.getDevice(deviceId);
    if (!device) throw new HTTPException(404, { message: 'unknown_device' });
    const token = bearer(c);
    if (!token) throw new HTTPException(401, { message: 'unauthorized' });
    if (token.startsWith('kd_')) {
      if (hash(token) !== device.tokenHash) throw new HTTPException(401, { message: 'unauthorized' });
      return device;
    }
    const account = await accountFor(c);
    if (device.accountId !== account) throw new HTTPException(403, { message: 'forbidden' });
    return device;
  };

  app.use('/relay/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  // ----- Device management -------------------------------------------------
  app.post('/relay/devices', async (c) => {
    const account = await accountFor(c);
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'Kudium Browser';
    if ((await store.listDevices(account)).length >= 20) throw new HTTPException(429, { message: 'too_many_devices' });
    const deviceId = id16();
    const deviceToken = secret('kd');
    await store.createDevice({ id: deviceId, accountId: account, name, tokenHash: hash(deviceToken), enabled: false, createdAt: now() });
    return c.json({ deviceId, deviceToken, name, enabled: false, urls: deviceURLs(requestOrigin(c), deviceId) }, 201);
  });
  app.get('/relay/devices', async (c) => {
    const account = await accountFor(c);
    const devices = await store.listDevices(account);
    return c.json({
      devices: devices.map((device) => ({ deviceId: device.id, name: device.name, enabled: device.enabled, online: service.online(device.id), createdAt: device.createdAt, urls: deviceURLs(requestOrigin(c), device.id) })),
    });
  });
  app.get('/relay/devices/:device', async (c) => {
    const device = await ownedDevice(c, deviceParam(c.req.param('device')));
    return c.json({ deviceId: device.id, name: device.name, enabled: device.enabled, online: service.online(device.id), urls: deviceURLs(requestOrigin(c), device.id) });
  });
  app.post('/relay/devices/:device/enabled', async (c) => {
    const device = await ownedDevice(c, deviceParam(c.req.param('device')));
    const body = (await c.req.json().catch(() => ({}))) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') throw new HTTPException(400, { message: 'enabled_required' });
    await store.updateDevice(device.id, { enabled: body.enabled });
    // Disabling drops every relay session at once; connectors must reconnect after re-enabling.
    if (!body.enabled) service.detach(device.id, 1001, 'disabled');
    return c.json({ deviceId: device.id, enabled: body.enabled });
  });
  app.post('/relay/devices/:device/token', async (c) => {
    // Rotating the device token ends the current socket; connector tokens stay.
    const device = await ownedDevice(c, deviceParam(c.req.param('device')));
    const deviceToken = secret('kd');
    await store.updateDevice(device.id, { tokenHash: hash(deviceToken) });
    service.detach(device.id, 1001, 'token rotated');
    return c.json({ deviceId: device.id, deviceToken });
  });
  app.delete('/relay/devices/:device', async (c) => {
    const device = await ownedDevice(c, deviceParam(c.req.param('device')));
    service.detach(device.id, 1001, 'removed');
    await store.deleteDevice(device.id);
    return c.json({ removed: true });
  });
  const publicToken = (token: RelayToken) => ({ id: token.id, name: token.name, clientId: token.clientId, ceiling: token.ceiling, createdAt: token.createdAt, expiresAt: token.expiresAt, lastUsedAt: token.lastUsedAt, revoked: !!token.revokedAt });
  app.get('/relay/devices/:device/connectors', async (c) => {
    const device = await ownedDevice(c, deviceParam(c.req.param('device')));
    return c.json({ connectors: (await store.listTokens(device.id)).map(publicToken) });
  });
  app.post('/relay/devices/:device/connectors/:token', async (c) => {
    const device = await ownedDevice(c, deviceParam(c.req.param('device')));
    const body = (await c.req.json().catch(() => ({}))) as { ceiling?: unknown; name?: unknown };
    const patch: { ceiling?: RelayCeiling; name?: string } = {};
    if (body.ceiling !== undefined) {
      if (!RELAY_CEILINGS.includes(body.ceiling as RelayCeiling)) throw new HTTPException(400, { message: 'invalid_ceiling' });
      patch.ceiling = body.ceiling as RelayCeiling;
    }
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) throw new HTTPException(400, { message: 'invalid_name' });
      patch.name = body.name.trim();
    }
    const token = await store.updateToken(device.id, c.req.param('token'), patch);
    if (!token) throw new HTTPException(404, { message: 'unknown_connector' });
    return c.json(publicToken(token));
  });
  app.post('/relay/devices/:device/connectors/:token/revoke', async (c) => {
    const device = await ownedDevice(c, deviceParam(c.req.param('device')));
    const token = await store.updateToken(device.id, c.req.param('token'), { revokedAt: now() });
    if (!token) throw new HTTPException(404, { message: 'unknown_connector' });
    return c.json(publicToken(token));
  });
  app.get('/relay/devices/:device/audit', async (c) => {
    const device = await ownedDevice(c, deviceParam(c.req.param('device')));
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit')) || 100));
    return c.json({ rows: await store.listAudit(device.id, limit) });
  });

  // ----- Device socket -----------------------------------------------------
  app.get('/relay/device', async (c) => {
    const token = bearer(c) ?? c.req.query('token');
    if (!token || !token.startsWith('kd_') || token.length > 200) throw new HTTPException(401, { message: 'unauthorized' });
    const device = await store.findDeviceByTokenHash(hash(token));
    if (!device) throw new HTTPException(401, { message: 'unauthorized' });
    if (!device.enabled) throw new HTTPException(403, { message: 'device_disabled' });
    const server = c.env?.server;
    if (!server) throw new HTTPException(426, { message: 'upgrade_required' });
    const data: RelaySocketData = { service, deviceId: device.id, urls: deviceURLs(requestOrigin(c), device.id) };
    if (!server.upgrade(c.req.raw, { data })) throw new HTTPException(426, { message: 'upgrade_required' });
    // Bun answers the upgrade; Hono must not write a response.
    return new Response(null, { status: 101 });
  });

  // ----- OAuth 2.1 and MCP, in host and path forms --------------------------
  const resourceMetadata = (c: Ctx, deviceId: string, hostForm: boolean) => {
    const issuer = issuerFor(c, deviceId, hostForm);
    return c.json({ resource: `${issuer}/mcp`, authorization_servers: [issuer], bearer_methods_supported: ['header'], scopes_supported: ['mcp'] });
  };
  const serverMetadata = (c: Ctx, deviceId: string, hostForm: boolean) => {
    const issuer = issuerFor(c, deviceId, hostForm);
    return c.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      revocation_endpoint: `${issuer}/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
    });
  };

  const register = async (c: Ctx) => {
    const body = (await c.req.json().catch(() => undefined)) as { client_name?: unknown; redirect_uris?: unknown; token_endpoint_auth_method?: unknown } | undefined;
    if (!body || typeof body !== 'object') throw new HTTPException(400, { message: 'invalid_client_metadata' });
    const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 120) : 'MCP client';
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (!uris.length || uris.length > 10 || uris.some((uri) => typeof uri !== 'string' || uri.length > 2048 || !validRedirect(uri)))
      throw new HTTPException(400, { message: 'invalid_redirect_uri' });
    if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== 'none')
      throw new HTTPException(400, { message: 'invalid_client_metadata' });
    const client = await store.createClient({ clientId: `kc_${randomBytes(16).toString('base64url')}`, name, redirectUris: uris as string[], createdAt: now() });
    return c.json({ client_id: client.clientId, client_name: client.name, redirect_uris: client.redirectUris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] }, 201);
  };

  const authorize = async (c: Ctx, deviceId: string) => {
    const q = (name: string) => c.req.query(name) ?? '';
    const client = await store.getClient(q('client_id'));
    if (!client) throw new HTTPException(400, { message: 'invalid_client' });
    const redirectUri = q('redirect_uri');
    if (!client.redirectUris.includes(redirectUri)) throw new HTTPException(400, { message: 'invalid_redirect_uri' });
    const fail = (error: string) => {
      const url = new URL(redirectUri);
      url.searchParams.set('error', error);
      if (q('state')) url.searchParams.set('state', q('state'));
      return c.redirect(url.toString(), 302);
    };
    if (q('response_type') !== 'code') return fail('unsupported_response_type');
    if (q('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q('code_challenge'))) return fail('invalid_request');
    const scope = q('scope') || 'mcp';
    if (scope !== 'mcp') return fail('invalid_scope');
    const device = await store.getDevice(deviceId);
    if (!device || !device.enabled) throw new HTTPException(404, { message: 'unknown_device' });
    if (!service.online(deviceId)) throw new HTTPException(503, { message: 'device_offline' });
    let answer: { approved: boolean; name?: string; ceiling?: RelayCeiling };
    try {
      answer = await service.requestConsent(deviceId, { clientId: client.clientId, name: client.name, redirectUri, scope });
    } catch (error) {
      return relayFailure(error);
    }
    if (!answer.approved) return fail('access_denied');
    const code = secret('kx');
    await store.saveCode({ code, deviceId, clientId: client.clientId, redirectUri, challenge: q('code_challenge'), scope, name: answer.name?.trim() || client.name, ceiling: answer.ceiling ?? 'standard', expiresAt: now() + CODE_TTL_MS });
    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (q('state')) url.searchParams.set('state', q('state'));
    return c.redirect(url.toString(), 302);
  };

  const formOrJSON = async (c: Ctx) => {
    const type = c.req.header('content-type') ?? '';
    if (type.includes('application/json')) return ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const form = await c.req.parseBody().catch(() => ({}));
    return form as Record<string, unknown>;
  };
  const token = async (c: Ctx, deviceId: string) => {
    const body = await formOrJSON(c);
    const oauthError = (error: string, status: 400 | 401 = 400) => c.json({ error }, status);
    if (body.grant_type !== 'authorization_code') return oauthError('unsupported_grant_type');
    const code = typeof body.code === 'string' ? body.code : '';
    const verifier = typeof body.code_verifier === 'string' ? body.code_verifier : '';
    const saved = await store.takeCode(code);
    if (!saved || saved.deviceId !== deviceId || saved.expiresAt < now()) return oauthError('invalid_grant');
    if (body.client_id !== undefined && body.client_id !== saved.clientId) return oauthError('invalid_grant');
    if (body.redirect_uri !== undefined && body.redirect_uri !== saved.redirectUri) return oauthError('invalid_grant');
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return oauthError('invalid_grant');
    if (createHash('sha256').update(verifier).digest('base64url') !== saved.challenge) return oauthError('invalid_grant');
    const access = secret('kr');
    const record: RelayToken = { id: `kt_${randomBytes(8).toString('hex')}`, hash: hash(access), deviceId, clientId: saved.clientId, name: saved.name, ceiling: saved.ceiling, scope: saved.scope, createdAt: now(), expiresAt: now() + TOKEN_TTL_MS };
    await store.saveToken(record);
    c.header('Cache-Control', 'no-store');
    return c.json({ access_token: access, token_type: 'Bearer', expires_in: Math.floor(TOKEN_TTL_MS / 1000), scope: saved.scope });
  };
  const revoke = async (c: Ctx, deviceId: string) => {
    const body = await formOrJSON(c);
    const value = typeof body.token === 'string' ? body.token : '';
    const found = value ? await store.findTokenByHash(hash(value)) : undefined;
    if (found && found.deviceId === deviceId && !found.revokedAt) await store.updateToken(deviceId, found.id, { revokedAt: now() });
    return c.json({ revoked: true });
  };

  const mcp = async (c: Ctx, deviceId: string, hostForm: boolean) => {
    const issuer = issuerFor(c, deviceId, hostForm);
    const challenge = (error: string, status: 401 | 403) => {
      c.header('WWW-Authenticate', `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource", error="${error}"`);
      return c.json({ error }, status);
    };
    const value = bearer(c);
    if (!value || !value.startsWith('kr_')) return challenge('invalid_token', 401);
    const record = await store.findTokenByHash(hash(value));
    if (!record || record.deviceId !== deviceId || record.revokedAt || record.expiresAt < now()) return challenge('invalid_token', 401);
    const device = await store.getDevice(deviceId);
    if (!device || !device.enabled) return challenge('insufficient_scope', 403);
    const method = c.req.method === 'DELETE' ? 'DELETE' : 'POST';
    if (method === 'POST' && !(c.req.header('content-type') ?? '').startsWith('application/json'))
      throw new HTTPException(415, { message: 'json_required' });
    const length = Number(c.req.header('content-length') ?? 0);
    if (length > MAX_BODY) throw new HTTPException(413, { message: 'request_too_large' });
    const body = method === 'POST' ? await c.req.text() : '';
    if (Buffer.byteLength(body) > MAX_BODY) throw new HTTPException(413, { message: 'request_too_large' });
    const session = c.req.header('mcp-session-id');
    try {
      const response = await service.forward(deviceId, {
        method,
        ...(session && session.length <= 200 ? { session } : {}),
        body,
        connector: { id: record.id, name: record.name, ceiling: record.ceiling },
        signal: c.req.raw.signal,
      });
      await store.updateToken(deviceId, record.id, { lastUsedAt: now() });
      const headers = new Headers({ 'Cache-Control': 'no-store' });
      headers.set('Content-Type', response.contentType ?? 'application/json');
      if (response.session) headers.set('Mcp-Session-Id', response.session);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return relayFailure(error);
    }
  };

  // Host form: the device id is the first label of the Host header.
  app.get('/.well-known/oauth-protected-resource', async (c, next) => {
    const device = hostDevice(c);
    return device ? resourceMetadata(c, device, true) : next();
  });
  app.get('/.well-known/oauth-authorization-server', async (c, next) => {
    const device = hostDevice(c);
    return device ? serverMetadata(c, device, true) : next();
  });
  app.post('/register', async (c, next) => (hostDevice(c) ? register(c) : next()));
  app.get('/authorize', async (c, next) => {
    const device = hostDevice(c);
    return device ? authorize(c, device) : next();
  });
  app.post('/token', async (c, next) => {
    const device = hostDevice(c);
    return device ? token(c, device) : next();
  });
  app.post('/revoke', async (c, next) => {
    const device = hostDevice(c);
    return device ? revoke(c, device) : next();
  });
  app.on(['POST', 'DELETE'], '/mcp', async (c, next) => {
    const device = hostDevice(c);
    return device ? mcp(c, device, true) : next();
  });

  // Path form: `/relay/d/<device>/...` with RFC 9728 path-suffixed metadata.
  app.get('/.well-known/oauth-protected-resource/relay/d/:device/mcp', (c) => resourceMetadata(c, deviceParam(c.req.param('device')), false));
  app.get('/.well-known/oauth-authorization-server/relay/d/:device', (c) => serverMetadata(c, deviceParam(c.req.param('device')), false));
  app.post('/relay/d/:device/register', (c) => register(c));
  app.get('/relay/d/:device/authorize', (c) => authorize(c, deviceParam(c.req.param('device'))));
  app.post('/relay/d/:device/token', (c) => token(c, deviceParam(c.req.param('device'))));
  app.post('/relay/d/:device/revoke', (c) => revoke(c, deviceParam(c.req.param('device'))));
  app.on(['POST', 'DELETE'], '/relay/d/:device/mcp', (c) => mcp(c, deviceParam(c.req.param('device')), false));

  return app;
}
