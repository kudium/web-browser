/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import https from 'https';
import net from 'net';
import { execFileSync } from 'child_process';
import { createMCPController } from '../main/mcp';
import { normalizeMCPTunnelURL, mcpTunnelConnection } from '../browser/mcpTunnel';

it('validates advertised HTTPS endpoints without placing credentials in URLs', () => {
  expect(normalizeMCPTunnelURL(' https://tunnel.example/custom/mcp ')).toBe('https://tunnel.example/custom/mcp');
  expect(normalizeMCPTunnelURL('')).toBe('');
  ['http://example.com/mcp', 'example.com', 'https://user:secret@example.com/mcp',
    'https://example.com/mcp?token=secret', 'https://example.com/mcp#secret', 'https://', 123]
    .forEach(url => expect(() => normalizeMCPTunnelURL(url)).toThrow());
});

it('exports the tunnel while keeping local and stdio source configuration intact', () => {
  const local = { mcpServers: { kudiumbrowser: { url: 'http://127.0.0.1:43187/mcp', headers: { Authorization: 'Bearer fixture' } } } };
  expect(mcpTunnelConnection(local, 'https://tunnel.example/mcp').mcpServers.kudiumbrowser).toEqual({
    url: 'https://tunnel.example/mcp', headers: { Authorization: 'Bearer fixture' }
  });
  expect(local.mcpServers.kudiumbrowser.url).toBe('http://127.0.0.1:43187/mcp');
  expect(() => mcpTunnelConnection(local, '')).toThrow('Save an HTTPS tunnel endpoint');
});

it('persists tunnel settings and authenticates through an HTTPS reverse proxy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-tunnel-'));
  const filename = path.join(root, 'mcp.json');
  const reserve = net.createServer();
  await new Promise<void>(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const localPort = (reserve.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  fs.writeFileSync(filename, JSON.stringify({ enabled: false, port: localPort }));
  const stop = jest.fn();
  const create = () => createMCPController({ filename, execute: async () => null, stop, changed: () => {} });
  let controller = create();
  let proxy: https.Server | undefined;
  try {
    const key = path.join(root, 'key.pem');
    const cert = path.join(root, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=localhost', '-keyout', key, '-out', cert], { stdio: 'ignore' });
    const ca = fs.readFileSync(cert);
    let rewriteHost = true;
    proxy = https.createServer({ key: fs.readFileSync(key), cert: ca }, (req, res) => {
      const upstream = http.request({ hostname: '127.0.0.1', port: localPort, path: req.url,
        method: req.method, headers: { ...req.headers, host: rewriteHost ? `127.0.0.1:${localPort}` : 'tunnel.example', connection: 'close' } }, reply => {
        res.writeHead(reply.statusCode || 500, reply.headers);
        reply.pipe(res);
      });
      upstream.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });
    await new Promise<void>(resolve => proxy!.listen(0, '127.0.0.1', resolve));
    const tunnelUrl = `https://localhost:${(proxy.address() as net.AddressInfo).port}/mcp`;
    await controller.update({ enabled: true });
    const local = controller.connection();
    const stopCount = stop.mock.calls.length;
    const saved = await controller.update({ enabled: true, tunnelUrl });
    expect(saved.running).toBe(true);
    expect(saved.url).toBe(local.mcpServers.kudiumbrowser.url);
    expect(stop.mock.calls.length).toBe(stopCount);
    expect(controller.connection()).toEqual(local);
    await expect(controller.update({ enabled: true, tunnelUrl: 'http://invalid.example/mcp' })).rejects.toThrow('Use HTTPS');
    expect(controller.status().tunnelUrl).toBe(tunnelUrl);
    await controller.dispose();
    controller = create();
    await controller.ready;
    expect(controller.status().tunnelUrl).toBe(tunnelUrl);
    expect(controller.connection()).toEqual(local);
    const exported = mcpTunnelConnection(controller.connection(), tunnelUrl).mcpServers.kudiumbrowser;
    const request = (auth?: string, origin?: string) => new Promise<number>((resolve, reject) => {
      const req = https.request(exported.url, { ca, family: 4, method: 'POST', headers: {
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Connection: 'close',
        ...(auth ? { Authorization: auth } : {}), ...(origin ? { Origin: origin } : {})
      } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
      req.on('error', reject);
      req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'tunnel-test', version: '1' }
      } }));
    });
    expect(await request(exported.headers.Authorization)).toBe(200);
    expect(await request()).toBe(401);
    expect(await request(exported.headers.Authorization, 'https://website.example')).toBe(403);
    rewriteHost = false;
    expect(await request(exported.headers.Authorization)).toBe(403);
    rewriteHost = true;
    await controller.update({ enabled: true, rotate: true });
    expect(await request(exported.headers.Authorization)).toBe(401);
    const current = controller.connection();
    expect(await request(current.mcpServers.kudiumbrowser.headers.Authorization)).toBe(200);
    await controller.update({ enabled: true, tunnelUrl: '' });
    expect(controller.status().tunnelUrl).toBeUndefined();
    expect(controller.connection()).toEqual(current);
  } finally {
    await controller.dispose();
    if (proxy) await new Promise<void>(resolve => proxy!.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 20000);
