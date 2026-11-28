/**
 * Browser side of the MCP relay (spec 4.12, apps/browser/docs/mcp-relay.md).
 * The browser keeps one outbound WebSocket to the relay; the relay forwards
 * each cloud client's MCP request as a `request` frame and sends the browser's
 * `response` frame back. Third-party clients are plaintext at the relay (TLS
 * ends there); Kudium's own clients can wrap frames in `e2e` envelopes the
 * relay never decodes. Everything here is pure: types, validation, parsing.
 */
export const RELAY_PROTOCOL_VERSION = 1 as const;
export type RelayCeiling = 'ask' | 'standard' | 'full';
export const RELAY_CEILINGS: readonly RelayCeiling[] = ['ask', 'standard', 'full'];
/** Remote clients never start above Standard; the user raises it per connector. */
export const RELAY_DEFAULT_CEILING: RelayCeiling = 'standard';
export const RELAY_MAX_FRAME_BYTES = 2 * 1024 * 1024;
export const RELAY_MAX_BODY_BYTES = 1024 * 1024;
/** A `request` must be answered within the relay's 30 s forward deadline. */
export const RELAY_REQUEST_DEADLINE_MS = 30000;
/** Unanswered consents are denied by the relay after 120 s; answer sooner. */
export const RELAY_CONSENT_DEADLINE_MS = 110000;
export const RELAY_RECONNECT_MIN_MS = 1000;
export const RELAY_RECONNECT_MAX_MS = 60000;
export const RELAY_DEFAULT_URL = 'https://browser.kudium.com';

export interface RelayConnectorInfo {
  id: string;
  name: string;
  ceiling: RelayCeiling;
}
export type RelayToDeviceFrame =
  | {
      type: 'hello';
      version: typeof RELAY_PROTOCOL_VERSION;
      deviceId: string;
      urls: { host?: string; path: string };
      pingIntervalMs: number;
      idleTimeoutMs: number;
    }
  | { type: 'request'; id: string; method: 'POST' | 'DELETE'; session?: string; body: string; connector: RelayConnectorInfo }
  | { type: 'cancel'; id: string }
  | { type: 'consent'; id: string; client: { clientId: string; name: string; redirectUri: string; scope: string } }
  | { type: 'ping' }
  | { type: 'e2e'; payload: string };
export type DeviceToRelayFrame =
  | { type: 'response'; id: string; status: number; session?: string; contentType?: string; body: string }
  | { type: 'consent'; id: string; approved: boolean; name?: string; ceiling?: RelayCeiling }
  | { type: 'pong' }
  | { type: 'e2e'; payload: string };

const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;

/** Parse one relay→device frame; undefined for anything malformed or oversized. */
export function parseRelayFrame(raw: unknown): RelayToDeviceFrame | undefined {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > RELAY_MAX_FRAME_BYTES) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const frame = value as Record<string, unknown>;
  switch (frame.type) {
    case 'ping':
      return { type: 'ping' };
    case 'e2e':
      return text(frame.payload, RELAY_MAX_FRAME_BYTES) ? { type: 'e2e', payload: frame.payload as string } : undefined;
    case 'cancel':
      return text(frame.id, 100) ? { type: 'cancel', id: frame.id as string } : undefined;
    case 'hello': {
      const urls = frame.urls as Record<string, unknown> | undefined;
      if (
        frame.version !== RELAY_PROTOCOL_VERSION ||
        !text(frame.deviceId, 100) ||
        !urls ||
        typeof urls !== 'object' ||
        !text(urls.path, 2048) ||
        (urls.host !== undefined && !text(urls.host, 2048)) ||
        !Number.isInteger(frame.pingIntervalMs) ||
        Number(frame.pingIntervalMs) < 1000 ||
        !Number.isInteger(frame.idleTimeoutMs) ||
        Number(frame.idleTimeoutMs) < 1000
      )
        return undefined;
      return {
        type: 'hello',
        version: RELAY_PROTOCOL_VERSION,
        deviceId: frame.deviceId as string,
        urls: { path: urls.path as string, ...(urls.host !== undefined ? { host: urls.host as string } : {}) },
        pingIntervalMs: Number(frame.pingIntervalMs),
        idleTimeoutMs: Number(frame.idleTimeoutMs),
      };
    }
    case 'request': {
      const connector = frame.connector as Record<string, unknown> | undefined;
      if (
        !text(frame.id, 100) ||
        (frame.method !== 'POST' && frame.method !== 'DELETE') ||
        typeof frame.body !== 'string' ||
        Buffer.byteLength(frame.body) > RELAY_MAX_BODY_BYTES ||
        (frame.session !== undefined && !text(frame.session, 200)) ||
        !connector ||
        typeof connector !== 'object' ||
        !text(connector.id, 100) ||
        !connector.id ||
        !text(connector.name, 120) ||
        !RELAY_CEILINGS.includes(connector.ceiling as RelayCeiling)
      )
        return undefined;
      return {
        type: 'request',
        id: frame.id as string,
        method: frame.method,
        body: frame.body,
        ...(frame.session !== undefined ? { session: frame.session as string } : {}),
        connector: { id: connector.id as string, name: connector.name as string, ceiling: connector.ceiling as RelayCeiling },
      };
    }
    case 'consent': {
      const client = frame.client as Record<string, unknown> | undefined;
      if (
        !text(frame.id, 100) ||
        !client ||
        typeof client !== 'object' ||
        !text(client.clientId, 200) ||
        !text(client.name, 120) ||
        !text(client.redirectUri, 2048) ||
        !text(client.scope, 200)
      )
        return undefined;
      return {
        type: 'consent',
        id: frame.id as string,
        client: {
          clientId: client.clientId as string,
          name: client.name as string,
          redirectUri: client.redirectUri as string,
          scope: client.scope as string,
        },
      };
    }
    default:
      return undefined;
  }
}

/** The lower of two access modes: a ceiling never raises anything. */
export function lowerCeiling(a: RelayCeiling, b: RelayCeiling): RelayCeiling {
  return RELAY_CEILINGS.indexOf(a) <= RELAY_CEILINGS.indexOf(b) ? a : b;
}

export function validRelayURL(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter the relay URL.');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid relay URL.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new Error('The relay must be reached over https.');
  if (url.username || url.password || url.search || url.hash) throw new Error('The relay URL must be plain.');
  return url.origin;
}

export function validDeviceToken(value: unknown): string {
  if (typeof value !== 'string' || !/^kd_[A-Za-z0-9_-]{16,200}$/.test(value.trim()))
    throw new Error('Paste the device token shown once by the relay (it starts with kd_).');
  return value.trim();
}

/** `wss://…/relay/device` for a relay origin. */
export function relaySocketURL(relayOrigin: string) {
  const url = new URL(relayOrigin);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.pathname = '/relay/device';
  return url.href;
}

/** Host shown in the consent dialog for a cloud client's redirect URI. */
export function redirectHost(redirectUri: string) {
  try {
    return new URL(redirectUri).host || redirectUri;
  } catch {
    return redirectUri;
  }
}

/** The trycloudflare URL a quick tunnel prints on stderr; undefined until it appears. */
export function parseQuickTunnelURL(chunk: string): string | undefined {
  const match = chunk.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return match ? match[0].toLowerCase() : undefined;
}

export interface MCPRelayConnector {
  id: string;
  name: string;
  /** The human's ceiling for this connector; the relay's claim is clamped to it. */
  ceiling: RelayCeiling;
  lastSeen?: number;
  requests: number;
}
export interface MCPRelayAccountStatus {
  available: boolean;
  signedIn: boolean;
  reason?: string;
}
export interface MCPRelayStatus {
  account?: MCPRelayAccountStatus;
  enabled: boolean;
  paired: boolean;
  relayUrl: string;
  deviceId?: string;
  urls?: { host?: string; path: string };
  connected: boolean;
  reconnectInMs?: number;
  allowProjectTools: boolean;
  connectors: MCPRelayConnector[];
  /** Base64 X25519 public key Kudium clients use for e2e envelopes. */
  devicePublicKey?: string;
  quickTunnel: { running: boolean; ready?: boolean; url?: string; error?: string; available: boolean };
  error?: string;
}
export type MCPRelayCommand =
  | { action: 'status' }
  | { action: 'connect' }
  | { action: 'pair'; relayUrl: string; deviceToken: string }
  | { action: 'create'; relayUrl: string; bearer: string; name?: string }
  | { action: 'unpair' }
  | { action: 'enable'; enabled: boolean }
  | { action: 'projectTools'; allowed: boolean }
  | { action: 'ceiling'; connectorId: string; ceiling: RelayCeiling }
  | { action: 'revoke'; connectorId: string }
  | { action: 'quickTunnel'; running: boolean };

export function validRelayCommand(value: unknown): MCPRelayCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid relay request.');
  const command = value as Record<string, unknown>;
  switch (command.action) {
    case 'status':
    case 'connect':
    case 'unpair':
      return { action: command.action };
    case 'pair':
      return { action: 'pair', relayUrl: validRelayURL(command.relayUrl), deviceToken: validDeviceToken(command.deviceToken) };
    case 'create':
      if (!text(command.bearer, 4096) || !command.bearer) throw new Error('Sign in to create a relay device.');
      if (command.name !== undefined && !text(command.name, 120)) throw new Error('Device name too long.');
      return {
        action: 'create',
        relayUrl: validRelayURL(command.relayUrl),
        bearer: command.bearer as string,
        ...(command.name ? { name: command.name as string } : {}),
      };
    case 'enable':
      if (typeof command.enabled !== 'boolean') throw new Error('enabled must be boolean.');
      return { action: 'enable', enabled: command.enabled };
    case 'projectTools':
      if (typeof command.allowed !== 'boolean') throw new Error('allowed must be boolean.');
      return { action: 'projectTools', allowed: command.allowed };
    case 'ceiling':
      if (!text(command.connectorId, 100) || !command.connectorId) throw new Error('Choose a connector.');
      if (!RELAY_CEILINGS.includes(command.ceiling as RelayCeiling)) throw new Error('Choose ask, standard or full.');
      return { action: 'ceiling', connectorId: command.connectorId as string, ceiling: command.ceiling as RelayCeiling };
    case 'revoke':
      if (!text(command.connectorId, 100) || !command.connectorId) throw new Error('Choose a connector.');
      return { action: 'revoke', connectorId: command.connectorId as string };
    case 'quickTunnel':
      if (typeof command.running !== 'boolean') throw new Error('running must be boolean.');
      return { action: 'quickTunnel', running: command.running };
    default:
      throw new Error('Unknown relay action.');
  }
}
