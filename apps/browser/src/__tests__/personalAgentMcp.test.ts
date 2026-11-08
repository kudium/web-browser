/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMCPController } from '../main/mcp';
import type { MCPConnection } from '../browser/mcp';

let root: string;
let controller: ReturnType<typeof createMCPController>;
let clients: Client[];
const connect = async (connection: MCPConnection) => {
  const client = new Client({ name: 'personal-agent-fixture', version: '1' });
  clients.push(client);
  const entry = connection.mcpServers.touchbox;
  await client.connect(
    new StreamableHTTPClientTransport(new URL(entry.url), {
      requestInit: { headers: entry.headers },
    })
  );
  return client;
};
const call = (client: Client) =>
  client.callTool({ name: 'list_tabs', arguments: {} });
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-agent-mcp-'));
  clients = [];
  controller = createMCPController({
    filename: path.join(root, 'mcp.json'),
    execute: async () => [{ id: 'fixture-page' }],
    stop: () => {},
    changed: () => {},
  });
  const reserve = net.createServer();
  await new Promise<void>((resolve) => {
    reserve.listen(0, '127.0.0.1', resolve);
  });
  const { port } = reserve.address() as net.AddressInfo;
  await new Promise<void>((resolve) => {
    reserve.close(() => resolve());
  });
  await controller.update({ enabled: true, port });
});
afterEach(async () => {
  await Promise.allSettled(clients.map((client) => client.close()));
  await controller.dispose();
  fs.rmSync(root, { recursive: true, force: true });
});

it('uses separate credentials and revokes one agent without invalidating the other or manual clients', async () => {
  const hermesConfig = controller.agentConnection('hermes', true)!;
  const openclawConfig = controller.agentConnection('openclaw', true)!;
  expect(hermesConfig.mcpServers.touchbox.headers.Authorization).not.toBe(
    openclawConfig.mcpServers.touchbox.headers.Authorization
  );
  const hermes = await connect(hermesConfig);
  const openclaw = await connect(openclawConfig);
  const manual = await connect(controller.connection());
  expect((await call(hermes)).isError).toBeUndefined();
  controller.revokeAgent('hermes');
  await expect(call(hermes)).rejects.toThrow();
  expect((await call(openclaw)).isError).toBeUndefined();
  expect((await call(manual)).isError).toBeUndefined();
  expect(controller.agentConnection('hermes')).toBeUndefined();
  expect(JSON.stringify(controller.status())).not.toContain('Bearer');
});

it('persists agent grants across restart and invalidates all of them on reset', async () => {
  const config = controller.agentConnection('hermes', true)!;
  const status = controller.status();
  await controller.dispose();
  controller = createMCPController({
    filename: path.join(root, 'mcp.json'),
    execute: async () => [],
    stop: () => {},
    changed: () => {},
  });
  await controller.ready;
  expect(controller.agentConnection('hermes')).toEqual(config);
  const client = await connect(config);
  await controller.update({ enabled: true, port: status.port, rotate: true });
  await expect(call(client)).rejects.toThrow();
  expect(controller.agentConnection('hermes')).toBeUndefined();
});

it('aborts in-flight work for a disconnected agent and refuses unknown identities', async () => {
  const filename = path.join(root, 'mcp.json');
  await controller.dispose();
  let started!: () => void;
  const pendingStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let actionSignal: AbortSignal | undefined;
  controller = createMCPController({
    filename,
    execute: async (name, _args, signal) => {
      if (name !== 'read_page') return [];
      actionSignal = signal;
      started();
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Cancelled')), {
          once: true,
        });
      });
    },
    stop: () => {},
    changed: () => {},
  });
  await controller.ready;
  const hermes = await connect(controller.agentConnection('hermes', true)!);
  const pending = hermes.callTool({ name: 'read_page', arguments: {} }).then(
    () => false,
    () => true
  );
  await pendingStarted;
  controller.revokeAgent('hermes');
  expect(actionSignal?.aborted).toBe(true);
  expect(await pending).toBe(true);
  expect(() => controller.agentConnection('other' as any, true)).toThrow(
    'Unknown'
  );
});
