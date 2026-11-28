/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { EventEmitter } from 'events';
import {
  lowerCeiling,
  parseQuickTunnelURL,
  parseRelayFrame,
  relaySocketURL,
  validRelayCommand,
  validRelayURL,
} from '../browser/mcpRelay';
import { generateRelayDeviceKeys, openRelayPayload, sealRelayPayload } from '../main/mcpRelayCrypto';
import {
  RELAY_CONNECTOR_HEADER,
  RelaySocketLike,
  createMCPRelayClient,
  parseRelayConnectorHeader,
} from '../main/mcpRelay';

it('parses relay frames strictly', () => {
  expect(parseRelayFrame(JSON.stringify({ type: 'ping' }))).toEqual({ type: 'ping' });
  expect(
    parseRelayFrame(
      JSON.stringify({ type: 'hello', version: 1, deviceId: 'd1', urls: { path: 'https://r/relay/d/d1/mcp' }, pingIntervalMs: 20000, idleTimeoutMs: 1800000 })
    )
  ).toMatchObject({ type: 'hello', deviceId: 'd1' });
  expect(parseRelayFrame(JSON.stringify({ type: 'hello', version: 2, deviceId: 'd1', urls: { path: 'x' }, pingIntervalMs: 1, idleTimeoutMs: 1 }))).toBeUndefined();
  const request = { type: 'request', id: 'r1', method: 'POST', body: '{}', connector: { id: 'c1', name: 'Claude', ceiling: 'standard' } };
  expect(parseRelayFrame(JSON.stringify(request))).toEqual(request);
  expect(parseRelayFrame(JSON.stringify({ ...request, connector: { ...request.connector, ceiling: 'root' } }))).toBeUndefined();
  expect(parseRelayFrame(JSON.stringify({ ...request, method: 'GET' }))).toBeUndefined();
  expect(parseRelayFrame(JSON.stringify({ ...request, body: 'x'.repeat(1024 * 1024 + 1) }))).toBeUndefined();
  expect(parseRelayFrame(JSON.stringify({ type: 'consent', id: 'k', client: { clientId: 'a', name: 'Bot', redirectUri: 'https://x.test/cb', scope: 'mcp' } }))).toMatchObject({ type: 'consent' });
  expect(parseRelayFrame('nope')).toBeUndefined();
  expect(parseRelayFrame(JSON.stringify({ type: 'e2e', payload: 'abc' }))).toEqual({ type: 'e2e', payload: 'abc' });
});

it('validates relay URLs, tokens, commands and the connector header', () => {
  expect(validRelayURL('https://relay.kudium.com/')).toBe('https://relay.kudium.com');
  expect(validRelayURL('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
  expect(() => validRelayURL('http://relay.kudium.com')).toThrow('https');
  expect(() => validRelayURL('https://u:p@relay.kudium.com')).toThrow('plain');
  expect(relaySocketURL('https://relay.kudium.com')).toBe('wss://relay.kudium.com/relay/device');
  expect(validRelayCommand({ action: 'pair', relayUrl: 'https://r.test', deviceToken: 'kd_abcdefghijklmnopqrstuvwxyz' })).toEqual({
    action: 'pair',
    relayUrl: 'https://r.test',
    deviceToken: 'kd_abcdefghijklmnopqrstuvwxyz',
  });
  expect(() => validRelayCommand({ action: 'pair', relayUrl: 'https://r.test', deviceToken: 'kr_short' })).toThrow('kd_');
  expect(() => validRelayCommand({ action: 'ceiling', connectorId: 'c', ceiling: 'root' })).toThrow('ask, standard or full');
  expect(() => validRelayCommand({ action: 'nope' })).toThrow('Unknown');
  expect(lowerCeiling('full', 'standard')).toBe('standard');
  expect(lowerCeiling('ask', 'full')).toBe('ask');
  expect(parseRelayConnectorHeader(JSON.stringify({ id: 'c1', name: 'Claude', ceiling: 'standard', projectTools: false }))).toEqual({
    id: 'c1',
    name: 'Claude',
    ceiling: 'standard',
    projectTools: false,
    remote: true,
  });
  expect(parseRelayConnectorHeader(JSON.stringify({ id: 'c1', name: 'Claude', ceiling: 'god' }))).toBeUndefined();
  expect(parseRelayConnectorHeader(undefined)).toBeUndefined();
  expect(parseQuickTunnelURL('2026-11-26 INF |  https://quiet-sun-1234.trycloudflare.com  |')).toBe('https://quiet-sun-1234.trycloudflare.com');
  expect(parseQuickTunnelURL('Thank you for trying Cloudflare Tunnel.')).toBeUndefined();
});

it('seals and opens e2e envelopes, rejecting tampering and wrong keys', () => {
  const device = generateRelayDeviceKeys();
  const { payload, ephemeral } = sealRelayPayload(device.publicKey, '{"type":"request","id":"1"}');
  const opened = openRelayPayload(device.privateKey, payload);
  expect(opened.plaintext).toBe('{"type":"request","id":"1"}');
  expect(opened.senderPublicKey).toBe(ephemeral.publicKey);
  // The response is sealed back to the sender's ephemeral key.
  const back = sealRelayPayload(opened.senderPublicKey, 'pong');
  expect(openRelayPayload(ephemeral.privateKey, back.payload).plaintext).toBe('pong');
  const other = generateRelayDeviceKeys();
  expect(() => openRelayPayload(other.privateKey, payload)).toThrow('could not be opened');
  const envelope = JSON.parse(Buffer.from(payload, 'base64').toString());
  envelope.ct = Buffer.from('tampered').toString('base64');
  expect(() => openRelayPayload(device.privateKey, Buffer.from(JSON.stringify(envelope)).toString('base64'))).toThrow('could not be opened');
  expect(() => openRelayPayload(device.privateKey, 'zzz')).toThrow('Malformed');
});

class FakeSocket extends EventEmitter implements RelaySocketLike {
  sent: string[] = [];
  closed?: { code?: number; reason?: string };
  onopen: RelaySocketLike['onopen'] = null;
  onmessage: RelaySocketLike['onmessage'] = null;
  onclose: RelaySocketLike['onclose'] = null;
  onerror: RelaySocketLike['onerror'] = null;
  constructor(public url: string, public headers: Record<string, string>) {
    super();
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  open() {
    this.onopen?.({});
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  drop(code?: number) {
    this.onclose?.({ code });
  }
  frames() {
    return this.sent.map((text) => JSON.parse(text));
  }
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness(initial?: Record<string, unknown>, createDevice?: () => Promise<{ relayUrl: string; deviceId: string; deviceToken: string }>, fetchOverride?: typeof fetch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-relay-'));
  const filename = path.join(root, 'mcp-relay.json');
  if (initial) fs.writeFileSync(filename, JSON.stringify(initial));
  const sockets: FakeSocket[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  const consents: { name: string; redirectHost: string }[] = [];
  const statuses: unknown[] = [];
  let endpointEnabled = true;
  const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    const body = typeof init.body === 'string' ? init.body : '';
    const headers = new Headers();
    headers.set('content-type', 'application/json');
    if (body.includes('"initialize"')) headers.set('mcp-session-id', 'sess-1');
    if (init.method === 'DELETE') return new Response('', { status: 200, headers });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { echo: body.length } }), { status: 200, headers });
  }) as unknown as typeof fetch;
  const client = createMCPRelayClient({
    filename,
    endpoint: () => (endpointEnabled ? { url: 'http://127.0.0.1:43187/mcp', token: 'local-token', port: 43187 } : undefined),
    approveConsent: async (clientInfo) => {
      consents.push(clientInfo);
      return { approved: clientInfo.name !== 'Denied', name: `${clientInfo.name}!`, ceiling: 'full' };
    },
    changed: (status) => statuses.push(status),
    createSocket: (url, headers) => {
      const socket = new FakeSocket(url, headers);
      sockets.push(socket);
      return socket;
    },
    fetchImpl: fetchOverride || fetchImpl,
    createDevice,
    reconnectDelay: () => 10,
    cloudflaredPath: () => undefined,
  });
  return {
    client,
    sockets,
    requests,
    consents,
    statuses,
    filename,
    setEndpoint: (enabled: boolean) => {
      endpointEnabled = enabled;
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

it('starts off, pairs with a device token, connects and answers hello/ping', async () => {
  const h = harness();
  try {
    expect(h.client.status()).toMatchObject({ enabled: false, paired: false, connected: false });
    expect(h.sockets).toHaveLength(0);
    await h.client.command({ action: 'pair', relayUrl: 'https://relay.test', deviceToken: 'kd_0123456789abcdefghij' });
    expect(h.sockets).toHaveLength(1);
    expect(h.sockets[0].url).toBe('wss://relay.test/relay/device');
    expect(h.sockets[0].headers.Authorization).toBe('Bearer kd_0123456789abcdefghij');
    const saved = JSON.parse(fs.readFileSync(h.filename, 'utf8'));
    expect(saved).toMatchObject({ enabled: true, deviceToken: 'kd_0123456789abcdefghij' });
    expect(saved.keys.privateKey).toMatch(/^[A-Za-z0-9+/=]+$/);
    h.sockets[0].open();
    h.sockets[0].receive({ type: 'hello', version: 1, deviceId: 'dev-1', urls: { path: 'https://relay.test/relay/d/dev-1/mcp' }, pingIntervalMs: 20000, idleTimeoutMs: 1800000 });
    await flush();
    expect(h.client.status()).toMatchObject({ connected: true, deviceId: 'dev-1', urls: { path: 'https://relay.test/relay/d/dev-1/mcp' } });
    h.sockets[0].receive({ type: 'ping' });
    expect(h.sockets[0].frames()).toEqual([{ type: 'pong' }]);
  } finally {
    await h.client.dispose();
    h.cleanup();
  }
});

it('replays requests over loopback with the connector header, clamps the ceiling, tracks sessions and ends them on drop', async () => {
  const h = harness({ enabled: true, relayUrl: 'https://relay.test', deviceToken: 'kd_0123456789abcdefghij', connectors: {}, allowProjectTools: false });
  try {
    await h.client.mcpChanged(true);
    const socket = h.sockets[0];
    socket.open();
    socket.receive({
      type: 'request',
      id: 'r1',
      method: 'POST',
      body: '{"jsonrpc":"2.0","id":1,"method":"initialize"}',
      connector: { id: 'c1', name: 'Claude', ceiling: 'full' },
    });
    await flush();
    const [first] = h.requests;
    expect(first.url).toBe('http://127.0.0.1:43187/mcp');
    expect((first.init.headers as Record<string, string>).Authorization).toBe('Bearer local-token');
    // The relay's "full" claim is clamped to the remote default (Standard) for a new connector.
    expect(JSON.parse((first.init.headers as Record<string, string>)[RELAY_CONNECTOR_HEADER])).toEqual({
      id: 'c1',
      name: 'Claude',
      ceiling: 'standard',
      projectTools: false,
    });
    expect(socket.frames()[0]).toMatchObject({ type: 'response', id: 'r1', status: 200, session: 'sess-1' });
    expect(h.client.sessions().get('c1')).toEqual(['sess-1']);
    expect(h.client.status().connectors).toEqual([expect.objectContaining({ id: 'c1', name: 'Claude', ceiling: 'standard', requests: 1 })]);
    // Lowering the ceiling applies to the next request; raising above the relay claim does not exceed it.
    await h.client.command({ action: 'ceiling', connectorId: 'c1', ceiling: 'ask' });
    socket.receive({ type: 'request', id: 'r2', method: 'POST', session: 'sess-1', body: '{"jsonrpc":"2.0","id":2,"method":"tools/list"}', connector: { id: 'c1', name: 'Claude', ceiling: 'standard' } });
    await flush();
    const second = h.requests.find((entry) => (entry.init.headers as Record<string, string>)['Mcp-Session-Id'] === 'sess-1' && entry.init.method === 'POST');
    expect(JSON.parse((second!.init.headers as Record<string, string>)[RELAY_CONNECTOR_HEADER]).ceiling).toBe('ask');
    // Dropping the socket ends the relay sessions locally within the same tick.
    const before = Date.now();
    socket.drop();
    await flush();
    const deletes = h.requests.filter((entry) => entry.init.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect((deletes[0].init.headers as Record<string, string>)['Mcp-Session-Id']).toBe('sess-1');
    expect(Date.now() - before).toBeLessThan(2000);
    expect(h.client.sessions().size).toBe(0);
    // And it reconnects with backoff.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(h.sockets).toHaveLength(2);
  } finally {
    await h.client.dispose();
    h.cleanup();
  }
});

it('answers consent through the approval dialog, never above the human’s choice, and denies on cancel', async () => {
  const h = harness({ enabled: true, relayUrl: 'https://relay.test', deviceToken: 'kd_0123456789abcdefghij', connectors: {}, allowProjectTools: false });
  try {
    await h.client.mcpChanged(true);
    const socket = h.sockets[0];
    socket.open();
    socket.receive({ type: 'consent', id: 'k1', client: { clientId: 'x', name: 'Claude', redirectUri: 'https://claude.ai/api/mcp/callback', scope: 'mcp' } });
    socket.receive({ type: 'consent', id: 'k2', client: { clientId: 'y', name: 'Denied', redirectUri: 'https://evil.test/cb', scope: 'mcp' } });
    await flush();
    expect(h.consents).toEqual([
      { name: 'Claude', redirectHost: 'claude.ai', scope: 'mcp' },
      { name: 'Denied', redirectHost: 'evil.test', scope: 'mcp' },
    ]);
    expect(socket.frames()).toEqual([
      { type: 'consent', id: 'k1', approved: true, name: 'Claude!', ceiling: 'full' },
      { type: 'consent', id: 'k2', approved: false },
    ]);
  } finally {
    await h.client.dispose();
    h.cleanup();
  }
});

it('turns everything off within the call when external control or the relay is disabled, and refuses while off', async () => {
  const h = harness({ enabled: true, relayUrl: 'https://relay.test', deviceToken: 'kd_0123456789abcdefghij', connectors: {}, allowProjectTools: false });
  try {
    await h.client.mcpChanged(true);
    const socket = h.sockets[0];
    socket.open();
    socket.receive({ type: 'request', id: 'r1', method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"initialize"}', connector: { id: 'c1', name: 'Claude', ceiling: 'standard' } });
    await flush();
    expect(h.client.sessions().get('c1')).toEqual(['sess-1']);
    const started = Date.now();
    await h.client.mcpChanged(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(socket.closed?.code).toBe(1000);
    expect(h.client.status().connected).toBe(false);
    expect(h.requests.filter((entry) => entry.init.method === 'DELETE')).toHaveLength(1);
    // Turning the relay itself off persists and makes no loopback call
    // (the relay is told only once a hello named the device).
    h.setEndpoint(false);
    const count = h.requests.length;
    await h.client.command({ action: 'enable', enabled: false });
    expect(h.client.status()).toMatchObject({ enabled: false, connected: false, paired: true });
    expect(JSON.parse(fs.readFileSync(h.filename, 'utf8')).enabled).toBe(false);
    expect(h.requests.length).toBe(count);
    // Enabling again while external control is off waits instead of connecting.
    await h.client.command({ action: 'enable', enabled: true });
    expect(h.sockets).toHaveLength(1);
  } finally {
    await h.client.dispose();
    h.cleanup();
  }
});

it('opens e2e envelopes from Kudium clients and seals responses back to the sender', async () => {
  const h = harness({ enabled: true, relayUrl: 'https://relay.test', deviceToken: 'kd_0123456789abcdefghij', connectors: {}, allowProjectTools: false });
  try {
    await h.client.mcpChanged(true);
    const socket = h.sockets[0];
    socket.open();
    const { devicePublicKey } = h.client.status();
    const inner = { type: 'request', id: 'e1', method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}', connector: { id: 'k1', name: 'Kudium CLI', ceiling: 'standard' } };
    const { payload, ephemeral } = sealRelayPayload(devicePublicKey!, JSON.stringify(inner));
    socket.receive({ type: 'e2e', payload });
    await flush();
    const [frame] = socket.frames();
    expect(frame.type).toBe('e2e');
    const response = JSON.parse(openRelayPayload(ephemeral.privateKey, frame.payload).plaintext);
    expect(response).toMatchObject({ type: 'response', id: 'e1', status: 200 });
    expect(h.requests).toHaveLength(1);
    // Garbage envelopes are ignored, never answered in plaintext.
    socket.receive({ type: 'e2e', payload: 'not-an-envelope' });
    await flush();
    expect(socket.frames()).toHaveLength(1);
  } finally {
    await h.client.dispose();
    h.cleanup();
  }
});

it('runs the quick tunnel only from an installed cloudflared and reports its URL', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-relay-tunnel-'));
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; stdout: EventEmitter; kill: jest.Mock };
  child.stderr = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = jest.fn();
  const spawnImpl = jest.fn(() => child);
  const statuses: unknown[] = [];
  const client = createMCPRelayClient({
    filename: path.join(root, 'relay.json'),
    endpoint: () => ({ url: 'http://127.0.0.1:43187/mcp', token: 't', port: 43187 }),
    approveConsent: async () => ({ approved: false }),
    changed: (status) => statuses.push(status),
    createSocket: () => {
      throw new Error('unused');
    },
    spawnImpl: spawnImpl as unknown as typeof import('child_process').spawn,
    cloudflaredPath: () => '/opt/homebrew/bin/cloudflared',
  });
  try {
    const started = await client.command({ action: 'quickTunnel', running: true });
    expect(spawnImpl).toHaveBeenCalledWith('/opt/homebrew/bin/cloudflared', ['--no-autoupdate', 'tunnel', '--config', process.platform === 'win32' ? 'NUL' : '/dev/null', '--url', 'http://127.0.0.1:43187', '--protocol', 'http2', '--http-host-header', '127.0.0.1:43187'], expect.anything());
    expect(started.quickTunnel).toMatchObject({ running: true, available: true });
    child.stderr.emit('data', Buffer.from('INF +----+\nINF |  https://brave-fox-42.trycloudflare.com  |\n'));
    expect(client.status().quickTunnel).toMatchObject({ url: 'https://brave-fox-42.trycloudflare.com', ready: false });
    child.stderr.emit('data', 'Registered tunnel connection connIndex=0');
    expect(client.status().quickTunnel.ready).toBe(true);
    await client.command({ action: 'quickTunnel', running: false });
    expect(child.kill).toHaveBeenCalled();
    expect(client.status().quickTunnel.running).toBe(false);
    const none = createMCPRelayClient({
      filename: path.join(root, 'relay2.json'),
      endpoint: () => ({ url: 'http://127.0.0.1:43187/mcp', token: 't', port: 43187 }),
      approveConsent: async () => ({ approved: false }),
      changed: () => {},
      cloudflaredPath: () => undefined,
    });
    await expect(none.command({ action: 'quickTunnel', running: true })).rejects.toThrow('not installed');
    await none.dispose();
  } finally {
    await client.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('routes a relayed request through the real MCP server with the connector reaching execute', async () => {
  const { createMCPController } = await import('../main/mcp');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-relay-mcp-'));
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as net.AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const contexts: unknown[] = [];
  const controller = createMCPController({
    filename: path.join(root, 'mcp.json'),
    approveConnector: async () => true,
    execute: async (_name, _args, _signal, context) => {
      contexts.push(context);
      return { tabs: [] };
    },
    stop: () => {},
    changed: () => {},
  });
  const sockets: FakeSocket[] = [];
  const relay = createMCPRelayClient({
    filename: path.join(root, 'relay.json'),
    endpoint: () => {
      const status = controller.status();
      return { url: status.url, token: controller.connection().mcpServers.kudiumbrowser.headers.Authorization.replace(/^Bearer /, ''), port: status.port };
    },
    approveConsent: async () => ({ approved: false }),
    changed: () => {},
    createSocket: (url, headers) => {
      const socket = new FakeSocket(url, headers);
      sockets.push(socket);
      return socket;
    },
    cloudflaredPath: () => undefined,
  });
  try {
    await controller.update({ enabled: true, port });
    await relay.command({ action: 'pair', relayUrl: 'https://relay.test', deviceToken: 'kd_0123456789abcdefghij' });
    const socket = sockets[0];
    socket.open();
    const connector = { id: 'c9', name: 'Claude', ceiling: 'standard' as const };
    socket.receive({
      type: 'request',
      id: 'i1',
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'claude', version: '1' } } }),
      connector,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const [initialized] = socket.frames();
    expect(initialized).toMatchObject({ type: 'response', id: 'i1', status: 200 });
    expect(initialized.session).toMatch(/^[0-9a-f-]{36}$/);
    socket.receive({ type: 'request', id: 'n1', method: 'POST', session: initialized.session, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), connector });
    socket.receive({ type: 'request', id: 'c1', method: 'POST', session: initialized.session, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_tabs', arguments: {} } }), connector });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const call = socket.frames().find((frame) => frame.id === 'c1');
    expect(call).toMatchObject({ status: 200 });
    expect(JSON.parse(call.body).result.content[0].text).toBe('{"tabs":[]}');
    expect(contexts).toEqual([{ connector: { id: 'c9', name: 'Claude', ceiling: 'standard', projectTools: false, remote: true } }]);
    // Dropping the socket ends the relayed MCP session on the server.
    socket.drop();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const probeResponse = await fetch(controller.status().url, {
      method: 'POST',
      headers: { Authorization: controller.connection().mcpServers.kudiumbrowser.headers.Authorization, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Mcp-Session-Id': initialized.session, Connection: 'close' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
    });
    await probeResponse.text();
    expect(probeResponse.status).toBe(404);
  } finally {
    await relay.dispose();
    await controller.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});


it('pairs through the native account creator without returning the device credential to the renderer', async () => {
  const create = jest.fn(async () => ({ relayUrl: 'https://browser.kudium.com', deviceId: 'abcdefghijklmnop', deviceToken: 'kd_abcdefghijklmnopqrstuvwxyz' }));
  const h = harness(undefined, create);
  try {
    const result = await h.client.command({ action: 'connect' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ paired: true, enabled: true, deviceId: 'abcdefghijklmnop' });
    expect(JSON.stringify(result)).not.toContain('kd_abcdefghijklmnopqrstuvwxyz');
    expect(h.requests[0]).toMatchObject({ url: 'https://browser.kudium.com/relay/devices/abcdefghijklmnop/enabled', init: { method: 'POST', body: '{"enabled":true}' } });
    expect(h.sockets[0].url).toBe('wss://browser.kudium.com/relay/device');
    expect(fs.statSync(h.filename).mode & 0o777).toBe(0o600);
  } finally { await h.client.dispose(); h.cleanup(); }
});

it('ignores an account pairing result after external control is switched off', async () => {
  let release!: (value: { relayUrl: string; deviceId: string; deviceToken: string }) => void;
  const h = harness(undefined, () => new Promise((resolve) => { release = resolve; }));
  try {
    const work = h.client.command({ action: 'connect' });
    await expect(h.client.command({ action: 'connect' })).rejects.toThrow('already in progress');
    h.setEndpoint(false);
    await h.client.mcpChanged(false);
    release({ relayUrl: 'https://browser.kudium.com', deviceId: 'abcdefghijklmnop', deviceToken: 'kd_abcdefghijklmnopqrstuvwxyz' });
    await expect(work).rejects.toThrow('turned off');
    expect(h.client.status()).toMatchObject({ enabled: false, paired: false });
    expect(h.requests).toHaveLength(0);
    expect(h.sockets).toHaveLength(0);
  } finally { await h.client.dispose(); h.cleanup(); }
});

it('bounds tunnel startup, preserves exit failures and ignores old process output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-tunnel-fail-'));
  const children: Array<EventEmitter & { stderr: EventEmitter; stdout: EventEmitter; kill: jest.Mock }> = [];
  const client = createMCPRelayClient({
    filename: path.join(root, 'relay.json'),
    endpoint: () => ({ url: 'http://127.0.0.1:43187/mcp', token: 't', port: 43187 }),
    approveConsent: async () => ({ approved: false }), changed: () => {},
    cloudflaredPath: () => '/fixture/cloudflared', tunnelStartTimeoutMs: 10,
    spawnImpl: (() => {
      const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), stdout: new EventEmitter(), kill: jest.fn() });
      children.push(child); return child;
    }) as unknown as typeof import('child_process').spawn,
  });
  try {
    await client.command({ action: 'quickTunnel', running: true });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(client.status().quickTunnel).toMatchObject({ running: false, ready: false, error: expect.stringContaining('45 seconds') });
    expect(children[0].kill).toHaveBeenCalled();
    await client.command({ action: 'quickTunnel', running: true });
    children[0].stderr.emit('data', 'https://stale.trycloudflare.com Registered tunnel connection');
    expect(client.status().quickTunnel.url).toBeUndefined();
    children[1].stderr.emit('data', 'https://fresh.trycloud');
    children[1].stderr.emit('data', 'flare.com Registered tunnel connection');
    expect(client.status().quickTunnel).toMatchObject({ ready: true, url: 'https://fresh.trycloudflare.com' });
    children[1].stderr.emit('data', '\nERR connection failed token=fixture-secret\n');
    children[1].emit('exit', 1);
    expect(client.status().quickTunnel).toMatchObject({ running: false, error: expect.stringContaining('connection failed') });
    expect(client.status().quickTunnel.error).not.toContain('fixture-secret');
  } finally { await client.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});


it('keeps relay disabled when activating the new device fails', async () => {
  const h = harness(undefined, async () => ({ relayUrl: 'https://browser.kudium.com', deviceId: 'abcdefghijklmnop', deviceToken: 'kd_abcdefghijklmnopqrstuvwxyz' }), (async () => new Response('{}', { status: 503 })) as typeof fetch);
  try {
    await expect(h.client.command({ action: 'connect' })).rejects.toThrow('503');
    expect(h.client.status()).toMatchObject({ enabled: false, paired: true });
    expect(JSON.parse(fs.readFileSync(h.filename, 'utf8')).enabled).toBe(false);
    expect(h.sockets).toHaveLength(0);
  } finally { await h.client.dispose(); h.cleanup(); }
});

it('disables the remote device if external control turns off during activation', async () => {
  let release!: (value: Response) => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { started = resolve; });
  const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => {
    if (init.body === '{"enabled":true}') { started(); return new Promise<Response>((resolve) => { release = resolve; }); }
    return new Response('{}');
  });
  const h = harness(undefined, async () => ({ relayUrl: 'https://browser.kudium.com', deviceId: 'abcdefghijklmnop', deviceToken: 'kd_abcdefghijklmnopqrstuvwxyz' }), fetchImpl as unknown as typeof fetch);
  try {
    const work = h.client.command({ action: 'connect' });
    await waiting;
    h.setEndpoint(false);
    await h.client.mcpChanged(false);
    release(new Response('{}'));
    await expect(work).rejects.toThrow('turned off');
    expect(fetchImpl).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ body: '{"enabled":false}' }));
    expect(h.client.status().enabled).toBe(false);
    expect(h.sockets).toHaveLength(0);
  } finally { await h.client.dispose(); h.cleanup(); }
});
