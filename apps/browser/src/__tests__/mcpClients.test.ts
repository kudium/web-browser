/** @jest-environment node */
import {
  MCPClientRegistry,
  MCP_DEFAULT_CLIENT_ID,
  mcpCappedMode,
  mcpClientCeiling,
  mcpClientName,
} from '../main/mcpClients';

it('normalises client names and ceilings', () => {
  expect(mcpClientName('  Claude\u0000 Code  ')).toBe('Claude Code');
  expect(mcpClientName('', 'Agent')).toBe('Agent');
  expect(mcpClientName('x'.repeat(100))).toHaveLength(60);
  expect(mcpClientCeiling(undefined)).toBeUndefined();
  expect(mcpClientCeiling('')).toBeUndefined();
  expect(mcpClientCeiling('standard')).toBe('standard');
  expect(() => mcpClientCeiling('root')).toThrow('ceiling must be');
});

it('never raises a mode above the ceiling', () => {
  expect(mcpCappedMode('full', 'standard')).toBe('standard');
  expect(mcpCappedMode('ask', 'standard')).toBe('ask');
  expect(mcpCappedMode('full', undefined)).toBe('full');
  expect(mcpCappedMode('standard', 'full')).toBe('standard');
});

it('issues one token per named client, resolves contexts and round-trips through JSON', () => {
  const registry = new MCPClientRegistry();
  const cursor = registry.add('Cursor', 'standard');
  const claude = registry.add('Claude Code');
  expect(cursor.token).toMatch(/^[a-f0-9]{64}$/);
  expect(cursor.token).not.toBe(claude.token);
  expect(registry.tokens()).toEqual([cursor.token, claude.token]);
  expect(registry.context(cursor.token, 'shared')).toEqual({ id: cursor.id, name: 'Cursor', ceiling: 'standard' });
  expect(registry.context(claude.token, 'shared')).toEqual({ id: claude.id, name: 'Claude Code' });
  expect(registry.context('shared', 'shared', 'codex-cli')).toEqual({ id: MCP_DEFAULT_CLIENT_ID, name: 'codex-cli' });
  expect(registry.context('shared', 'shared')).toEqual({ id: MCP_DEFAULT_CLIENT_ID, name: 'Connector' });
  expect(registry.context('other', 'shared')).toBeUndefined();
  registry.setCeiling(MCP_DEFAULT_CLIENT_ID, 'ask');
  registry.setCeiling(claude.id, 'full');
  registry.touch(claude.token, 5);
  const saved = JSON.parse(JSON.stringify(registry.toJSON()));
  expect(saved.clients.map((client: { name: string }) => client.name)).toEqual(['Cursor', 'Claude Code']);
  const restored = MCPClientRegistry.from(saved);
  expect(restored.context('shared', 'shared')?.ceiling).toBe('ask');
  expect(restored.byId(claude.id)).toMatchObject({ ceiling: 'full', lastUsedAt: 5 });
  // Settings never see tokens.
  const listed = restored.list(true);
  expect(listed[0]).toMatchObject({ id: MCP_DEFAULT_CLIENT_ID, shared: true, ceiling: 'ask' });
  expect(JSON.stringify(listed)).not.toContain(cursor.token);
  expect(restored.list(false)).toHaveLength(2);
});

it('revokes one client at a time and ignores corrupt saved records', () => {
  const registry = MCPClientRegistry.from({
    clients: [
      { id: 'a', name: 'Good', token: 'f'.repeat(64), ceiling: 'bogus', createdAt: 1 },
      { id: 'b', name: 'Bad token', token: 'short', createdAt: 1 },
      null,
    ],
    defaultCeiling: 'nope',
  });
  expect(registry.list(false)).toEqual([{ id: 'a', name: 'Good', createdAt: 1 }]);
  expect(registry.defaultCeiling).toBeUndefined();
  expect(registry.revoke('a')).toBe('f'.repeat(64));
  expect(registry.tokens()).toEqual([]);
  expect(() => registry.revoke('a')).toThrow('Unknown client');
  expect(() => registry.setCeiling('zzz', 'ask')).toThrow('Unknown client');
});
