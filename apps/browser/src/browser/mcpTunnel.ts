import type { MCPConnection } from './mcp';

/** A tunnel URL is an advertised endpoint, never a listener or credential. */
export function normalizeMCPTunnelURL(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048)
    throw new Error('Enter a full HTTPS MCP endpoint, or leave it empty.');
  if (!value.trim()) return '';
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a full HTTPS MCP endpoint.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash)
    throw new Error('Use HTTPS without credentials, query parameters or a fragment.');
  return url.href;
}
export function mcpTunnelConnection(connection: MCPConnection, endpoint: string): MCPConnection {
  const url = normalizeMCPTunnelURL(endpoint);
  if (!url) throw new Error('Save an HTTPS tunnel endpoint before copying its configuration.');
  return { mcpServers: { ...connection.mcpServers, kudiumbrowser: { ...connection.mcpServers.kudiumbrowser, url } } };
}
