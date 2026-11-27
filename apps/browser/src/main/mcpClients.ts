import { randomBytes, randomUUID } from 'crypto';
import type { AIAccessMode } from '../browser/aiPermissions';

/**
 * Per-agent identity for external MCP clients (spec 4.11). Each named client
 * owns its token, a display name stamped on receipts, and an optional
 * permission ceiling: a client capped at Standard behaves as Standard even
 * while the browser is in Full access. The pre-existing shared connector
 * token stays as the "default" client so older configurations keep working.
 */
export interface MCPClientRecord {
  id: string;
  name: string;
  token: string;
  ceiling?: AIAccessMode;
  createdAt: number;
  lastUsedAt?: number;
}
/** What settings and status show: never the token. */
export interface MCPClientInfo {
  id: string;
  name: string;
  ceiling?: AIAccessMode;
  createdAt: number;
  lastUsedAt?: number;
  /** The shared connector token predating named clients. */
  shared?: boolean;
}
/** The identity the engine receives with every external tool call. */
export interface MCPClientContext {
  id: string;
  name: string;
  ceiling?: AIAccessMode;
}

export const MCP_DEFAULT_CLIENT_ID = 'default';
export const MCP_DEFAULT_CLIENT_NAME = 'Connector';
const MODE_RANK: Record<AIAccessMode, number> = { ask: 0, standard: 1, full: 2 };
const TOKEN = /^[a-f0-9]{64}$/;

export function mcpClientName(value: unknown, fallback = MCP_DEFAULT_CLIENT_NAME): string {
  if (typeof value !== 'string') return fallback;
  const name = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return name || fallback;
}

export function mcpClientCeiling(value: unknown): AIAccessMode | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'ask' || value === 'standard' || value === 'full') return value;
  throw new Error('ceiling must be ask, standard or full.');
}

/** The mode a client may act at: never above its ceiling. */
export function mcpCappedMode(mode: AIAccessMode, ceiling: AIAccessMode | undefined): AIAccessMode {
  if (!ceiling) return mode;
  return MODE_RANK[mode] > MODE_RANK[ceiling] ? ceiling : mode;
}

export class MCPClientRegistry {
  private clients: MCPClientRecord[] = [];

  /** Ceiling of the shared connector token (the default client). */
  defaultCeiling: AIAccessMode | undefined;

  static from(saved: unknown): MCPClientRegistry {
    const registry = new MCPClientRegistry();
    const value = saved as { clients?: unknown; defaultCeiling?: unknown } | undefined;
    if (Array.isArray(value?.clients))
      registry.clients = value!.clients
        .filter(
          (entry): entry is MCPClientRecord =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as MCPClientRecord).id === 'string' &&
            typeof (entry as MCPClientRecord).name === 'string' &&
            TOKEN.test(String((entry as MCPClientRecord).token))
        )
        .slice(0, 64)
        .map((entry) => ({
          id: entry.id,
          name: mcpClientName(entry.name),
          token: entry.token,
          ...(mcpClientCeilingSafe(entry.ceiling) ? { ceiling: mcpClientCeilingSafe(entry.ceiling) } : {}),
          createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
          ...(Number.isFinite(entry.lastUsedAt) ? { lastUsedAt: entry.lastUsedAt } : {}),
        }));
    registry.defaultCeiling = mcpClientCeilingSafe(value?.defaultCeiling);
    return registry;
  }

  toJSON() {
    return { clients: this.clients.map((client) => ({ ...client })), defaultCeiling: this.defaultCeiling };
  }

  list(hasDefault: boolean): MCPClientInfo[] {
    const named = this.clients.map(({ token, ...info }) => info);
    return hasDefault
      ? [
          {
            id: MCP_DEFAULT_CLIENT_ID,
            name: MCP_DEFAULT_CLIENT_NAME,
            ...(this.defaultCeiling ? { ceiling: this.defaultCeiling } : {}),
            createdAt: 0,
            shared: true,
          },
          ...named,
        ]
      : named;
  }

  tokens(): string[] {
    return this.clients.map((client) => client.token);
  }

  add(name: unknown, ceiling?: unknown): MCPClientRecord {
    if (this.clients.length >= 64) throw new Error('Revoke an unused client before adding another.');
    const record: MCPClientRecord = {
      id: randomUUID(),
      name: mcpClientName(name, 'Agent'),
      token: randomBytes(32).toString('hex'),
      createdAt: Date.now(),
    };
    const cap = mcpClientCeiling(ceiling);
    if (cap) record.ceiling = cap;
    this.clients = [...this.clients, record];
    return record;
  }

  byToken(token: string): MCPClientRecord | undefined {
    return this.clients.find((client) => client.token === token);
  }

  byId(id: string): MCPClientRecord | undefined {
    return this.clients.find((client) => client.id === id);
  }

  touch(token: string, now = Date.now()) {
    const client = this.byToken(token);
    if (client) client.lastUsedAt = now;
  }

  setCeiling(id: string, ceiling: unknown) {
    const cap = mcpClientCeiling(ceiling);
    if (id === MCP_DEFAULT_CLIENT_ID) {
      this.defaultCeiling = cap;
      return;
    }
    const client = this.byId(id);
    if (!client) throw new Error('Unknown client.');
    if (cap) client.ceiling = cap;
    else delete client.ceiling;
  }

  /** Removes the client and returns its token so live requests can be dropped. */
  revoke(id: string): string | undefined {
    const client = this.byId(id);
    if (!client) throw new Error('Unknown client.');
    this.clients = this.clients.filter((entry) => entry.id !== id);
    return client.token;
  }

  /** The context for a token: a named client, the default client, or undefined. */
  context(token: string, defaultToken: string | undefined, clientInfoName?: string): MCPClientContext | undefined {
    const client = this.byToken(token);
    if (client) return { id: client.id, name: client.name, ...(client.ceiling ? { ceiling: client.ceiling } : {}) };
    if (defaultToken && token === defaultToken)
      return {
        id: MCP_DEFAULT_CLIENT_ID,
        name: mcpClientName(clientInfoName, MCP_DEFAULT_CLIENT_NAME),
        ...(this.defaultCeiling ? { ceiling: this.defaultCeiling } : {}),
      };
    return undefined;
  }
}

function mcpClientCeilingSafe(value: unknown): AIAccessMode | undefined {
  try {
    return mcpClientCeiling(value);
  } catch {
    return undefined;
  }
}
