import { afterEach, describe, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { createRelay } from '../src/relay/routes';
import { MemoryRelayStore } from '../src/relay/store';
import { RelayService, type DeviceLink } from '../src/relay/service';
import { parseDeviceFrame, type RelayToDeviceFrame } from '../src/relay-protocol';

const base = 'https://relay.kudium.com';
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function harness(options: { requestTimeoutMs?: number; idleTimeoutMs?: number; tokenLimit?: { count: number; windowMs: number } } = {}) {
  const store = new MemoryRelayStore();
  const service = new RelayService(store, { pingIntervalMs: 60_000, sweepIntervalMs: 60_000, ...options });
  const app = createRelay({
    store,
    service,
    relayHost: 'relay.kudium.com',
    authenticate: async (token) => {
      if (token === 'acct-token') return 'account-1';
      if (token === 'other-token') return 'account-2';
      throw new Error('bad token');
    },
  });
  const call = (path: string, init: RequestInit & { token?: string; host?: string } = {}) => {
    const { token, host, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (rest.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return app.request(`${host ?? base}${path}`, { ...rest, headers });
  };
  /** A fake browser: records frames and lets the test answer them. */
  const connect = (deviceId: string) => {
    const frames: RelayToDeviceFrame[] = [];
    let closed: { code?: number; reason?: string } | undefined;
    const link: DeviceLink = {
      send: (frame) => {
        frames.push(frame);
      },
      close: (code, reason) => {
        closed = { code, reason };
      },
    };
    const handlers = service.attach(deviceId, link, { path: `${base}/relay/d/${deviceId}/mcp` });
    return {
      frames,
      get closed() {
        return closed;
      },
      reply: (frame: unknown) => handlers.onFrame(JSON.stringify(frame)),
      drop: () => handlers.onClose(),
      last: <T extends RelayToDeviceFrame['type']>(type: T) =>
        [...frames].reverse().find((frame) => frame.type === type) as Extract<RelayToDeviceFrame, { type: T }> | undefined,
    };
  };
  const newDevice = async () => {
    const created = await call('/relay/devices', { method: 'POST', token: 'acct-token', body: JSON.stringify({ name: 'Mac' }) });
    expect(created.status).toBe(201);
    const device = (await created.json()) as { deviceId: string; deviceToken: string; urls: { host?: string; path: string } };
    return device;
  };
  const pkce = () => {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
  };
  /** Full OAuth round trip for one connector; returns the access token. */
  const connector = async (deviceId: string, browser: ReturnType<typeof connect>, hostForm = false, answer: Record<string, unknown> = {}) => {
    const issuer = hostForm ? `https://${deviceId}.relay.kudium.com` : `${base}/relay/d/${deviceId}`;
    const registered = await app.request(`${issuer}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }),
    });
    expect(registered.status).toBe(201);
    const client = (await registered.json()) as { client_id: string };
    const { verifier, challenge } = pkce();
    const authorize = app.request(
      `${issuer}/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz&scope=mcp`
    );
    await tick();
    const consent = browser.last('consent');
    expect(consent?.client.name).toBe('Claude');
    browser.reply({ type: 'consent', id: consent!.id, approved: true, ...answer });
    const redirected = await authorize;
    expect(redirected.status).toBe(302);
    const location = new URL(redirected.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://claude.ai/api/mcp/auth_callback');
    expect(location.searchParams.get('state')).toBe('xyz');
    const code = location.searchParams.get('code')!;
    const exchanged = await app.request(`${issuer}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback' }).toString(),
    });
    expect(exchanged.status).toBe(200);
    const granted = (await exchanged.json()) as { access_token: string; token_type: string };
    expect(granted.token_type).toBe('Bearer');
    return { access: granted.access_token, issuer, code, verifier, clientId: client.client_id };
  };
  return { app, store, service, call, connect, newDevice, connector, pkce };
}

const services: RelayService[] = [];
afterEach(() => {
  services.splice(0).forEach((service) => service.stop());
});
const setup = (options?: Parameters<typeof harness>[0]) => {
  const h = harness(options);
  services.push(h.service);
  return h;
};

describe('relay devices', () => {
  test('registers devices for a signed-in account, off by default, and hides tokens from listings', async () => {
    const { call, newDevice } = setup();
    expect((await call('/relay/devices', { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await call('/relay/devices', { method: 'POST', token: 'nope', body: '{}' })).status).toBe(401);
    const device = await newDevice();
    expect(device.deviceId).toMatch(/^[a-z0-9]{16}$/);
    expect(device.deviceToken.startsWith('kd_')).toBe(true);
    expect(device.urls.host).toBe(`https://${device.deviceId}.relay.kudium.com/mcp`);
    expect(device.urls.path).toBe(`${base}/relay/d/${device.deviceId}/mcp`);
    const listed = await (await call('/relay/devices', { token: 'acct-token' })).json();
    expect(listed.devices).toHaveLength(1);
    expect(listed.devices[0]).toMatchObject({ deviceId: device.deviceId, enabled: false, online: false });
    expect(JSON.stringify(listed)).not.toContain('kd_');
    // Another account cannot see or manage it; the device token can manage itself.
    expect((await call(`/relay/devices/${device.deviceId}`, { token: 'other-token' })).status).toBe(403);
    expect((await call(`/relay/devices/${device.deviceId}`, { token: device.deviceToken })).status).toBe(200);
  });

  test('refuses the device socket until enabled and requires the upgrade server', async () => {
    const { call, newDevice } = setup();
    const device = await newDevice();
    expect((await call('/relay/device', { token: device.deviceToken })).status).toBe(403);
    await call(`/relay/devices/${device.deviceId}/enabled`, { method: 'POST', token: device.deviceToken, body: JSON.stringify({ enabled: true }) });
    expect((await call('/relay/device', { token: device.deviceToken })).status).toBe(426);
    expect((await call('/relay/device', { token: 'kd_wrong' })).status).toBe(401);
  });
});

describe('relay OAuth and forwarding', () => {
  test('serves metadata in host and path forms', async () => {
    const { app, newDevice } = setup();
    const device = await newDevice();
    const hostResource = await app.request(`https://${device.deviceId}.relay.kudium.com/.well-known/oauth-protected-resource`);
    expect(await hostResource.json()).toMatchObject({
      resource: `https://${device.deviceId}.relay.kudium.com/mcp`,
      authorization_servers: [`https://${device.deviceId}.relay.kudium.com`],
    });
    const hostServer = await (await app.request(`https://${device.deviceId}.relay.kudium.com/.well-known/oauth-authorization-server`)).json();
    expect(hostServer).toMatchObject({ code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] });
    expect(hostServer.authorization_endpoint).toBe(`https://${device.deviceId}.relay.kudium.com/authorize`);
    const pathServer = await (await app.request(`${base}/.well-known/oauth-authorization-server/relay/d/${device.deviceId}`)).json();
    expect(pathServer.issuer).toBe(`${base}/relay/d/${device.deviceId}`);
    expect(pathServer.registration_endpoint).toBe(`${base}/relay/d/${device.deviceId}/register`);
    expect((await app.request(`${base}/.well-known/oauth-protected-resource`)).status).toBe(404);
    expect((await app.request(`https://bogus.relay.kudium.com/.well-known/oauth-protected-resource`)).status).toBe(404);
  });

  test('runs the PKCE consent flow through the device and forwards MCP requests with session passthrough', async () => {
    const { app, call, store, newDevice, connect, connector } = setup();
    const device = await newDevice();
    await call(`/relay/devices/${device.deviceId}/enabled`, { method: 'POST', token: device.deviceToken, body: JSON.stringify({ enabled: true }) });
    const browser = connect(device.deviceId);
    expect(browser.frames[0]).toMatchObject({ type: 'hello', deviceId: device.deviceId });
    const { access, issuer } = await connector(device.deviceId, browser, true, { name: 'Claude at work', ceiling: 'full' });
    expect(access.startsWith('kr_')).toBe(true);
    // Unauthenticated calls get a resource_metadata challenge per RFC 9728.
    const challenged = await app.request(`${issuer}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(challenged.status).toBe(401);
    expect(challenged.headers.get('www-authenticate')).toContain(`${issuer}/.well-known/oauth-protected-resource`);
    const forwarded = app.request(`${issuer}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    await tick();
    const request = browser.last('request')!;
    expect(request).toMatchObject({ method: 'POST', connector: { name: 'Claude at work', ceiling: 'full' } });
    expect(JSON.parse(request.body).method).toBe('initialize');
    browser.reply({ type: 'response', id: request.id, status: 200, session: 'sess-1', contentType: 'application/json', body: '{"jsonrpc":"2.0","id":1,"result":{}}' });
    const response = await forwarded;
    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBe('sess-1');
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    // The session header travels to the device on later calls, including DELETE.
    const ending = app.request(`${issuer}/mcp`, { method: 'DELETE', headers: { Authorization: `Bearer ${access}`, 'Mcp-Session-Id': 'sess-1' } });
    await tick();
    const deletion = browser.last('request')!;
    expect(deletion).toMatchObject({ method: 'DELETE', session: 'sess-1' });
    browser.reply({ type: 'response', id: deletion.id, status: 200, body: '' });
    expect((await ending).status).toBe(200);
    const audit = await store.listAudit(device.deviceId, 10);
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({ method: 'initialize', status: 200 });
    expect(JSON.stringify(audit)).not.toContain('jsonrpc');
    const connectors = await (await call(`/relay/devices/${device.deviceId}/connectors`, { token: device.deviceToken })).json();
    expect(connectors.connectors[0]).toMatchObject({ name: 'Claude at work', ceiling: 'full', revoked: false });
    expect(JSON.stringify(connectors)).not.toContain('kr_');
  });

  test('rejects bad PKCE, reused codes, denied consent and unregistered redirect URIs', async () => {
    const { app, call, newDevice, connect, connector, pkce } = setup();
    const device = await newDevice();
    await call(`/relay/devices/${device.deviceId}/enabled`, { method: 'POST', token: device.deviceToken, body: JSON.stringify({ enabled: true }) });
    const browser = connect(device.deviceId);
    const { issuer, code, clientId } = await connector(device.deviceId, browser);
    const replay = await app.request(`${issuer}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code, code_verifier: pkce().verifier, client_id: clientId }),
    });
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe('invalid_grant');
    const badURI = await app.request(`${issuer}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent('https://evil.test/cb')}&code_challenge=${pkce().challenge}&code_challenge_method=S256`);
    expect(badURI.status).toBe(400);
    const plain = await app.request(`${issuer}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&code_challenge=abc&code_challenge_method=plain&state=s`);
    expect(plain.status).toBe(302);
    expect(new URL(plain.headers.get('location')!).searchParams.get('error')).toBe('invalid_request');
    const denied = app.request(`${issuer}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&code_challenge=${pkce().challenge}&code_challenge_method=S256&state=d`);
    await tick();
    browser.reply({ type: 'consent', id: browser.last('consent')!.id, approved: false });
    expect(new URL((await denied).headers.get('location')!).searchParams.get('error')).toBe('access_denied');
    expect((await app.request(`${issuer}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'x', redirect_uris: ['http://evil.test/cb'] }) })).status).toBe(400);
  });

  test('cancels on timeout and client disconnect, reports offline devices, and drops sessions when disabled', async () => {
    const { app, call, newDevice, connect, connector } = setup({ requestTimeoutMs: 40 });
    const device = await newDevice();
    await call(`/relay/devices/${device.deviceId}/enabled`, { method: 'POST', token: device.deviceToken, body: JSON.stringify({ enabled: true }) });
    const browser = connect(device.deviceId);
    const { access, issuer } = await connector(device.deviceId, browser);
    const post = (init: RequestInit = {}) =>
      app.request(`${issuer}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":2,"method":"tools/list"}', ...init });
    const slow = await post();
    expect(slow.status).toBe(504);
    expect(browser.last('cancel')).toBeDefined();
    const controller = new AbortController();
    const aborted = post({ signal: controller.signal });
    await tick();
    const pendingId = browser.last('request')!.id;
    controller.abort();
    expect((await aborted).status).toBe(499);
    expect(browser.last('cancel')?.id).toBe(pendingId);
    browser.drop();
    expect((await post()).status).toBe(503);
    expect((await post()).headers.get('content-type')).toContain('json');
    const again = connect(device.deviceId);
    await call(`/relay/devices/${device.deviceId}/enabled`, { method: 'POST', token: device.deviceToken, body: JSON.stringify({ enabled: false }) });
    expect(again.closed?.reason).toBe('disabled');
    expect((await post()).status).toBe(403);
  });

  test('revocation, rate limits, idle expiry and ceiling updates', async () => {
    const { app, call, service, newDevice, connect, connector } = setup({ tokenLimit: { count: 2, windowMs: 60_000 }, idleTimeoutMs: 30 });
    const device = await newDevice();
    await call(`/relay/devices/${device.deviceId}/enabled`, { method: 'POST', token: device.deviceToken, body: JSON.stringify({ enabled: true }) });
    const browser = connect(device.deviceId);
    const { access, issuer } = await connector(device.deviceId, browser);
    const connectors = await (await call(`/relay/devices/${device.deviceId}/connectors`, { token: device.deviceToken })).json();
    const tokenId = connectors.connectors[0].id;
    const updated = await call(`/relay/devices/${device.deviceId}/connectors/${tokenId}`, { method: 'POST', token: device.deviceToken, body: JSON.stringify({ ceiling: 'ask' }) });
    expect((await updated.json()).ceiling).toBe('ask');
    expect((await call(`/relay/devices/${device.deviceId}/connectors/${tokenId}`, { method: 'POST', token: device.deviceToken, body: JSON.stringify({ ceiling: 'root' }) })).status).toBe(400);
    const post = () => app.request(`${issuer}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":3,"method":"ping"}' });
    const answer = async (pending: Promise<Response> | Response) => {
      await tick();
      const frame = browser.last('request')!;
      browser.reply({ type: 'response', id: frame.id, status: 200, body: '{}' });
      return pending;
    };
    expect((await answer(post())).status).toBe(200);
    expect(browser.last('request')!.connector.ceiling).toBe('ask');
    expect((await answer(post())).status).toBe(200);
    expect((await post()).status).toBe(429);
    // Idle sweep closes a silent socket; a frame keeps it alive.
    await new Promise((resolve) => setTimeout(resolve, 40));
    service.sweep();
    expect(browser.closed?.reason).toBe('idle');
    const browser2 = connect(device.deviceId);
    const revoked = await app.request(`${issuer}/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${access}` });
    expect(revoked.status).toBe(200);
    const refused = await app.request(`${issuer}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: '{}' });
    expect(refused.status).toBe(401);
    expect(browser2.last('request')).toBeUndefined();
  });

  test('parses device frames strictly', () => {
    expect(parseDeviceFrame('{"type":"pong"}')).toEqual({ type: 'pong' });
    expect(parseDeviceFrame('{"type":"response","id":"a","status":200,"body":"{}","session":"s"}')).toEqual({ type: 'response', id: 'a', status: 200, body: '{}', session: 's' });
    expect(parseDeviceFrame('{"type":"response","id":"a","status":99,"body":"{}"}')).toBeUndefined();
    expect(parseDeviceFrame('{"type":"consent","id":"c","approved":true,"ceiling":"root"}')).toBeUndefined();
    expect(parseDeviceFrame('{"type":"request","id":"x"}')).toBeUndefined();
    expect(parseDeviceFrame('nope')).toBeUndefined();
  });
});
