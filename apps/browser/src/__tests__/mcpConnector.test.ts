/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { createMCPController } from '../main/mcp';

it('requires approval, excludes website origins and revokes connector access', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-pair-'));
  const socket = net.createServer();
  await new Promise<void>((resolve) => {
    socket.listen(0, '127.0.0.1', resolve);
  });
  const { port } = socket.address() as net.AddressInfo;
  await new Promise<void>((resolve) => {
    socket.close(() => resolve());
  });
  const approve = jest.fn().mockResolvedValue(true);
  const controller = createMCPController({
    filename: path.join(root, 'mcp.json'),
    approveConnector: approve,
    execute: async () => null,
    stop: () => {},
    changed: () => {},
  });
  try {
    await controller.update({ enabled: true, port });
    // Rotation restarts the listener; do not reuse a stale HTTP connection.
    const request = (address: string, options: RequestInit) =>
      fetch(address, {
        ...options,
        headers: { ...options.headers, Connection: 'close' },
      });
    const url = `http://127.0.0.1:${port}`;
    expect(
      (
        await request(`${url}/connect`, {
          method: 'POST',
          headers: { Origin: 'https://example.com' },
        })
      ).status
    ).toBe(403);
    expect(approve).not.toHaveBeenCalled();
    const response = await request(`${url}/connect`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(approve).toHaveBeenCalledTimes(1);
    const config = await response.json();
    const headers = {
      ...config.mcpServers.kudiumbrowser.headers,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    expect(
      (await request(`${url}/mcp`, { method: 'POST', headers, body })).status
    ).toBe(200);
    await controller.update({ enabled: true, rotate: true });
    expect(
      (await request(`${url}/mcp`, { method: 'POST', headers, body })).status
    ).toBe(401);
  } finally {
    await controller.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('enables external control by default and retains an explicit disable on restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-default-'));
  const socket = net.createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const { port } = socket.address() as net.AddressInfo;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const filename = path.join(root, 'mcp.json');
  // Use an available port without specifying an enable preference.
  fs.writeFileSync(
    filename,
    JSON.stringify({ port, privateDataDisclosed: false })
  );
  const create = () =>
    createMCPController({
      filename,
      execute: async () => null,
      stop: () => {},
      changed: () => {},
    });
  const controller = create();
  try {
    await controller.ready;
    expect(controller.status()).toMatchObject({ enabled: true, running: true });
    await controller.update({ enabled: false });
    await controller.dispose();
    const restored = create();
    try {
      await restored.ready;
      expect(restored.status()).toMatchObject({
        enabled: false,
        running: false,
      });
    } finally {
      await restored.dispose();
    }
  } finally {
    await controller.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('keeps one MCP session per client, ends it on DELETE and still serves sessionless calls', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-session-'));
  const socket = net.createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const { port } = socket.address() as net.AddressInfo;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const execute = jest.fn(async () => ({ tabs: [] }));
  const controller = createMCPController({
    filename: path.join(root, 'mcp.json'),
    approveConnector: async () => true,
    execute,
    stop: () => {},
    changed: () => {},
  });
  try {
    await controller.update({ enabled: true, port });
    const url = `http://127.0.0.1:${port}/mcp`;
    const token = controller.connection().mcpServers.kudiumbrowser.headers.Authorization;
    // Every body is drained: Node's fetch asserts when a paused response body
    // is still unread as a Connection: close socket ends (a client-side hazard,
    // not a server one), and tools/list is now large enough to pause it.
    const drained = async (request: Promise<Response>) => {
      const response = await request;
      const text = await response.text();
      return { status: response.status, headers: response.headers, json: async () => JSON.parse(text) };
    };
    const post = (body: unknown, session?: string) =>
      drained(
        fetch(url, {
          method: 'POST',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Connection: 'close',
            ...(session ? { 'Mcp-Session-Id': session } : {}),
          },
          body: JSON.stringify(body),
        })
      );
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    };
    const opened = await post(initialize);
    expect(opened.status).toBe(200);
    const session = opened.headers.get('mcp-session-id');
    expect(session).toMatch(/^[0-9a-f-]{36}$/);
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session!);
    const called = await post(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_tabs', arguments: {} },
      },
      session!
    );
    expect(called.status).toBe(200);
    expect((await called.json()).result.content[0].text).toBe('{"tabs":[]}');
    expect(execute).toHaveBeenCalledWith('list_tabs', {}, expect.any(AbortSignal));
    // An unknown or foreign session is refused rather than silently recreated.
    expect((await post({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, 'nope')).status).toBe(404);
    // Older bridges without a session header are still served one request at a time.
    const sessionless = await post({ jsonrpc: '2.0', id: 4, method: 'tools/list' });
    expect(sessionless.status).toBe(200);
    expect(sessionless.headers.get('mcp-session-id')).toBeNull();
    const ended = await drained(
      fetch(url, {
        method: 'DELETE',
        headers: { Authorization: token, 'Mcp-Session-Id': session!, Connection: 'close' },
      })
    );
    expect(ended.status).toBe(200);
    expect((await post({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, session!)).status).toBe(404);
  } finally {
    await controller.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('serves the same MCP endpoint over local https with a name-constrained CA', async () => {
  jest.setTimeout(30000);
  const https = await import('https');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-https-'));
  const socket = net.createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const { port } = socket.address() as net.AddressInfo;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const controller = createMCPController({
    filename: path.join(root, 'mcp.json'),
    approveConnector: async () => true,
    execute: async () => ({ tabs: [] }),
    stop: () => {},
    changed: () => {},
    // No trust-store command exists for this platform here: the CA is
    // generated and proven, trust is reported as manual.
    certificatePlatform: 'linux',
  });
  try {
    const status = await controller.update({ enabled: true, port, https: true });
    expect(status.https).toBe(true);
    expect(status.httpsUrl).toBe(`https://localhost:${port + 1}/mcp`);
    expect(status.caPath).toBe(path.join(root, 'mcp-certificates', 'kudium-local-ca.pem'));
    expect(status.httpsTrusted).toBe(false);
    expect(status.httpsNotice).toContain('NODE_EXTRA_CA_CERTS');
    const caPem = fs.readFileSync(status.caPath!, 'utf8');
    expect(fs.existsSync(path.join(root, 'mcp-certificates', 'kudium-local-ca.key'))).toBe(true);
    const token = controller.connection().mcpServers.kudiumbrowser.headers.Authorization;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    });
    const secure = await new Promise<{ status: number; session: string | null }>((resolve, reject) => {
      const request = https.request(
        {
          host: '127.0.0.1',
          port: port + 1,
          servername: 'localhost',
          path: '/mcp',
          method: 'POST',
          ca: [caPem],
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Connection: 'close',
          },
        },
        (response) => {
          response.resume();
          response.on('end', () =>
            resolve({ status: response.statusCode || 0, session: response.headers['mcp-session-id'] as string | null })
          );
        }
      );
      request.on('error', reject);
      request.end(body);
    });
    expect(secure.status).toBe(200);
    expect(secure.session).toMatch(/^[0-9a-f-]{36}$/);
    // Without the CA the client refuses the connection: nothing else trusts this key.
    await expect(
      new Promise((resolve, reject) => {
        const request = https.request(
          { host: '127.0.0.1', port: port + 1, servername: 'localhost', path: '/mcp', method: 'POST' },
          resolve
        );
        request.on('error', reject);
        request.end(body);
      })
    ).rejects.toThrow();
    // The /connect pairing response advertises the https endpoint and the public CA.
    const paired = await fetch(`http://127.0.0.1:${port}/connect`, { method: 'POST', headers: { Connection: 'close' } });
    const pairing = await paired.json();
    expect(pairing.httpsUrl).toBe(status.httpsUrl);
    expect(pairing.caPem).toBe(caPem);
    expect(pairing.caPem).not.toContain('PRIVATE KEY');
    // Plain http keeps working, and turning https off removes the listener.
    const plain = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Connection: 'close' }, body });
    // Drain before the listeners restart, or the unread body resets the client socket.
    await plain.text();
    expect(plain.status).toBe(200);
    const off = await controller.update({ enabled: true, port, https: false });
    expect(off.https).toBe(false);
    expect(off.httpsUrl).toBeUndefined();
  } finally {
    await controller.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('pairs a named client with its own token, hands its identity and ceiling to the engine, and revokes it alone', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-mcp-clients-'));
  const socket = net.createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const { port } = socket.address() as net.AddressInfo;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const execute = jest.fn(async () => ({ tabs: [] }));
  const approve = jest.fn(async () => true);
  const controller = createMCPController({
    filename: path.join(root, 'mcp.json'),
    approveConnector: approve,
    execute,
    stop: () => {},
    changed: () => {},
  });
  try {
    await controller.update({ enabled: true, port });
    const drained = async (request: Promise<Response>) => {
      const response = await request;
      const text = await response.text();
      return { status: response.status, headers: response.headers, json: async () => JSON.parse(text) };
    };
    const pair = (body?: unknown) =>
      drained(
        fetch(`http://127.0.0.1:${port}/connect`, {
          method: 'POST',
          headers: { Connection: 'close', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
      );
    const named = await pair({ name: ' Cursor ' });
    expect(named.status).toBe(200);
    expect(approve).toHaveBeenLastCalledWith('Cursor');
    const cursorToken = (await named.json()).mcpServers.kudiumbrowser.headers.Authorization as string;
    const shared = controller.connection().mcpServers.kudiumbrowser.headers.Authorization;
    expect(cursorToken).not.toBe(shared);
    const clients = controller.clients();
    expect(clients).toEqual([expect.objectContaining({ name: 'Cursor' })]);
    expect(clients[0].shared).toBeUndefined();
    expect(JSON.stringify(clients)).not.toContain(cursorToken.replace('Bearer ', ''));
    controller.setClientCeiling(clients[0].id, 'standard');
    const call = (token: string, id: number) =>
      drained(
        fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Connection: 'close',
          },
          body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'list_tabs', arguments: {} } }),
        })
      );
    expect((await call(cursorToken, 1)).status).toBe(200);
    expect(execute).toHaveBeenLastCalledWith('list_tabs', {}, expect.any(AbortSignal), {
      client: { id: clients[0].id, name: 'Cursor', ceiling: 'standard' },
    });
    // The in-app token keeps working and carries no client identity.
    expect((await call(shared, 2)).status).toBe(200);
    expect(execute).toHaveBeenLastCalledWith('list_tabs', {}, expect.any(AbortSignal));
    const initialize = await drained(
      fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { Authorization: cursorToken, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Connection: 'close' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cursor-mcp', version: '1' } } }),
      })
    );
    expect((await initialize.json()).result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
    // Revoking one client leaves the others untouched.
    controller.revokeClient(clients[0].id);
    expect(controller.clients()).toEqual([]);
    expect((await call(cursorToken, 4)).status).toBe(401);
    expect((await call(shared, 5)).status).toBe(200);
    // Persisted: a restarted controller still knows named clients and ceilings.
    // (/connect refuses a second pairing inside its 5-second cooldown.)
    await new Promise((resolve) => {
      setTimeout(resolve, 5100);
    });
    const again = await pair({ name: 'Claude Code' });
    expect(again.status).toBe(200);
    const claudeToken = (await again.json()).mcpServers.kudiumbrowser.headers.Authorization as string;
    controller.setClientCeiling(controller.clients()[0].id, 'ask');
    await controller.dispose();
    const restored = createMCPController({ filename: path.join(root, 'mcp.json'), execute, stop: () => {}, changed: () => {} });
    try {
      await restored.ready;
      expect(restored.clients()).toEqual([expect.objectContaining({ name: 'Claude Code', ceiling: 'ask' })]);
      await restored.update({ enabled: true, port });
      expect((await call(claudeToken, 6)).status).toBe(200);
      expect(execute).toHaveBeenLastCalledWith('list_tabs', {}, expect.any(AbortSignal), {
        client: expect.objectContaining({ name: 'Claude Code', ceiling: 'ask' }),
      });
    } finally {
      await restored.dispose();
    }
  } finally {
    await controller.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
