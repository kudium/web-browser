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
