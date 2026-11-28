/**
 * Relay client (spec 4.12 / docs/mcp-relay.md). One outbound WebSocket to
 * the relay; each `request` frame is replayed as a loopback HTTP request to
 * the local MCP server, so auth, sessions and tool execution are the same
 * code path as a local client. The connector's identity and ceiling travel
 * in a loopback-only header that the engine applies as a cap. Off by default;
 * the device token and e2e keys live in the private store only.
 */
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import {
  DeviceToRelayFrame,
  MCPRelayCommand,
  MCPRelayConnector,
  MCPRelayStatus,
  RELAY_CONSENT_DEADLINE_MS,
  RELAY_DEFAULT_CEILING,
  RELAY_DEFAULT_URL,
  RELAY_RECONNECT_MAX_MS,
  RELAY_RECONNECT_MIN_MS,
  RELAY_REQUEST_DEADLINE_MS,
  RelayCeiling,
  RelayToDeviceFrame,
  lowerCeiling,
  parseQuickTunnelURL,
  parseRelayFrame,
  redirectHost,
  relaySocketURL,
  validRelayCommand,
  validRelayURL,
  validDeviceToken,
} from '../browser/mcpRelay';
import { writePrivateFile } from './privateFile';
import { RelayDeviceKeys, generateRelayDeviceKeys, openRelayPayload, sealRelayPayload } from './mcpRelayCrypto';

/** Loopback-only header carrying the relay connector's identity and ceiling. */
export const RELAY_CONNECTOR_HEADER = 'x-kudium-relay-connector';

export interface RelayConnectorContext {
  id: string;
  name: string;
  ceiling: RelayCeiling;
  /** Project tools and the shell stay unavailable remotely unless the user allowed them. */
  projectTools: boolean;
  remote: true;
}

/** Parse the loopback header; undefined when absent or malformed. */
export function parseRelayConnectorHeader(value: unknown): RelayConnectorContext | undefined {
  if (typeof value !== 'string' || !value || value.length > 1000) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      typeof parsed.name !== 'string' ||
      !['ask', 'standard', 'full'].includes(String(parsed.ceiling))
    )
      return undefined;
    return {
      id: parsed.id,
      name: parsed.name.slice(0, 120),
      ceiling: parsed.ceiling as RelayCeiling,
      projectTools: parsed.projectTools === true,
      remote: true,
    };
  } catch {
    return undefined;
  }
}

export interface RelaySocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}
export interface MCPRelayEndpoint {
  url: string;
  token: string;
  port: number;
}
export interface MCPRelayOptions {
  /** Private JSON store (device token, keys, connectors). */
  filename: string;
  /** The local MCP endpoint, or undefined while external control is off. */
  endpoint: () => MCPRelayEndpoint | undefined;
  approveConsent: (client: { name: string; redirectHost: string; scope: string }) => Promise<{
    approved: boolean;
    name?: string;
    ceiling?: RelayCeiling;
  }>;
  changed: (status: MCPRelayStatus) => void;
  createSocket?: (url: string, headers: Record<string, string>) => RelaySocketLike;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
  cloudflaredPath?: () => string | undefined;
  tunnelStartTimeoutMs?: number;
  accountState?: () => NonNullable<MCPRelayStatus['account']>;
  createDevice?: () => Promise<{ relayUrl: string; deviceId: string; deviceToken: string }>;
  /** Test hook for backoff timing. */
  reconnectDelay?: (attempt: number) => number;
}

interface RelayStore {
  enabled: boolean;
  relayUrl: string;
  deviceToken?: string;
  deviceId?: string;
  allowProjectTools: boolean;
  keys?: RelayDeviceKeys;
  connectors: Record<string, { name: string; ceiling: RelayCeiling; lastSeen?: number; requests: number }>;
}

const defaultCloudflared = () => {
  const candidates = [
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
    ...(process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')),
  ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
};

export function createMCPRelayClient(options: MCPRelayOptions) {
  const fetchImpl = options.fetchImpl || fetch;
  const spawnImpl = options.spawnImpl || spawn;
  const createSocket =
    options.createSocket ||
    ((url: string, headers: Record<string, string>) => {
      const Impl = (globalThis as { WebSocket?: new (url: string, options?: unknown) => RelaySocketLike }).WebSocket;
      if (!Impl) throw new Error('WebSocket is unavailable in this runtime.');
      return new Impl(url, { headers });
    });
  const reconnectDelay =
    options.reconnectDelay ||
    ((attempt: number) => Math.min(RELAY_RECONNECT_MAX_MS, RELAY_RECONNECT_MIN_MS * 2 ** Math.min(attempt, 6)));

  let store: RelayStore = { enabled: false, relayUrl: RELAY_DEFAULT_URL, allowProjectTools: false, connectors: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(options.filename, 'utf8')) as Partial<RelayStore>;
    store = {
      enabled: saved.enabled === true,
      relayUrl: typeof saved.relayUrl === 'string' ? saved.relayUrl : RELAY_DEFAULT_URL,
      deviceToken: typeof saved.deviceToken === 'string' ? saved.deviceToken : undefined,
      deviceId: typeof saved.deviceId === 'string' ? saved.deviceId : undefined,
      allowProjectTools: saved.allowProjectTools === true,
      keys:
        saved.keys && typeof saved.keys.publicKey === 'string' && typeof saved.keys.privateKey === 'string'
          ? { publicKey: saved.keys.publicKey, privateKey: saved.keys.privateKey }
          : undefined,
      connectors: saved.connectors && typeof saved.connectors === 'object' ? saved.connectors : {},
    };
  } catch {
    /* First run or unreadable store: defaults, nothing enabled. */
  }
  if (!store.keys) store.keys = generateRelayDeviceKeys();
  const save = () => writePrivateFile(options.filename, JSON.stringify(store));

  let socket: RelaySocketLike | undefined;
  let connected = false;
  let urls: MCPRelayStatus['urls'];
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAt: number | undefined;
  let error: string | undefined;
  let disposed = false;
  const inflight = new Map<string, AbortController>();
  /** MCP sessions opened through the relay, per connector, ended when the socket drops. */
  const sessions = new Map<string, Set<string>>();
  let tunnel: { process: ChildProcess; url?: string; ready: boolean; registered: boolean; logs: string; timer?: ReturnType<typeof setTimeout> } | undefined;
  let tunnelError: string | undefined;
  let creatingDevice = false;

  const status = (): MCPRelayStatus => ({
    ...(options.accountState ? { account: options.accountState() } : {}),
    enabled: store.enabled,
    paired: !!store.deviceToken,
    relayUrl: store.relayUrl,
    ...(store.deviceId ? { deviceId: store.deviceId } : {}),
    ...(urls ? { urls } : {}),
    connected,
    ...(reconnectAt && !connected ? { reconnectInMs: Math.max(0, reconnectAt - Date.now()) } : {}),
    allowProjectTools: store.allowProjectTools,
    connectors: Object.entries(store.connectors).map(([id, entry]) => ({ id, ...entry })),
    devicePublicKey: store.keys!.publicKey,
    quickTunnel: {
      running: !!tunnel,
      ...(tunnel?.url ? { url: tunnel.url } : {}),
      ready: !!tunnel?.ready,
      ...(tunnelError ? { error: tunnelError } : {}),
      available: !!(options.cloudflaredPath || defaultCloudflared)(),
    },
    ...(error ? { error } : {}),
  });
  const changed = () => {
    try {
      options.changed(status());
    } catch {
      /* Listeners never break the client. */
    }
  };

  const send = (frame: DeviceToRelayFrame) => {
    if (!socket || !connected) return;
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      /* The close handler reconnects. */
    }
  };

  const connectorFor = (info: { id: string; name: string; ceiling: RelayCeiling }): MCPRelayConnector => {
    const known = store.connectors[info.id];
    const entry = known || { name: info.name, ceiling: lowerCeiling(info.ceiling, RELAY_DEFAULT_CEILING), requests: 0 };
    store.connectors[info.id] = entry;
    return { id: info.id, ...entry };
  };

  const endSessions = async (connectorId?: string) => {
    const endpoint = options.endpoint();
    const targets = connectorId ? [[connectorId, sessions.get(connectorId)] as const] : [...sessions.entries()];
    await Promise.allSettled(
      targets.flatMap(([id, set]) =>
        [...(set || [])].map(async (session) => {
          sessions.get(id)?.delete(session);
          if (!endpoint) return;
          await fetchImpl(endpoint.url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${endpoint.token}`, 'Mcp-Session-Id': session, Connection: 'close' },
            signal: AbortSignal.timeout(1500),
          }).then((response) => response.text(), () => undefined);
        })
      )
    );
    if (connectorId) sessions.delete(connectorId);
    else sessions.clear();
  };

  /** Replay one relay request against the local MCP server. */
  const serve = async (
    request: Extract<RelayToDeviceFrame, { type: 'request' }>
  ): Promise<Extract<DeviceToRelayFrame, { type: 'response' }>> => {
    const endpoint = options.endpoint();
    const reply = (statusCode: number, body: unknown, session?: string) => ({
      type: 'response' as const,
      id: request.id,
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify(body),
      ...(session ? { session } : {}),
    });
    if (!store.enabled || !endpoint) return reply(503, { error: 'External control is off in Kudium Browser.' });
    const connector = connectorFor(request.connector);
    connector.lastSeen = Date.now();
    store.connectors[connector.id] = { name: connector.name, ceiling: connector.ceiling, lastSeen: connector.lastSeen, requests: connector.requests + 1 };
    const context = {
      id: connector.id,
      name: connector.name,
      // The relay's claim comes from our own consent reply; the local setting may be lower.
      ceiling: lowerCeiling(request.connector.ceiling, connector.ceiling),
      projectTools: store.allowProjectTools,
    };
    const controller = new AbortController();
    inflight.set(request.id, controller);
    const deadline = setTimeout(() => controller.abort(new Error('Relay deadline.')), RELAY_REQUEST_DEADLINE_MS);
    try {
      const response = await fetchImpl(endpoint.url, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${endpoint.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Connection: 'close',
          [RELAY_CONNECTOR_HEADER]: JSON.stringify(context),
          ...(request.session ? { 'Mcp-Session-Id': request.session } : {}),
        },
        ...(request.method === 'POST' ? { body: request.body } : {}),
        signal: controller.signal,
      });
      const body = await response.text();
      const session = response.headers.get('mcp-session-id') || undefined;
      if (session) {
        const set = sessions.get(connector.id) || new Set<string>();
        set.add(session);
        sessions.set(connector.id, set);
      }
      if (request.method === 'DELETE' && request.session) sessions.get(connector.id)?.delete(request.session);
      return {
        type: 'response',
        id: request.id,
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/json',
        body,
        ...(session ? { session } : {}),
      };
    } catch (reason) {
      return reply(controller.signal.aborted ? 504 : 502, { error: (reason as Error).message || 'Kudium Browser could not answer.' });
    } finally {
      clearTimeout(deadline);
      inflight.delete(request.id);
    }
  };

  const consent = async (frame: Extract<RelayToDeviceFrame, { type: 'consent' }>) => {
    let answer: { approved: boolean; name?: string; ceiling?: RelayCeiling } = { approved: false };
    try {
      answer = await Promise.race([
        options.approveConsent({ name: frame.client.name, redirectHost: redirectHost(frame.client.redirectUri), scope: frame.client.scope }),
        new Promise<{ approved: boolean }>((resolve) => {
          setTimeout(() => resolve({ approved: false }), RELAY_CONSENT_DEADLINE_MS).unref?.();
        }),
      ]);
    } catch {
      answer = { approved: false };
    }
    const ceiling = answer.approved ? lowerCeiling(answer.ceiling || RELAY_DEFAULT_CEILING, 'full') : undefined;
    send({
      type: 'consent',
      id: frame.id,
      approved: answer.approved,
      ...(answer.approved ? { name: (answer.name || frame.client.name).slice(0, 120), ceiling } : {}),
    });
  };

  const handleFrame = async (frame: RelayToDeviceFrame, sealed?: string) => {
    switch (frame.type) {
      case 'hello':
        attempt = 0;
        urls = frame.urls;
        if (store.deviceId !== frame.deviceId) {
          store.deviceId = frame.deviceId;
          save();
        }
        error = undefined;
        changed();
        return;
      case 'ping':
        send({ type: 'pong' });
        return;
      case 'cancel':
        inflight.get(frame.id)?.abort(new Error('Cancelled by the relay.'));
        return;
      case 'consent':
        await consent(frame);
        return;
      case 'request': {
        const response = await serve(frame);
        if (sealed) send({ type: 'e2e', payload: sealRelayPayload(sealed, JSON.stringify(response)).payload });
        else send(response);
        changed();
        return;
      }
      case 'e2e': {
        // Kudium's own clients: the inner frame is sealed to the device key and
        // the response is sealed back to the sender's ephemeral key.
        let inner: RelayToDeviceFrame | undefined;
        let sender: string | undefined;
        try {
          const opened = openRelayPayload(store.keys!.privateKey, frame.payload);
          inner = parseRelayFrame(opened.plaintext);
          sender = opened.senderPublicKey;
        } catch {
          inner = undefined;
        }
        if (inner?.type === 'request' && sender) await handleFrame(inner, sender);
        return;
      }
      default:
        return;
    }
  };

  const disconnect = (reason: string) => {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    reconnectAt = undefined;
    const current = socket;
    socket = undefined;
    connected = false;
    urls = undefined;
    inflight.forEach((controller) => controller.abort(new Error(reason)));
    inflight.clear();
    if (current) {
      current.onclose = null;
      current.onmessage = null;
      current.onerror = null;
      try {
        current.close(1000, reason);
      } catch {
        /* Already closed. */
      }
    }
  };

  const scheduleReconnect = () => {
    if (disposed || !store.enabled || !store.deviceToken || reconnectTimer) return;
    const delay = reconnectDelay(attempt);
    attempt += 1;
    reconnectAt = Date.now() + delay;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      reconnectAt = undefined;
      connect();
    }, delay);
    reconnectTimer.unref?.();
    changed();
  };

  const connect = () => {
    if (disposed || socket || !store.enabled || !store.deviceToken || !options.endpoint()) return;
    let current: RelaySocketLike;
    try {
      current = createSocket(relaySocketURL(store.relayUrl), { Authorization: `Bearer ${store.deviceToken}` });
    } catch (reason) {
      error = (reason as Error).message;
      scheduleReconnect();
      return;
    }
    socket = current;
    current.onopen = () => {
      if (socket !== current) return;
      connected = true;
      error = undefined;
      changed();
    };
    current.onmessage = (event) => {
      if (socket !== current) return;
      const frame = parseRelayFrame(typeof event.data === 'string' ? event.data : String(event.data));
      if (!frame) return;
      handleFrame(frame).catch(() => {});
    };
    current.onerror = () => {
      if (socket === current) { error = 'The relay connection failed. Check your network and try again.'; changed(); }
    };
    current.onclose = (event) => {
      if (socket !== current) return;
      socket = undefined;
      connected = false;
      urls = undefined;
      if (event?.code === 4401 || event?.code === 4403) {
        error = 'The relay rejected the device token. Pair again.';
        store.enabled = false;
        save();
        changed();
        return;
      }
      endSessions().catch(() => {});
      changed();
      scheduleReconnect();
    };
  };

  const api = async (relative: string, init: RequestInit, token: string) => {
    const response = await fetchImpl(`${store.relayUrl}${relative}`, {
      ...init,
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Relay refused (${response.status}).`);
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  };

  const stopTunnel = () => {
    const current = tunnel;
    tunnel = undefined;
    if (current) {
      if (current.timer) clearTimeout(current.timer);
      try {
        current.process.kill();
      } catch {
        /* Already gone. */
      }
    }
  };
  const startTunnel = () => {
    const endpoint = options.endpoint();
    if (!endpoint) throw new Error('Enable external control first.');
    const binary = (options.cloudflaredPath || defaultCloudflared)();
    if (!binary) throw new Error('cloudflared is not installed. Install it with your package manager; Kudium never downloads binaries.');
    stopTunnel();
    tunnelError = undefined;
    const env = { ...process.env };
    Object.keys(env).filter((key) => key.startsWith('TUNNEL_')).forEach((key) => delete env[key]);
    const child = spawnImpl(binary, [
      '--no-autoupdate', 'tunnel', '--config', process.platform === 'win32' ? 'NUL' : '/dev/null',
      '--url', `http://127.0.0.1:${endpoint.port}`, '--protocol', 'http2',
      '--http-host-header', `127.0.0.1:${endpoint.port}`,
    ], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const current: NonNullable<typeof tunnel> = { process: child, ready: false, registered: false, logs: '' };
    tunnel = current;
    const fail = (detail: string) => {
      if (tunnel !== current) return;
      tunnelError = detail;
      stopTunnel();
      changed();
    };
    current.timer = setTimeout(() => fail('Quick tunnel could not connect within 45 seconds. Check your network or proxy, then try again.'), options.tunnelStartTimeoutMs ?? 45000);
    current.timer.unref?.();
    const onChunk = (chunk: Buffer | string) => {
      if (tunnel !== current) return;
      current.logs = (current.logs + String(chunk)).slice(-8192);
      const url = parseQuickTunnelURL(current.logs);
      if (url) current.url = url;
      current.registered ||= current.logs.includes('Registered tunnel connection');
      if (current.url && current.registered && !current.ready) {
        current.ready = true;
        if (current.timer) clearTimeout(current.timer);
        current.timer = undefined;
        changed();
      }
    };
    child.stderr?.on('data', onChunk);
    child.stdout?.on('data', onChunk);
    child.on('error', (reason) => fail(`Quick tunnel could not start: ${reason.message}`));
    child.on('exit', (code) => {
      if (tunnel !== current) return;
      const detail = current.logs.split('\n').filter((line) => /\bERR\b|error|failed/i.test(line)).at(-1)?.replace(/(token|authorization|secret)[=:]\S+/gi, '$1=[redacted]').slice(0, 240);
      fail(`Quick tunnel stopped${code ? ` (exit ${code})` : ''}.${detail ? ` ${detail}` : ' Try starting it again.'}`);
    });
  };

  /** Drop everything remote at once: sockets, in-flight requests, relay sessions, tunnel. */
  const dropAll = async (reason: string) => {
    disconnect(reason);
    stopTunnel();
    await endSessions();
    changed();
  };

  return {
    status,
    /** Called whenever local external control changes; off drops remote access within the call. */
    async mcpChanged(enabled: boolean) {
      if (!enabled) await dropAll('External control was turned off.');
      else if (store.enabled) connect();
    },
    async command(value: unknown): Promise<MCPRelayStatus> {
      const request = validRelayCommand(value) as MCPRelayCommand;
      switch (request.action) {
        case 'status':
          break;
        case 'pair': {
          disconnect('Pairing again.');
          await endSessions();
          store.relayUrl = request.relayUrl;
          store.deviceToken = request.deviceToken;
          store.deviceId = undefined;
          store.enabled = true;
          save();
          error = undefined;
          attempt = 0;
          connect();
          break;
        }
        case 'connect': {
          if (!options.endpoint()) throw new Error('Enable external control before connecting the relay.');
          if (!options.createDevice) throw new Error('Account pairing is unavailable.');
          if (creatingDevice) throw new Error('Relay pairing is already in progress.');
          creatingDevice = true;
          try {
            const created = await options.createDevice();
            if (disposed || !options.endpoint()) throw new Error('External control was turned off while pairing. Connect again when it is enabled.');
            disconnect('Pairing again.');
            await endSessions();
            if (disposed || !options.endpoint()) throw new Error('External control was turned off while pairing.');
            store.relayUrl = validRelayURL(created.relayUrl);
            store.deviceToken = validDeviceToken(created.deviceToken);
            store.deviceId = created.deviceId;
            store.connectors = {};
            store.enabled = false;
            save();
            await api(`/relay/devices/${encodeURIComponent(created.deviceId)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: true }) }, created.deviceToken);
            if (disposed || !options.endpoint()) {
              await api(`/relay/devices/${encodeURIComponent(created.deviceId)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: false }) }, created.deviceToken).catch(() => {});
              throw new Error('External control was turned off while pairing.');
            }
            store.enabled = true;
            save();
            error = undefined;
            attempt = 0;
            connect();
          } finally { creatingDevice = false; changed(); }
          break;
        }
        case 'create': {
          const created = await api('/relay/devices', { method: 'POST', body: JSON.stringify({ name: request.name || 'Kudium Browser' }) }, request.bearer);
          if (typeof created.deviceToken !== 'string' || typeof created.deviceId !== 'string') throw new Error('The relay did not return a device.');
          disconnect('Pairing again.');
          await endSessions();
          store.relayUrl = request.relayUrl;
          store.deviceToken = created.deviceToken;
          store.deviceId = created.deviceId;
          store.enabled = true;
          save();
          await api(`/relay/devices/${encodeURIComponent(created.deviceId)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: true }) }, created.deviceToken).catch(() => {});
          attempt = 0;
          connect();
          break;
        }
        case 'unpair': {
          const { deviceToken, deviceId } = store;
          await dropAll('The relay device was removed.');
          if (deviceToken && deviceId)
            await api(`/relay/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }, deviceToken).catch(() => {});
          store.deviceToken = undefined;
          store.deviceId = undefined;
          store.enabled = false;
          store.connectors = {};
          save();
          break;
        }
        case 'enable': {
          store.enabled = request.enabled;
          save();
          if (!request.enabled) {
            await dropAll('The relay was turned off.');
            if (store.deviceToken && store.deviceId)
              await api(`/relay/devices/${encodeURIComponent(store.deviceId)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: false }) }, store.deviceToken).catch(() => {});
          } else {
            if (!store.deviceToken) throw new Error('Pair this browser with the relay first.');
            if (store.deviceId)
              await api(`/relay/devices/${encodeURIComponent(store.deviceId)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: true }) }, store.deviceToken).catch(() => {});
            attempt = 0;
            connect();
          }
          break;
        }
        case 'projectTools':
          store.allowProjectTools = request.allowed;
          save();
          break;
        case 'ceiling': {
          const entry = store.connectors[request.connectorId];
          if (!entry) throw new Error('Unknown connector.');
          entry.ceiling = request.ceiling;
          save();
          if (store.deviceToken && store.deviceId)
            await api(`/relay/devices/${encodeURIComponent(store.deviceId)}/connectors/${encodeURIComponent(request.connectorId)}`, { method: 'POST', body: JSON.stringify({ ceiling: request.ceiling }) }, store.deviceToken).catch(() => {});
          break;
        }
        case 'revoke': {
          delete store.connectors[request.connectorId];
          save();
          await endSessions(request.connectorId);
          if (store.deviceToken && store.deviceId)
            await api(`/relay/devices/${encodeURIComponent(store.deviceId)}/connectors/${encodeURIComponent(request.connectorId)}/revoke`, { method: 'POST' }, store.deviceToken).catch(() => {});
          break;
        }
        case 'quickTunnel':
          if (request.running) startTunnel();
          else { stopTunnel(); tunnelError = undefined; }
          break;
        default:
          break;
      }
      changed();
      return status();
    },
    /** Test and diagnostics: current relay sessions per connector. */
    sessions: () => new Map([...sessions.entries()].map(([id, set]) => [id, [...set]])),
    async dispose() {
      disposed = true;
      await dropAll('Kudium Browser is closing.');
    },
  };
}
export type MCPRelayClient = ReturnType<typeof createMCPRelayClient>;
