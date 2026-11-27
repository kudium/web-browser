import type { RelayCeiling } from '../relay-protocol';

/**
 * Relay state. The in-memory implementation is the only one today: it keeps
 * the service testable without Postgres and is enough for a single relay
 * instance. The interface is async so a database-backed store can replace it
 * without touching the routes or the service.
 */
export interface RelayDevice {
  id: string;
  accountId: string;
  name: string;
  tokenHash: string;
  /** Off by default: the owner enables relaying explicitly. */
  enabled: boolean;
  createdAt: number;
}

export interface RelayClient {
  clientId: string;
  name: string;
  redirectUris: string[];
  createdAt: number;
}

export interface RelayCode {
  code: string;
  deviceId: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  scope: string;
  /** Connector name and ceiling the human chose at consent. */
  name: string;
  ceiling: RelayCeiling;
  expiresAt: number;
}

export interface RelayToken {
  id: string;
  hash: string;
  deviceId: string;
  clientId: string;
  name: string;
  ceiling: RelayCeiling;
  scope: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export interface RelayAuditRow {
  at: number;
  deviceId: string;
  tokenId: string;
  /** JSON-RPC method when the body was small enough to inspect; never the body. */
  method?: string;
  status: number;
  durationMs: number;
}

export interface RelayStore {
  createDevice(device: RelayDevice): Promise<RelayDevice>;
  getDevice(id: string): Promise<RelayDevice | undefined>;
  findDeviceByTokenHash(hash: string): Promise<RelayDevice | undefined>;
  listDevices(accountId: string): Promise<RelayDevice[]>;
  updateDevice(id: string, patch: Partial<Pick<RelayDevice, 'enabled' | 'name' | 'tokenHash'>>): Promise<RelayDevice | undefined>;
  deleteDevice(id: string): Promise<void>;
  createClient(client: RelayClient): Promise<RelayClient>;
  getClient(clientId: string): Promise<RelayClient | undefined>;
  saveCode(code: RelayCode): Promise<void>;
  /** Single use: the code is removed as it is returned. */
  takeCode(code: string): Promise<RelayCode | undefined>;
  saveToken(token: RelayToken): Promise<void>;
  findTokenByHash(hash: string): Promise<RelayToken | undefined>;
  listTokens(deviceId: string): Promise<RelayToken[]>;
  updateToken(deviceId: string, tokenId: string, patch: Partial<Pick<RelayToken, 'ceiling' | 'name' | 'revokedAt' | 'lastUsedAt'>>): Promise<RelayToken | undefined>;
  addAudit(row: RelayAuditRow): Promise<void>;
  listAudit(deviceId: string, limit: number): Promise<RelayAuditRow[]>;
}

export const RELAY_AUDIT_RETENTION = 500;

export class MemoryRelayStore implements RelayStore {
  private devices = new Map<string, RelayDevice>();

  private clients = new Map<string, RelayClient>();

  private codes = new Map<string, RelayCode>();

  private tokens = new Map<string, RelayToken>();

  private audit = new Map<string, RelayAuditRow[]>();

  async createDevice(device: RelayDevice) {
    this.devices.set(device.id, { ...device });
    return { ...device };
  }

  async getDevice(id: string) {
    const device = this.devices.get(id);
    return device ? { ...device } : undefined;
  }

  async findDeviceByTokenHash(hash: string) {
    for (const device of this.devices.values()) if (device.tokenHash === hash) return { ...device };
    return undefined;
  }

  async listDevices(accountId: string) {
    return [...this.devices.values()].filter((device) => device.accountId === accountId).map((d) => ({ ...d }));
  }

  async updateDevice(id: string, patch: Partial<Pick<RelayDevice, 'enabled' | 'name' | 'tokenHash'>>) {
    const device = this.devices.get(id);
    if (!device) return undefined;
    Object.assign(device, patch);
    return { ...device };
  }

  async deleteDevice(id: string) {
    this.devices.delete(id);
    for (const [key, token] of this.tokens) if (token.deviceId === id) this.tokens.delete(key);
    for (const [key, code] of this.codes) if (code.deviceId === id) this.codes.delete(key);
    this.audit.delete(id);
  }

  async createClient(client: RelayClient) {
    this.clients.set(client.clientId, { ...client, redirectUris: [...client.redirectUris] });
    return { ...client };
  }

  async getClient(clientId: string) {
    const client = this.clients.get(clientId);
    return client ? { ...client, redirectUris: [...client.redirectUris] } : undefined;
  }

  async saveCode(code: RelayCode) {
    this.codes.set(code.code, { ...code });
  }

  async takeCode(code: string) {
    const found = this.codes.get(code);
    this.codes.delete(code);
    return found ? { ...found } : undefined;
  }

  async saveToken(token: RelayToken) {
    this.tokens.set(token.id, { ...token });
  }

  async findTokenByHash(hash: string) {
    for (const token of this.tokens.values()) if (token.hash === hash) return { ...token };
    return undefined;
  }

  async listTokens(deviceId: string) {
    return [...this.tokens.values()].filter((token) => token.deviceId === deviceId).map((t) => ({ ...t }));
  }

  async updateToken(deviceId: string, tokenId: string, patch: Partial<Pick<RelayToken, 'ceiling' | 'name' | 'revokedAt' | 'lastUsedAt'>>) {
    const token = this.tokens.get(tokenId);
    if (!token || token.deviceId !== deviceId) return undefined;
    Object.assign(token, patch);
    return { ...token };
  }

  async addAudit(row: RelayAuditRow) {
    const rows = this.audit.get(row.deviceId) ?? [];
    rows.push(row);
    if (rows.length > RELAY_AUDIT_RETENTION) rows.splice(0, rows.length - RELAY_AUDIT_RETENTION);
    this.audit.set(row.deviceId, rows);
  }

  async listAudit(deviceId: string, limit: number) {
    const rows = this.audit.get(deviceId) ?? [];
    return rows.slice(-limit).reverse();
  }
}
