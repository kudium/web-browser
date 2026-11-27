/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useEffect, useState } from 'react';
import { Button, Switch } from '@radix-ui/themes';
import type { MCPRelayStatus, RelayCeiling } from '../../../browser/mcpRelay';
import { RELAY_CEILINGS, RELAY_DEFAULT_URL } from '../../../browser/mcpRelay';
import { PreferenceHint } from '../../UI/PreferenceHint';

const message = (reason: unknown) =>
  (reason as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/**
 * Cloud relay: lets claude.ai-style connectors reach this browser without a
 * manual tunnel. Off by default; the device token is pasted once and kept in
 * the private store; every remote connector is capped at Standard until the
 * user raises it here.
 */
export function MCPRelaySettings({ externalEnabled }: { externalEnabled: boolean }) {
  const [status, setStatus] = useState<MCPRelayStatus>();
  const [relayUrl, setRelayUrl] = useState(RELAY_DEFAULT_URL);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apply = async (request: Parameters<typeof window.electron.ai.mcpRelay>[0]) => {
    setBusy(true);
    setError('');
    try {
      const next = await window.electron.ai.mcpRelay(request);
      setStatus(next);
      setRelayUrl(next.relayUrl);
      return next;
    } catch (reason) {
      setError(message(reason));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    // Older preloads (and settings tests) have no relay API: render nothing live.
    if (typeof window.electron.ai.mcpRelay !== 'function' || typeof window.electron.ai.onMCPRelay !== 'function')
      return undefined;
    window.electron.ai
      .mcpRelay({ action: 'status' })
      .then((value) => {
        if (alive) {
          setStatus(value);
          setRelayUrl(value.relayUrl);
        }
        return undefined;
      })
      .catch((reason) => {
        if (alive) setError(message(reason));
      });
    const stop = window.electron.ai.onMCPRelay((value) => {
      if (alive) setStatus(value);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);
  const connection = !status
    ? ''
    : !status.paired
      ? 'Not paired.'
      : !status.enabled
        ? 'Paired, off.'
        : status.connected
          ? `Connected${status.urls ? ` · ${status.urls.host || status.urls.path}` : ''}`
          : status.reconnectInMs !== undefined
            ? `Reconnecting in ${Math.ceil(status.reconnectInMs / 1000)} s`
            : externalEnabled
              ? 'Connecting…'
              : 'Waiting for external control.';
  return (
    <div className="preference-card">
      <div className="preference-row">
        <div>
          <div className="preference-label">
            <strong>Cloud relay</strong>
            <PreferenceHint label="Cloud relay">
              Keeps one outgoing connection from this browser to the Kudium
              relay so cloud assistants (claude.ai connectors and similar)
              can reach it without a tunnel. The relay forwards requests and
              keeps no browser state; third-party clients are decrypted at
              the relay, Kudium&apos;s own clients stay end-to-end encrypted.
              Every remote connector is approved here, capped at Standard,
              and cannot touch project folders, scripts or terminals unless
              you allow it below. Turning off external control or the relay
              drops every remote session at once.
            </PreferenceHint>
          </div>
          <p className="ai-model-help">{connection}</p>
          {status?.error && (
            <p className="ai-model-help" role="alert">
              {status.error}
            </p>
          )}
        </div>
        <Switch
          checked={!!status?.enabled}
          disabled={busy || !status?.paired}
          onCheckedChange={(enabled) => apply({ action: 'enable', enabled })}
          aria-label="Cloud relay"
        />
      </div>
      {!status?.paired ? (
        <div className="ai-model-row">
          <label htmlFor="ai-relay-url">Relay</label>
          <input
            id="ai-relay-url"
            type="url"
            value={relayUrl}
            disabled={busy}
            onChange={(event) => setRelayUrl(event.target.value)}
          />
          <label htmlFor="ai-relay-token">Device token</label>
          <input
            id="ai-relay-token"
            type="password"
            autoComplete="off"
            placeholder="kd_…"
            value={token}
            disabled={busy}
            onChange={(event) => setToken(event.target.value)}
          />
          <Button
            variant="soft"
            disabled={busy || !token.trim()}
            onClick={async () => {
              const next = await apply({ action: 'pair', relayUrl, deviceToken: token.trim() });
              if (next) setToken('');
            }}
          >
            Pair
          </Button>
          <p className="ai-model-help">
            Create the device on the relay while signed in, copy its token once, and paste it here. The token is stored privately on this Mac.
          </p>
        </div>
      ) : (
        <>
          <div className="preference-row">
            <div>
              <div className="preference-label">
                <strong>Allow project tools remotely</strong>
              </div>
              <p className="ai-model-help">
                Off keeps files, scripts and terminals local-only. On applies the same reviews a local agent gets.
              </p>
            </div>
            <Switch
              checked={!!status.allowProjectTools}
              disabled={busy}
              onCheckedChange={(allowed) => apply({ action: 'projectTools', allowed })}
              aria-label="Allow project tools remotely"
            />
          </div>
          {status.connectors.length ? (
            <ul className="ai-relay-connectors">
              {status.connectors.map((connector) => (
                <li key={connector.id} className="preference-row">
                  <div>
                    <strong>{connector.name}</strong>
                    <p className="ai-model-help">
                      {connector.requests} request{connector.requests === 1 ? '' : 's'}
                      {connector.lastSeen ? ` · last ${new Date(connector.lastSeen).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <select
                    aria-label={`Ceiling for ${connector.name}`}
                    value={connector.ceiling}
                    disabled={busy}
                    onChange={(event) =>
                      apply({ action: 'ceiling', connectorId: connector.id, ceiling: event.target.value as RelayCeiling })
                    }
                  >
                    {RELAY_CEILINGS.map((ceiling) => (
                      <option key={ceiling} value={ceiling}>
                        {ceiling === 'ask' ? 'Ask first' : ceiling === 'standard' ? 'Standard' : 'Full access'}
                      </option>
                    ))}
                  </select>
                  <Button variant="ghost" disabled={busy} onClick={() => apply({ action: 'revoke', connectorId: connector.id })}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ai-model-help">No remote connectors yet. Approve one when a cloud assistant asks.</p>
          )}
          <div className="ai-config-footer">
            <small>Device {status.deviceId || '(pending)'} · e2e key {status.devicePublicKey?.slice(0, 12)}…</small>
            <Button variant="ghost" disabled={busy} onClick={() => apply({ action: 'unpair' })}>
              Remove device
            </Button>
          </div>
        </>
      )}
      <div className="preference-row">
        <div>
          <div className="preference-label">
            <strong>Quick tunnel</strong>
            <PreferenceHint label="Quick tunnel">
              Fallback without the relay: runs the cloudflared you installed
              (never downloaded by Kudium) to expose the local MCP endpoint
              at a temporary trycloudflare.com address. The connection token
              still applies. Stops when turned off or when Kudium quits.
            </PreferenceHint>
          </div>
          <p className="ai-model-help">
            {status?.quickTunnel.running
              ? status.quickTunnel.url
                ? `${status.quickTunnel.url}/mcp`
                : 'Starting…'
              : status?.quickTunnel.available
                ? 'Off.'
                : 'cloudflared is not installed.'}
            {status?.quickTunnel.error ? ` ${status.quickTunnel.error}` : ''}
          </p>
        </div>
        <Button
          variant="soft"
          disabled={busy || !externalEnabled || !status?.quickTunnel.available}
          onClick={() => apply({ action: 'quickTunnel', running: !status?.quickTunnel.running })}
        >
          {status?.quickTunnel.running ? 'Stop tunnel' : 'Use quick tunnel'}
        </Button>
      </div>
      {error && (
        <p className="ai-model-help" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
