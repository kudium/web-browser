/**
 * Frames exchanged between Kudium Browser (the "device") and the relay over the
 * device WebSocket. The relay forwards MCP HTTP requests from cloud clients as
 * `request` frames and relays the device's `response` frames back.
 *
 * TLS terminates at the relay for third-party cloud clients: the relay sees
 * plaintext JSON-RPC for those connectors. The `e2e` frame is reserved for
 * Kudium's own clients, which can carry ciphertext the relay never decodes.
 */
export const RELAY_PROTOCOL_VERSION = 1 as const;

export type RelayCeiling = 'ask' | 'standard' | 'full';
export const RELAY_CEILINGS: readonly RelayCeiling[] = ['ask', 'standard', 'full'];

export interface RelayConnectorInfo {
  /** Stable connector (token) id; appears in audit rows and revocation. */
  id: string;
  /** Client name from dynamic registration, confirmed at consent. */
  name: string;
  /** Highest access mode the device may grant this connector. */
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
  | {
      type: 'request';
      id: string;
      method: 'POST' | 'DELETE';
      session?: string;
      body: string;
      connector: RelayConnectorInfo;
    }
  | { type: 'cancel'; id: string }
  | {
      type: 'consent';
      id: string;
      client: { clientId: string; name: string; redirectUri: string; scope: string };
    }
  | { type: 'ping' }
  | { type: 'e2e'; payload: string };

export type DeviceToRelayFrame =
  | {
      type: 'response';
      id: string;
      status: number;
      session?: string;
      contentType?: string;
      body: string;
    }
  | {
      type: 'consent';
      id: string;
      approved: boolean;
      /** Name the human gave the connector; defaults to the client name. */
      name?: string;
      ceiling?: RelayCeiling;
    }
  | { type: 'pong' }
  | { type: 'e2e'; payload: string };

const MAX_FRAME_BYTES = 2 * 1024 * 1024;

/** Parse and validate one device frame; undefined for anything malformed. */
export function parseDeviceFrame(text: string): DeviceToRelayFrame | undefined {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_FRAME_BYTES) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const frame = value as Record<string, unknown>;
  switch (frame.type) {
    case 'pong':
      return { type: 'pong' };
    case 'e2e':
      return typeof frame.payload === 'string' ? { type: 'e2e', payload: frame.payload } : undefined;
    case 'response': {
      if (typeof frame.id !== 'string' || frame.id.length > 100) return undefined;
      if (!Number.isInteger(frame.status) || Number(frame.status) < 100 || Number(frame.status) > 599)
        return undefined;
      if (typeof frame.body !== 'string') return undefined;
      if (frame.session !== undefined && (typeof frame.session !== 'string' || frame.session.length > 200))
        return undefined;
      if (frame.contentType !== undefined && (typeof frame.contentType !== 'string' || frame.contentType.length > 200))
        return undefined;
      return {
        type: 'response',
        id: frame.id,
        status: Number(frame.status),
        body: frame.body,
        ...(frame.session !== undefined ? { session: frame.session as string } : {}),
        ...(frame.contentType !== undefined ? { contentType: frame.contentType as string } : {}),
      };
    }
    case 'consent': {
      if (typeof frame.id !== 'string' || frame.id.length > 100) return undefined;
      if (typeof frame.approved !== 'boolean') return undefined;
      if (frame.name !== undefined && (typeof frame.name !== 'string' || frame.name.length > 120)) return undefined;
      if (frame.ceiling !== undefined && !RELAY_CEILINGS.includes(frame.ceiling as RelayCeiling)) return undefined;
      return {
        type: 'consent',
        id: frame.id,
        approved: frame.approved,
        ...(frame.name !== undefined ? { name: frame.name as string } : {}),
        ...(frame.ceiling !== undefined ? { ceiling: frame.ceiling as RelayCeiling } : {}),
      };
    }
    default:
      return undefined;
  }
}
