import { randomUUID } from 'node:crypto';
import {
  parseDeviceFrame,
  RELAY_PROTOCOL_VERSION,
  type RelayCeiling,
  type RelayConnectorInfo,
  type RelayToDeviceFrame,
} from '../relay-protocol';
import type { RelayAuditRow, RelayStore } from './store';

/** What the transport gives the service for one connected device. */
export interface DeviceLink {
  send(frame: RelayToDeviceFrame): void;
  close(code?: number, reason?: string): void;
}

export interface RelayServiceOptions {
  requestTimeoutMs?: number;
  consentTimeoutMs?: number;
  idleTimeoutMs?: number;
  pingIntervalMs?: number;
  /** How often idle sockets are swept; tests call sweep() directly. */
  sweepIntervalMs?: number;
  /** Requests per window for one device and for one connector token. */
  deviceLimit?: { count: number; windowMs: number };
  tokenLimit?: { count: number; windowMs: number };
  now?: () => number;
}

export interface ForwardRequest {
  method: 'POST' | 'DELETE';
  session?: string;
  body: string;
  connector: RelayConnectorInfo;
  /** Aborts when the HTTP client goes away; the device receives a cancel frame. */
  signal?: AbortSignal;
}

export interface ForwardResponse {
  status: number;
  session?: string;
  contentType?: string;
  body: string;
}

export class RelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'RelayError';
  }
}

interface Pending {
  resolve: (response: ForwardResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Consent {
  resolve: (answer: { approved: boolean; name?: string; ceiling?: RelayCeiling }) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Connection {
  link: DeviceLink;
  lastSeen: number;
  pending: Map<string, Pending>;
  consents: Map<string, Consent>;
  ping?: ReturnType<typeof setInterval>;
}

const jsonRpcMethod = (body: string) => {
  if (body.length > 64 * 1024) return undefined;
  try {
    const value = JSON.parse(body) as { method?: unknown } | { method?: unknown }[];
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first?.method === 'string' ? first.method.slice(0, 80) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Holds the live device sockets, forwards requests with id correlation,
 * pushes consent questions to the device, and enforces idle expiry and rate
 * limits. It never stores request bodies.
 */
export class RelayService {
  private connections = new Map<string, Connection>();

  private windows = new Map<string, { count: number; reset: number }>();

  private sweeper: ReturnType<typeof setInterval> | undefined;

  readonly requestTimeoutMs: number;

  readonly consentTimeoutMs: number;

  readonly idleTimeoutMs: number;

  readonly pingIntervalMs: number;

  private readonly deviceLimit: { count: number; windowMs: number };

  private readonly tokenLimit: { count: number; windowMs: number };

  private readonly now: () => number;

  constructor(
    private readonly store: RelayStore,
    options: RelayServiceOptions = {}
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.consentTimeoutMs = options.consentTimeoutMs ?? 120_000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60_000;
    this.pingIntervalMs = options.pingIntervalMs ?? 25_000;
    this.deviceLimit = options.deviceLimit ?? { count: 120, windowMs: 10_000 };
    this.tokenLimit = options.tokenLimit ?? { count: 60, windowMs: 10_000 };
    this.now = options.now ?? Date.now;
    this.sweeper = setInterval(() => this.sweep(), options.sweepIntervalMs ?? Math.min(this.idleTimeoutMs, 60_000));
    this.sweeper.unref?.();
  }

  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = undefined;
    for (const id of [...this.connections.keys()]) this.detach(id, 1001, 'relay stopping');
  }

  online(deviceId: string) {
    return this.connections.has(deviceId);
  }

  /** Register a connected device; returns the handlers the transport calls. */
  attach(
    deviceId: string,
    link: DeviceLink,
    urls: { host?: string; path: string }
  ): { onFrame(text: string): void; onClose(): void } {
    const previous = this.connections.get(deviceId);
    if (previous) this.detach(deviceId, 1000, 'replaced by a newer connection');
    const connection: Connection = {
      link,
      lastSeen: this.now(),
      pending: new Map(),
      consents: new Map(),
    };
    this.connections.set(deviceId, connection);
    link.send({
      type: 'hello',
      version: RELAY_PROTOCOL_VERSION,
      deviceId,
      urls,
      pingIntervalMs: this.pingIntervalMs,
      idleTimeoutMs: this.idleTimeoutMs,
    });
    connection.ping = setInterval(() => {
      try {
        link.send({ type: 'ping' });
      } catch {
        this.detach(deviceId, 1011, 'send failed');
      }
    }, this.pingIntervalMs);
    connection.ping.unref?.();
    return {
      onFrame: (text) => {
        const current = this.connections.get(deviceId);
        if (current !== connection) return;
        connection.lastSeen = this.now();
        const frame = parseDeviceFrame(text);
        if (!frame) return;
        if (frame.type === 'response') {
          const pending = connection.pending.get(frame.id);
          if (!pending) return;
          connection.pending.delete(frame.id);
          clearTimeout(pending.timer);
          pending.resolve({
            status: frame.status,
            body: frame.body,
            ...(frame.session ? { session: frame.session } : {}),
            ...(frame.contentType ? { contentType: frame.contentType } : {}),
          });
        } else if (frame.type === 'consent') {
          const consent = connection.consents.get(frame.id);
          if (!consent) return;
          connection.consents.delete(frame.id);
          clearTimeout(consent.timer);
          consent.resolve({ approved: frame.approved, name: frame.name, ceiling: frame.ceiling });
        }
        // pong only refreshes lastSeen; e2e is reserved and ignored for now.
      },
      onClose: () => {
        if (this.connections.get(deviceId) === connection) this.detach(deviceId);
      },
    };
  }

  /** Drop the device's socket, failing every in-flight request and consent. */
  detach(deviceId: string, code = 1000, reason = 'closed') {
    const connection = this.connections.get(deviceId);
    if (!connection) return;
    this.connections.delete(deviceId);
    if (connection.ping) clearInterval(connection.ping);
    for (const pending of connection.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new RelayError(503, 'device_offline', 'The browser disconnected.'));
    }
    connection.pending.clear();
    for (const consent of connection.consents.values()) {
      clearTimeout(consent.timer);
      consent.resolve({ approved: false });
    }
    connection.consents.clear();
    try {
      connection.link.close(code, reason);
    } catch {
      /* The socket may already be gone. */
    }
  }

  /** Fixed-window limiter; keys are "device:<id>" and "token:<id>". */
  allow(key: string, limit: { count: number; windowMs: number }): boolean {
    const now = this.now();
    if (this.windows.size > 10_000)
      for (const [entry, window] of this.windows) if (window.reset <= now) this.windows.delete(entry);
    let window = this.windows.get(key);
    if (!window || window.reset <= now) {
      window = { count: 0, reset: now + limit.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window.count <= limit.count;
  }

  async forward(deviceId: string, request: ForwardRequest): Promise<ForwardResponse> {
    const connection = this.connections.get(deviceId);
    if (!connection) throw new RelayError(503, 'device_offline', 'The browser is not connected to the relay.');
    if (!this.allow(`device:${deviceId}`, this.deviceLimit))
      throw new RelayError(429, 'device_rate_limited', 'Too many requests for this browser.');
    if (!this.allow(`token:${request.connector.id}`, this.tokenLimit))
      throw new RelayError(429, 'connector_rate_limited', 'Too many requests from this connector.');
    const id = randomUUID();
    const startedAt = this.now();
    const response = await new Promise<ForwardResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        connection.pending.delete(id);
        this.cancel(connection, id);
        reject(new RelayError(504, 'device_timeout', 'The browser did not answer in time.'));
      }, this.requestTimeoutMs);
      timer.unref?.();
      const abort = () => {
        if (!connection.pending.has(id)) return;
        connection.pending.delete(id);
        clearTimeout(timer);
        this.cancel(connection, id);
        reject(new RelayError(499, 'client_closed', 'The client went away.'));
      };
      request.signal?.addEventListener('abort', abort, { once: true });
      connection.pending.set(id, {
        resolve: (value) => {
          request.signal?.removeEventListener('abort', abort);
          resolve(value);
        },
        reject: (error) => {
          request.signal?.removeEventListener('abort', abort);
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });
      try {
        connection.link.send({
          type: 'request',
          id,
          method: request.method,
          ...(request.session ? { session: request.session } : {}),
          body: request.body,
          connector: request.connector,
        });
      } catch {
        connection.pending.delete(id);
        clearTimeout(timer);
        reject(new RelayError(503, 'device_offline', 'The browser disconnected.'));
      }
    });
    const row: RelayAuditRow = {
      at: startedAt,
      deviceId,
      tokenId: request.connector.id,
      method: jsonRpcMethod(request.body),
      status: response.status,
      durationMs: this.now() - startedAt,
    };
    await this.store.addAudit(row);
    return response;
  }

  private cancel(connection: Connection, id: string) {
    try {
      connection.link.send({ type: 'cancel', id });
    } catch {
      /* Already gone; detach handles it. */
    }
  }

  /** Push an OAuth consent question to the device and wait for the human. */
  async requestConsent(
    deviceId: string,
    client: { clientId: string; name: string; redirectUri: string; scope: string }
  ): Promise<{ approved: boolean; name?: string; ceiling?: RelayCeiling }> {
    const connection = this.connections.get(deviceId);
    if (!connection) throw new RelayError(503, 'device_offline', 'The browser is not connected to the relay.');
    const id = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        connection.consents.delete(id);
        resolve({ approved: false });
      }, this.consentTimeoutMs);
      timer.unref?.();
      connection.consents.set(id, { resolve, timer });
      try {
        connection.link.send({ type: 'consent', id, client });
      } catch {
        connection.consents.delete(id);
        clearTimeout(timer);
        resolve({ approved: false });
      }
    });
  }

  /** Close device sockets that have not sent a frame within the idle timeout. */
  sweep() {
    const cutoff = this.now() - this.idleTimeoutMs;
    for (const [deviceId, connection] of this.connections)
      if (connection.lastSeen < cutoff) this.detach(deviceId, 1001, 'idle');
  }
}
