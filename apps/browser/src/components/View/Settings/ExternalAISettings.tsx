import type { MCPConnection } from '../../../browser/mcp';
import { normalizeMCPTunnelURL, mcpTunnelConnection } from '../../../browser/mcpTunnel';
/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useEffect, useState } from 'react';
import { Button, Switch, Callout } from '@radix-ui/themes';
import type { MCPStatus } from '../../../browser/mcp';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { PersonalAgentSettings } from './PersonalAgentSettings';
import { MCPRelaySettings } from './MCPRelaySettings';

const message = (reason: unknown) =>
  (reason as Error).message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  );

export function ExternalAISettings() {
  const [status, setStatus] = useState<MCPStatus>();
  const [port, setPort] = useState(43187);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [format, setFormat] = useState<'http' | 'https' | 'stdio' | 'tunnel'>('http');
  const [tunnelDraft, setTunnelDraft] = useState<string>();
  const [tunnelError, setTunnelError] = useState('');
  const [configuration, setConfiguration] = useState('');
  const [configError, setConfigError] = useState('');
  const [revision, setRevision] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const validPort = Number.isInteger(port) && port >= 1024 && port <= 65535;
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      const value = await window.electron.ai.mcpStatus();
      setStatus(value);
      setPort(value.port);
      setRevision((current) => current + 1);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    window.electron.ai
      .mcpStatus()
      .then((value) => {
        if (alive) {
          setStatus(value);
          setPort(value.port);
        }
        return undefined;
      })
      .catch((reason) => {
        if (alive) setError(message(reason));
      });
    const syncStatus = () => {
      window.electron.ai
        .mcpStatus()
        .then((value) => {
          if (alive) {
            setStatus(value);
            setError('');
          }
          return undefined;
        })
        .catch((reason) => {
          if (alive) setError(message(reason));
        });
    };
    window.addEventListener('focus', syncStatus);
    const timer = window.setInterval(syncStatus, 5000);
    const cleanup = window.electron.ai.onMCP((value) => {
      if (!alive) return;
      setStatus(value);
      setError('');
      setRevision((current) => current + 1);
    });
    return () => {
      alive = false;
      window.clearInterval(timer);
      cleanup();
      window.removeEventListener('focus', syncStatus);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setConfiguration('');
    setConfigError('');
    if (status?.running && manualOpen) {
      const request: Promise<unknown> =
        format === 'stdio'
          ? window.electron.ai.mcpStdio()
          : window.electron.ai.mcpConnection();
      request
        .then((value) => {
          if (alive) {
            let shown = value;
            if (format === 'tunnel') shown = mcpTunnelConnection(value as MCPConnection, status.tunnelUrl || '');
            else if (format === 'https' && status.httpsUrl) {
              const connection = value as MCPConnection;
              shown = { mcpServers: { kudiumbrowser: { ...connection.mcpServers.kudiumbrowser, url: status.httpsUrl } } };
            }
            setConfiguration(JSON.stringify(shown, null, 2));
          }
          return undefined;
        })
        .catch((reason) => {
          if (alive) setConfigError(message(reason));
        });
    }
    return () => {
      alive = false;
    };
  }, [status?.running, status?.url, status?.tunnelUrl, status?.httpsUrl, format, revision, manualOpen]);
  const update = async (enabled: boolean, rotate = false) => {
    setBusy(true);
    setError('');
    setNotice('');
    setConfiguration('');
    try {
      const next = await window.electron.ai.mcpUpdate({
        enabled,
        port: !enabled && !validPort ? status?.port ?? 43187 : port,
        rotate,
      });
      setStatus(next);
      setPort(next.port);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(message(reason));
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };
  const saveTunnel = async () => {
    setTunnelError('');
    try {
      const tunnelUrl = normalizeMCPTunnelURL(tunnelDraft ?? status?.tunnelUrl ?? '');
      setBusy(true);
      const next = await window.electron.ai.mcpUpdate({ enabled: status?.enabled || false, tunnelUrl });
      setStatus(next);
      setTunnelDraft(undefined);
      setRevision(value => value + 1);
      setNotice(tunnelUrl ? 'Tunnel endpoint saved. Reachability has not been checked.' : 'Tunnel endpoint removed.');
    } catch (reason) { setTunnelError(message(reason)); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(configuration);
      setNotice('Copied.');
    } catch (reason) {
      setError(message(reason));
    }
  };
  const toggleHttps = async (https: boolean) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await window.electron.ai.mcpUpdate({ enabled: status?.enabled || false, port: status?.port, https });
      setStatus(next);
      setRevision((current) => current + 1);
      if (https)
        setNotice(
          next.httpsTrusted
            ? 'https ready: the local certificate authority is trusted for localhost only.'
            : 'https ready. The certificate authority could not be trusted automatically; see the note below.'
        );
      else setNotice('Local https turned off.');
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  };
  let connectionState = 'MCP service off';
  if (status?.enabled) connectionState = 'Connection unavailable';
  if (status?.running)
    connectionState = status.paused ? 'Paused by you' : 'Running';
  if (!status && !error) connectionState = 'Checking connection…';
  let serviceAction = 'Enable';
  if (status?.enabled) serviceAction = 'Retry';
  if (busy) serviceAction = 'Connecting…';
  return (
    <section className="external-ai-settings" aria-label="External AI control">
      <div className="preference-card">
        <div className="preference-row">
          <div>
            <div className="preference-label">
              <strong>Connect your coding agent</strong>
              <PreferenceHint label="Coding agent setup">
                Run npx @kudiumbrowser/mcp setup after enabling external
                control. Supports Codex, Claude Code, Cursor and VS Code with
                Node 22+. Approve in Kudium, then restart your agent.
              </PreferenceHint>
            </div>
            <p className="ai-model-help">Enable control, then run setup.</p>
            <code className="external-ai-setup-command">
              npx @kudiumbrowser/mcp setup
            </code>
          </div>
          <Button
            variant="soft"
            onClick={() =>
              navigator.clipboard
                .writeText('npx @kudiumbrowser/mcp setup')
                .then(() => setNotice('Setup command copied.'))
                .catch((reason) => setError(message(reason)))
            }
          >
            Copy setup command
          </Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="ai-model-help">
          {notice}
        </p>
      )}
      <PersonalAgentSettings
        revision={revision}
        busy={busy}
        onBusy={setBusy}
        onUpdated={refresh}
      />
      <div className="preference-card">
        <div className="preference-row">
          <div>
            <strong>External control</strong>
            <p className="ai-model-help" role="status">
              {connectionState}
            </p>
          </div>
          <div className="ai-port-controls">
            {status?.paused && status.running && (
              <Button
                variant="soft"
                disabled={busy}
                onClick={() =>
                  window.electron.ai
                    .resumeExternal()
                    .then(refresh)
                    .catch((reason) => setError(message(reason)))
                }
              >
                Resume
              </Button>
            )}
            {!status?.running && (
              <Button
                variant="soft"
                disabled={busy || !validPort}
                onClick={() => update(true)}
              >
                {serviceAction}
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={refresh}>
              Check status
            </Button>
            <Switch
              aria-label="Enable external control"
              checked={status?.enabled || false}
              disabled={busy || (!status?.enabled && !validPort)}
              onCheckedChange={(enabled) => update(enabled)}
            />
          </div>
        </div>
      </div>
      {(error || status?.error) && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>
            {error || status?.error}{' '}
            <Button
              type="button"
              variant="surface"
              size="1"
              disabled={busy}
              onClick={() => (status?.enabled ? update(true) : refresh())}
            >
              Retry connection
            </Button>
          </Callout.Text>
        </Callout.Root>
      )}
      <details className="ai-manual-connection" open={manualOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setManualOpen((value) => !value);
          }}
        >
          Other agents &amp; manual setup
        </summary>
        <div className="ai-manual-content">
          <div className="preference-card">
            <div className="preference-row">
              <label htmlFor="ai-mcp-port">Local port</label>
              <div className="ai-port-controls">
                <input
                  id="ai-mcp-port"
                  type="number"
                  min={1024}
                  max={65535}
                  value={port}
                  aria-invalid={!validPort}
                  aria-describedby={!validPort ? 'ai-port-error' : undefined}
                  disabled={busy}
                  onChange={(event) => setPort(Number(event.target.value))}
                />
                <Button
                  disabled={busy || !validPort || port === status?.port}
                  title={
                    port === status?.port
                      ? 'Port is already applied'
                      : undefined
                  }
                  variant="soft"
                  onClick={() => update(status?.enabled || false)}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
          {!validPort && (
            <p id="ai-port-error" role="alert" className="ai-model-help">
              Use a port from 1024 to 65535.
            </p>
          )}
          <div className="preference-card">
            <div className="preference-row">
              <div>
                <div className="preference-label">
                  <strong>Use https locally</strong>
                  <PreferenceHint label="Local https">
                    For clients that refuse plain http. Kudium creates a
                    certificate authority that can only sign for localhost,
                    127.0.0.1 and ::1, trusts it for your user account, proves
                    that a certificate for any other site is rejected, and
                    serves https on the next port. Node agents: run setup with
                    --https so NODE_EXTRA_CA_CERTS points at the CA file.
                  </PreferenceHint>
                </div>
                {status?.httpsUrl ? (
                  <p className="ai-model-help">
                    <code>{status.httpsUrl}</code>
                    <br />
                    CA certificate: <code>{status.caPath}</code>
                    {status.httpsTrusted === false && status.httpsNotice && (
                      <>
                        <br />
                        {status.httpsNotice}
                      </>
                    )}
                  </p>
                ) : (
                  <p className="ai-model-help">
                    {status?.https
                      ? status.httpsNotice || 'Enable external control to start https.'
                      : 'Off. http on 127.0.0.1 stays available either way.'}
                  </p>
                )}
              </div>
              <Button
                variant="soft"
                disabled={busy || !status?.enabled}
                onClick={() => toggleHttps(!status?.https)}
              >
                {status?.https ? 'Turn off https' : 'Use https locally'}
              </Button>
            </div>
          </div>
          <MCPRelaySettings externalEnabled={!!status?.enabled} />
          {status?.running ? (
            <div className="ai-connection-config">
              <div className="ai-config-toolbar">
                <label htmlFor="ai-mcp-format">Client configuration</label>
                <select
                  id="ai-mcp-format"
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value as 'http' | 'https' | 'stdio' | 'tunnel')
                  }
                >
                  <option value="http">HTTP</option>
                  {status?.httpsUrl && <option value="https">Local HTTPS</option>}
                  <option value="tunnel">Custom HTTPS / tunnel</option>
                  <option value="stdio">stdio · Node 22+</option>
                </select>
                <Button disabled={busy || !configuration} onClick={copy}>
                  Copy
                </Button>
              </div>
              {format === 'tunnel' && (
                <div className="preference-card">
                  <div className="preference-row">
                    <label htmlFor="ai-mcp-tunnel">Custom HTTPS endpoint</label>
                    <div className="ai-port-controls ai-tunnel-controls">
                      <input id="ai-mcp-tunnel" type="url" placeholder="https://your-tunnel.example/mcp"
                        value={tunnelDraft ?? status?.tunnelUrl ?? ''} disabled={busy}
                        onChange={event => { setTunnelDraft(event.target.value); setTunnelError(''); }}
                        aria-invalid={!!tunnelError} aria-describedby="ai-mcp-tunnel-help" />
                      <Button disabled={busy || !status || (tunnelDraft ?? status.tunnelUrl ?? '') === (status.tunnelUrl ?? '')} onClick={saveTunnel}>Save endpoint</Button>
                    </div>
                  </div>
                  <p id="ai-mcp-tunnel-help" className="ai-model-help">
                    Paste the MCP URL from your tunnel service. Kudium does not start the tunnel.
                  </p>
                  <details>
                    <summary>Tunnel requirements</summary>
                    <p className="ai-model-help">
                      Forward to {status?.url}, preserve Authorization and streaming, and set the upstream Host to 127.0.0.1:{status?.port}.
                      OAuth-only clients need an OAuth gateway. Your tunnel provider can see forwarded traffic.
                    </p>
                  </details>
                  {tunnelError && <p role="alert">{tunnelError}</p>}
                </div>
              )}
              <div className="ai-config-address">
                <span>Endpoint</span>
                <code>{format === 'tunnel' ? status.tunnelUrl || 'No tunnel endpoint configured' : format === 'https' ? status.httpsUrl || status.url : status.url}</code>
              </div>
              <textarea
                aria-label="MCP configuration"
                readOnly
                value={configuration}
                rows={9}
                spellCheck={false}
                placeholder={configError ? '' : 'Loading configuration…'}
              />
              {configError && (
                <p role="alert">
                  {configError}{' '}
                  <Button
                    type="button"
                    variant="surface"
                    size="1"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </p>
              )}
              <div className="ai-config-footer">
                <small>Contains a private access token.</small>
                <Button
                  disabled={busy}
                  variant="ghost"
                  onClick={() => update(true, true)}
                >
                  Reset token
                </Button>
              </div>
              <div className="ai-clients">
                <strong>Connected clients</strong>
                <small>
                  Each paired client has its own token and name on receipts. A
                  ceiling caps what it may do even in a Full access group.
                </small>
                {status.clients?.length ? (
                  <ul aria-label="Connected clients">
                    {status.clients.map((client) => (
                      <li key={client.id}>
                        <span>
                          {client.name}
                          {client.shared ? ' (shared token)' : ''}
                        </span>
                        <label htmlFor={`ai-client-ceiling-${client.id}`}>
                          Ceiling{' '}
                          <select
                            id={`ai-client-ceiling-${client.id}`}
                            aria-label={`Permission ceiling for ${client.name}`}
                            value={client.ceiling || ''}
                            disabled={busy}
                            onChange={(event) =>
                              window.electron.ai
                                .mcpClientCeiling(
                                  client.id,
                                  (event.target.value || undefined) as
                                    | 'ask'
                                    | 'standard'
                                    | 'full'
                                    | undefined
                                )
                                .catch((reason) => setError(message(reason)))
                            }
                          >
                            <option value="">Group access</option>
                            <option value="ask">Ask first</option>
                            <option value="standard">Standard</option>
                            <option value="full">Full access</option>
                          </select>
                        </label>
                        <Button
                          size="1"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            window.electron.ai
                              .mcpRevokeClient(client.id)
                              .catch((reason) => setError(message(reason)))
                          }
                        >
                          Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <small>No client has paired yet.</small>
                )}
                <Button
                  size="1"
                  variant="surface"
                  disabled={busy}
                  onClick={() =>
                    window.electron.ai
                      .mcpExportAudit()
                      .then((result) => {
                        if (result.exported)
                          setNotice(`Exported ${result.runs ?? 0} runs to ${result.path}.`);
                        return result;
                      })
                      .catch((reason) => setError(message(reason)))
                  }
                >
                  Export audit log
                </Button>
              </div>
            </div>
          ) : (
            <div className="ai-connection-off">
              <p>
                External control is {status?.enabled ? 'unavailable' : 'off'}.
              </p>
              <small>
                Enable MCP to connect an external AI. No API key needed.
              </small>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
