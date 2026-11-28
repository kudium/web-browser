/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useEffect, useState } from 'react';
import { Button, Switch } from '@radix-ui/themes';
import type { MCPRelayStatus, RelayCeiling } from '../../../browser/mcpRelay';
import { RELAY_CEILINGS, RELAY_DEFAULT_URL } from '../../../browser/mcpRelay';
import { PreferenceHint } from '../../UI/PreferenceHint';

const message = (reason: unknown) =>
  (reason as Error).message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  );

/**
 * Cloud relay: lets claude.ai-style connectors reach this browser without a
 * manual tunnel. Off by default; account pairing creates a device token kept in
 * the private store; every remote connector is capped at Standard until the
 * user raises it here.
 */
export function MCPRelaySettings({
  externalEnabled,
  onQuickTunnelChange,
  onEnableExternal,
  onOpenAccount,
}: {
  externalEnabled: boolean;
  onEnableExternal?: () => Promise<boolean>;
  onOpenAccount?: () => void;
  onQuickTunnelChange?: (status: MCPRelayStatus['quickTunnel']) => void;
}) {
  const [status, setStatus] = useState<MCPRelayStatus>();
  const [relayUrl, setRelayUrl] = useState(RELAY_DEFAULT_URL);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apply = async (
    request: Parameters<typeof window.electron.ai.mcpRelay>[0]
  ) => {
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
  const enableExternal = async () => {
    setBusy(true);
    setError('');
    try {
      if (!onEnableExternal)
        throw new Error(
          'Enable external control above before connecting the relay.'
        );
      if (!(await onEnableExternal()))
        setError(
          'External control could not start. Check the local port setting and try again.'
        );
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    // Older preloads (and settings tests) have no relay API: render nothing live.
    if (
      typeof window.electron.ai.mcpRelay !== 'function' ||
      typeof window.electron.ai.onMCPRelay !== 'function'
    )
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
  useEffect(() => {
    if (status?.quickTunnel) onQuickTunnelChange?.(status.quickTunnel);
  }, [status?.quickTunnel, onQuickTunnelChange]);
  const apiAvailable =
    typeof window.electron.ai.mcpRelay === 'function' &&
    typeof window.electron.ai.onMCPRelay === 'function';
  const accountUnavailable =
    !apiAvailable || status?.account?.available === false;
  const signedOut = status?.account?.signedIn === false;
  const connection = !status
    ? apiAvailable
      ? 'Checking relay…'
      : 'Unavailable.'
    : !status.paired
      ? 'Not paired.'
      : !status.enabled
        ? 'Paired, off.'
        : status.connected
          ? 'Connected.'
          : status.reconnectInMs !== undefined
            ? `Reconnecting in ${Math.ceil(status.reconnectInMs / 1000)} s`
            : externalEnabled
              ? 'Connecting…'
              : 'Waiting for external control.';
  return (
    <div className="preference-card ai-relay-settings">
      <div className="preference-row">
        <div>
          <div className="preference-label">
            <strong>Cloud relay</strong>
            <PreferenceHint label="Cloud relay">
              Keeps one outgoing connection from this browser to the Kudium
              relay so cloud assistants (claude.ai connectors and similar) can
              reach it without a tunnel. The relay forwards requests and keeps
              no browser state; third-party clients are decrypted at the relay,
              Kudium&apos;s own clients stay end-to-end encrypted. Every remote
              connector is approved here, capped at Standard, and cannot touch
              project folders, scripts or terminals unless you allow it below.
              Turning off external control or the relay drops every remote
              session at once.
            </PreferenceHint>
          </div>
          <p className="ai-model-help">{connection}</p>
          {(error || status?.error) && (
            <p className="ai-model-help" role="alert">
              {error || status?.error}
            </p>
          )}
        </div>
        {status?.paired && (
          <Switch
            checked={!!status?.enabled}
            disabled={busy || (!status.enabled && !externalEnabled)}
            onCheckedChange={(enabled) => apply({ action: 'enable', enabled })}
            aria-label="Cloud relay"
            title="Allow cloud assistants to connect to this paired browser"
          />
        )}
      </div>
      {!status?.paired ? (
        <div className="ai-relay-onboarding">
          <p className="ai-model-help">
            {accountUnavailable
              ? status?.account?.reason ||
                'Cloud relay is unavailable in this environment. Open a regular Kudium browser window.'
              : signedOut
                ? 'Sign in to Kudium to link this browser. Encrypted sync can stay off.'
                : !externalEnabled
                  ? 'Enable external control to let a cloud assistant connect to this browser.'
                  : 'Connect this browser to your Kudium account. Its device credential is created and stored privately.'}
          </p>
          {!accountUnavailable && (
            <Button
              variant="soft"
              disabled={busy || !status}
              onClick={async () => {
                if (signedOut) {
                  if (onOpenAccount) onOpenAccount();
                  else
                    setError('Open Preferences → Sync to sign in to Kudium.');
                } else if (!externalEnabled) {
                  await enableExternal();
                } else await apply({ action: 'connect' });
              }}
            >
              {busy
                ? 'Connecting…'
                : signedOut
                  ? 'Sign in to Kudium'
                  : !externalEnabled
                    ? 'Enable external control'
                    : 'Connect cloud relay'}
            </Button>
          )}
          {apiAvailable && (
            <details className="ai-relay-advanced">
              <summary>Pair with an existing device token</summary>
              <div className="ai-relay-pairing">
                <div className="ai-relay-field">
                  <label htmlFor="ai-relay-url">Relay</label>
                  <input
                    id="ai-relay-url"
                    type="url"
                    value={relayUrl}
                    disabled={busy}
                    onChange={(event) => setRelayUrl(event.target.value)}
                  />
                </div>
                <div className="ai-relay-field">
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
                </div>
                <Button
                  variant="soft"
                  disabled={busy || !token.trim()}
                  onClick={async () => {
                    const next = await apply({
                      action: 'pair',
                      relayUrl,
                      deviceToken: token.trim(),
                    });
                    if (next) setToken('');
                  }}
                >
                  Pair
                </Button>
                <p className="ai-model-help">
                  For a custom relay, use the device token returned by its
                  administrator or device-creation API. It stays private on this
                  Mac. For Kudium’s relay, use Connect cloud relay above; no
                  token is needed.
                </p>
              </div>
            </details>
          )}
        </div>
      ) : (
        <>
          {!externalEnabled && (
            <div className="ai-relay-onboarding">
              <p className="ai-model-help">
                External control is off. Enable it to resume cloud connections.
              </p>
              {onEnableExternal && (
                <Button variant="soft" disabled={busy} onClick={enableExternal}>
                  Enable external control
                </Button>
              )}
            </div>
          )}
          {status.urls && (
            <div className="ai-relay-connector-url">
              <p className="ai-model-help">
                Add this connector URL in your cloud assistant, then approve its
                request in Kudium.
              </p>
              <code>{status.urls.path || status.urls.host}</code>
              <Button
                variant="soft"
                onClick={() =>
                  navigator.clipboard
                    .writeText(status.urls!.path || status.urls!.host || '')
                    .catch((reason) => setError(message(reason)))
                }
              >
                Copy connector URL
              </Button>
            </div>
          )}
          <div className="preference-row">
            <div>
              <div className="preference-label">
                <strong>Allow project tools remotely</strong>
              </div>
              <p className="ai-model-help">
                Off keeps files, scripts and terminals local-only. On applies
                the same reviews a local agent gets.
              </p>
            </div>
            <Switch
              checked={!!status.allowProjectTools}
              disabled={busy}
              onCheckedChange={(allowed) =>
                apply({ action: 'projectTools', allowed })
              }
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
                      {connector.requests} request
                      {connector.requests === 1 ? '' : 's'}
                      {connector.lastSeen
                        ? ` · last ${new Date(connector.lastSeen).toLocaleString()}`
                        : ''}
                    </p>
                  </div>
                  <select
                    aria-label={`Ceiling for ${connector.name}`}
                    value={connector.ceiling}
                    disabled={busy}
                    onChange={(event) =>
                      apply({
                        action: 'ceiling',
                        connectorId: connector.id,
                        ceiling: event.target.value as RelayCeiling,
                      })
                    }
                  >
                    {RELAY_CEILINGS.map((ceiling) => (
                      <option key={ceiling} value={ceiling}>
                        {ceiling === 'ask'
                          ? 'Ask first'
                          : ceiling === 'standard'
                            ? 'Standard'
                            : 'Full access'}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      apply({ action: 'revoke', connectorId: connector.id })
                    }
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ai-model-help">
              No remote connectors yet. Approve one when a cloud assistant asks.
            </p>
          )}
          <div className="ai-config-footer">
            <small>
              Device {status.deviceId || '(pending)'} · e2e key{' '}
              {status.devicePublicKey?.slice(0, 12)}…
            </small>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => apply({ action: 'unpair' })}
            >
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
              (never downloaded by Kudium) to expose the local MCP endpoint at a
              temporary trycloudflare.com address. The connection token still
              applies. Stops when turned off or when Kudium quits.
            </PreferenceHint>
          </div>
          <p className="ai-model-help">
            {status?.quickTunnel.running
              ? status.quickTunnel.ready && status.quickTunnel.url
                ? `${status.quickTunnel.url}/mcp`
                : status.quickTunnel.url
                  ? 'Connecting to Cloudflare…'
                  : 'Starting…'
              : status?.quickTunnel.available
                ? 'Off.'
                : 'Install cloudflared first: brew install cloudflared.'}
          </p>
        </div>
        <Button
          variant="soft"
          disabled={
            busy ||
            (!status?.quickTunnel.running &&
              (!externalEnabled || !status?.quickTunnel.available))
          }
          onClick={() =>
            apply({
              action: 'quickTunnel',
              running: !status?.quickTunnel.running,
            })
          }
        >
          {status?.quickTunnel.running ? 'Stop tunnel' : 'Use quick tunnel'}
        </Button>
      </div>
      {status?.quickTunnel.error && (
        <p className="ai-model-help" role="alert">
          {status.quickTunnel.error}
        </p>
      )}
    </div>
  );
}
