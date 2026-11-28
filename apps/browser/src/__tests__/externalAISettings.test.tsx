import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { ExternalAISettings } from '../components/View/Settings/ExternalAISettings';

beforeEach(() => {
  const status = {
    enabled: false,
    running: false,
    port: 43187,
    url: 'http://127.0.0.1:43187/mcp',
  };
  Object.assign(window, {
    electron: {
      browser: {
        preferences: jest
          .fn()
          .mockResolvedValue({ writeBrowserInstructions: true }),
      },
      ai: {
        personalAgents: jest.fn().mockResolvedValue({
          agents: [
            {
              id: 'hermes',
              state: 'missing',
              configPath: '/fixture/.hermes/config.yaml',
            },
            {
              id: 'openclaw',
              state: 'missing',
              configPath: '/fixture/.openclaw/openclaw.json',
            },
          ],
        }),
        mcpStatus: jest.fn().mockResolvedValue(status),
        onMCP: jest.fn(() => () => {}),
        mcpUpdate: jest
          .fn()
          .mockResolvedValue({ ...status, enabled: true, running: true }),
        mcpConnection: jest.fn().mockResolvedValue({
          mcpServers: {
            kudiumbrowser: {
              url: status.url,
              headers: { Authorization: 'Bearer test-token' },
            },
          },
        }),
        mcpStdio: jest.fn().mockResolvedValue({
          mcpServers: {
            kudiumbrowser: { command: 'node', args: ['bridge.cjs'] },
          },
        }),
      },
    },
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

it('offers enable while off, then displays and copies the selected configuration', async () => {
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText('External control is off.');
  fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value
    ).toContain('Bearer test-token')
  );
  expect(window.electron.ai.mcpUpdate).toHaveBeenCalledWith({
    enabled: true,
    port: 43187,
    rotate: false,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() =>
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      (screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value
    )
  );
  fireEvent.change(screen.getByLabelText('Client configuration'), {
    target: { value: 'stdio' },
  });
  await waitFor(() =>
    expect(
      (screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value
    ).toContain('bridge.cjs')
  );
});

it('recovers from a failed status request without leaving enable permanently disabled', async () => {
  (window.electron.ai.mcpStatus as jest.Mock).mockRejectedValueOnce(
    new Error('Service unavailable')
  );
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText(/Service unavailable/);
  expect(
    screen.getByRole('switch', { name: 'Enable external control' })
  ).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  await waitFor(() =>
    expect(screen.queryByText(/Service unavailable/)).not.toBeInTheDocument()
  );
});

it('rechecks service state on focus and enables copy for a running service', async () => {
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText('External control is off.');
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({
    enabled: true,
    running: true,
    port: 43187,
    url: 'http://127.0.0.1:43187/mcp',
  });
  fireEvent(window, new Event('focus'));
  await screen.findByText('Running');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
  );
  expect(screen.getByText('http://127.0.0.1:43187/mcp')).toBeInTheDocument();
});

it('reconnects an enabled service after a startup failure', async () => {
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({
    enabled: true,
    running: false,
    port: 43187,
    error: 'Port occupied',
  });
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText(/Port occupied/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  await screen.findByText('Running');
  expect(window.electron.ai.mcpUpdate).toHaveBeenCalledWith({
    enabled: true,
    port: 43187,
    rotate: false,
  });
});

it('allows disabling a running service even when the edited port is invalid', async () => {
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({
    enabled: true,
    running: true,
    port: 43187,
    url: 'http://127.0.0.1:43187/mcp',
  });
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText('Running');
  fireEvent.change(screen.getByLabelText('Local port'), {
    target: { value: '80' },
  });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check status' })).toBeEnabled();
  expect(
    screen.getByRole('switch', { name: 'Enable external control' })
  ).toBeEnabled();
  fireEvent.click(
    screen.getByRole('switch', { name: 'Enable external control' })
  );
  await waitFor(() =>
    expect(window.electron.ai.mcpUpdate).toHaveBeenCalledWith({
      enabled: false,
      port: 43187,
      rotate: false,
    })
  );
});

it('clears a stale connection error when focus discovers a healthy service', async () => {
  (window.electron.ai.mcpStatus as jest.Mock).mockRejectedValueOnce(
    new Error('Connection lost')
  );
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText(/Connection lost/);
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({
    enabled: true,
    running: true,
    port: 43187,
    url: 'http://127.0.0.1:43187/mcp',
  });
  fireEvent(window, new Event('focus'));
  await screen.findByText('Running');
  expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
  );
});

it('keeps a healthy connection usable without offering a disruptive reconnect', async () => {
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({
    enabled: true,
    running: true,
    port: 43187,
    url: 'http://127.0.0.1:43187/mcp',
  });
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText('Running');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
  );
  expect(
    screen.queryByRole('button', { name: 'Reconnect' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry' })
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reset token' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(window.electron.ai.mcpUpdate).not.toHaveBeenCalled();
});

it('retries loading visible configuration after a connection error', async () => {
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({
    enabled: true,
    running: true,
    port: 43187,
    url: 'http://127.0.0.1:43187/mcp',
  });
  (window.electron.ai.mcpConnection as jest.Mock).mockRejectedValueOnce(
    new Error('Configuration unavailable')
  );
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText(/Configuration unavailable/);
  expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
  );
  expect(
    screen.queryByText(/Configuration unavailable/)
  ).not.toBeInTheDocument();
  expect(
    (screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value
  ).toContain('Bearer test-token');
});

it('resumes a human-paused connection without restarting MCP or changing its token', async () => {
  const status = {
    enabled: true,
    running: true,
    paused: true,
    port: 43187,
    url: 'http://127.0.0.1:43187/mcp',
  };
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue(status);
  window.electron.ai.resumeExternal = jest.fn(async () => {
    (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({
      ...status,
      paused: false,
    });
  });
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText('Paused by you');
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await screen.findByText('Running');
  expect(window.electron.ai.resumeExternal).toHaveBeenCalledTimes(1);
  expect(window.electron.ai.mcpUpdate).not.toHaveBeenCalled();
});

it('connects a detected personal agent without asking the user to copy configuration', async () => {
  const agents = [
    {
      id: 'hermes',
      state: 'available',
      configPath: '/fixture/.hermes/config.yaml',
    },
    {
      id: 'openclaw',
      state: 'missing',
      configPath: '/fixture/.openclaw/openclaw.json',
    },
  ];
  (window.electron.ai.personalAgents as jest.Mock).mockImplementation(
    async (request) => {
      if (request.action === 'connect') {
        agents[0].state = 'configured';
        (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({
          enabled: true,
          running: true,
          port: 43187,
          url: 'http://127.0.0.1:43187/mcp',
        });
        return { agents: [...agents], changed: true };
      }
      return { agents };
    }
  );
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  const connectButton = await screen.findByRole('button', {
    name: 'Connect Hermes',
  });
  await waitFor(() => expect(connectButton).toBeEnabled());
  fireEvent.click(connectButton);
  await screen.findByRole('button', { name: 'Disconnect Hermes' });
  expect(window.electron.ai.personalAgents).toHaveBeenCalledWith({
    id: 'hermes',
    action: 'connect',
  });
  expect(window.electron.ai.mcpConnection).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Copy' })).not.toBeVisible();
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  expect(screen.getByText(/Hermes configured/)).toHaveTextContent(
    'Usually available within a minute.'
  );
});

it('locates missing agents and keeps setup failures visible outside advanced settings', async () => {
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  const locate = await screen.findByRole('button', { name: 'Locate OpenClaw' });
  await waitFor(() => expect(locate).toBeEnabled());
  (window.electron.ai.personalAgents as jest.Mock).mockRejectedValueOnce(
    new Error('Choose a valid configuration')
  );
  fireEvent.click(locate);
  expect(await screen.findByText('Choose a valid configuration')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  expect(window.electron.ai.mcpUpdate).not.toHaveBeenCalled();
});

it('rescans agent configurations when the user returns to Preferences', async () => {
  render(
    <Theme>
      <ExternalAISettings />
    </Theme>
  );
  await screen.findByRole('button', { name: 'Locate Hermes' });
  (window.electron.ai.personalAgents as jest.Mock).mockResolvedValue({
    agents: [
      {
        id: 'hermes',
        state: 'available',
        configPath: '/fixture/.hermes/config.yaml',
      },
      {
        id: 'openclaw',
        state: 'missing',
        configPath: '/fixture/.openclaw/openclaw.json',
      },
    ],
  });
  fireEvent(window, new Event('focus'));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Connect Hermes' })).toBeEnabled()
  );
});

it('saves a user tunnel and copies its HTTPS URL with the existing bearer token', async () => {
  const status = { enabled: true, running: true, port: 43187, url: 'http://127.0.0.1:43187/mcp' };
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue(status);
  (window.electron.ai.mcpUpdate as jest.Mock).mockImplementation(async patch => ({ ...status, tunnelUrl: patch.tunnelUrl }));
  render(<Theme><ExternalAISettings /></Theme>);
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText('Running');
  expect(screen.queryByLabelText('Custom HTTPS endpoint')).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: /^HTTP$/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Client configuration'), { target: { value: 'tunnel' } });
  fireEvent.change(screen.getByLabelText('Custom HTTPS endpoint'), { target: { value: 'https://custom.example/bridge/mcp' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));
  await screen.findByText('Tunnel endpoint saved. Reachability has not been checked.');
  expect(window.electron.ai.mcpUpdate).toHaveBeenCalledWith({ enabled: true, tunnelUrl: 'https://custom.example/bridge/mcp' });
  fireEvent.change(screen.getByLabelText('Client configuration'), { target: { value: 'tunnel' } });
  await waitFor(() => expect((screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value).toContain('https://custom.example/bridge/mcp'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Bearer test-token')));
  fireEvent.change(screen.getByLabelText('Client configuration'), { target: { value: 'http' } });
  await waitFor(() => expect((screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value).toContain(status.url));
});

it('rejects insecure tunnel URLs and keeps unsaved endpoints out of configuration', async () => {
  (window.electron.ai.mcpStatus as jest.Mock).mockResolvedValue({ enabled: true, running: true, port: 43187, url: 'http://127.0.0.1:43187/mcp' });
  render(<Theme><ExternalAISettings /></Theme>);
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText('Running');
  expect(screen.queryByLabelText('Custom HTTPS endpoint')).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: /^HTTP$/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Client configuration'), { target: { value: 'tunnel' } });
  fireEvent.change(screen.getByLabelText('Custom HTTPS endpoint'), { target: { value: 'http://custom.example/mcp' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));
  await screen.findByText('Use HTTPS without credentials, query parameters or a fragment.');
  expect(window.electron.ai.mcpUpdate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Client configuration'), { target: { value: 'tunnel' } });
  await screen.findByText('Save an HTTPS tunnel endpoint before copying its configuration.');
  expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
});

it('connects the relay through the native account action and exposes its path URL', async () => {
  const relay = { enabled: false, paired: false, connected: false, relayUrl: 'https://browser.kudium.com', allowProjectTools: false, connectors: [], quickTunnel: { running: false, available: true } };
  Object.assign(window.electron.ai, {
    mcpStatus: jest.fn().mockResolvedValue({ enabled: true, running: true, port: 43187, url: 'http://127.0.0.1:43187/mcp' }),
    onMCPRelay: jest.fn(() => () => {}),
    mcpRelay: jest.fn(async (request) => request.action === 'status' ? relay : { ...relay, enabled: true, paired: true, connected: true, urls: { path: 'https://browser.kudium.com/relay/d/abcdefghijklmnop/mcp', host: 'https://unused.relay.kudium.com/mcp' } }),
  });
  render(<Theme><ExternalAISettings /></Theme>);
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText(/device credential is created/);
  fireEvent.click(screen.getByRole('button', { name: 'Connect cloud relay' }));
  await screen.findByRole('button', { name: 'Copy connector URL' });
  expect(window.electron.ai.mcpRelay).toHaveBeenCalledWith({ action: 'connect' });
  fireEvent.click(screen.getByRole('button', { name: 'Copy connector URL' }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://browser.kudium.com/relay/d/abcdefghijklmnop/mcp');
});

it('uses only a ready quick tunnel in client configuration and falls back when it stops', async () => {
  let relay = { enabled: false, paired: false, connected: false, relayUrl: 'https://browser.kudium.com', allowProjectTools: false, connectors: [], quickTunnel: { running: false, ready: false, available: true, url: undefined as string | undefined } };
  Object.assign(window.electron.ai, {
    mcpStatus: jest.fn().mockResolvedValue({ enabled: true, running: true, port: 43187, url: 'http://127.0.0.1:43187/mcp' }),
    onMCPRelay: jest.fn(() => () => {}),
    mcpRelay: jest.fn(async (request) => {
      if (request.action === 'quickTunnel') relay = { ...relay, quickTunnel: { ...relay.quickTunnel, running: request.running, ready: request.running, url: request.running ? 'https://fixture.trycloudflare.com' : undefined } };
      return relay;
    }),
  });
  render(<Theme><ExternalAISettings /></Theme>);
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await waitFor(() => expect((screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value).toContain('127.0.0.1'));
  fireEvent.click(screen.getByRole('button', { name: 'Use quick tunnel' }));
  await waitFor(() => expect((screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value).toContain('https://fixture.trycloudflare.com/mcp'));
  expect((screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value).toContain('Bearer test-token');
  fireEvent.click(screen.getByRole('button', { name: 'Stop tunnel' }));
  await waitFor(() => expect((screen.getByLabelText('MCP configuration') as HTMLTextAreaElement).value).toContain('http://127.0.0.1:43187/mcp'));
});


it('shows environment limitations without a dead relay switch or connect action', async () => {
  Object.assign(window.electron.ai, {
    onMCPRelay: jest.fn(() => () => {}),
    mcpRelay: jest.fn().mockResolvedValue({ enabled: false, paired: false, connected: false, relayUrl: 'https://browser.kudium.com', account: { available: false, signedIn: false, reason: 'Cloud account pairing is unavailable in private windows.' }, connectors: [], quickTunnel: { running: false, available: false } }),
  });
  render(<Theme><ExternalAISettings /></Theme>);
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  await screen.findByText('Cloud account pairing is unavailable in private windows.');
  expect(screen.queryByRole('switch', { name: 'Cloud relay' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect cloud relay' })).not.toBeInTheDocument();
});

it('routes a signed-out account to Sync instead of trying to pair', async () => {
  const openAccount = jest.fn();
  Object.assign(window.electron.ai, {
    onMCPRelay: jest.fn(() => () => {}),
    mcpRelay: jest.fn().mockResolvedValue({ enabled: false, paired: false, connected: false, relayUrl: 'https://browser.kudium.com', account: { available: true, signedIn: false }, connectors: [], quickTunnel: { running: false, available: false } }),
  });
  render(<Theme><ExternalAISettings onOpenAccount={openAccount}/></Theme>);
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to Kudium' }));
  expect(openAccount).toHaveBeenCalledTimes(1);
  expect(window.electron.ai.mcpRelay).not.toHaveBeenCalledWith({ action: 'connect' });
  expect(window.electron.ai.mcpUpdate).not.toHaveBeenCalled();
  expect(screen.queryByRole('switch', { name: 'Cloud relay' })).not.toBeInTheDocument();
});

it('lets a signed-in user enable external control before connecting and surfaces failure at the relay heading', async () => {
  const relay = { enabled: false, paired: false, connected: false, relayUrl: 'https://browser.kudium.com', account: { available: true, signedIn: true }, connectors: [], quickTunnel: { running: false, available: false } };
  Object.assign(window.electron.ai, {
    onMCPRelay: jest.fn(() => () => {}),
    mcpRelay: jest.fn(async (request) => { if(request.action==='connect') throw new Error('Your account session expired. Reconnect in Preferences → Sync.'); return relay; }),
  });
  render(<Theme><ExternalAISettings /></Theme>);
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  const enable = await screen.findByRole('button', { name: 'Enable external control' });
  expect(enable).toBeEnabled();fireEvent.click(enable);
  const connect = await screen.findByRole('button', { name: 'Connect cloud relay' });
  expect(connect).toBeEnabled();fireEvent.click(connect);
  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent('session expired');
  expect(error.closest('.preference-row')).toBe(document.querySelector('.ai-relay-settings > .preference-row'));
  expect(window.electron.ai.mcpRelay).toHaveBeenCalledWith({ action: 'connect' });
});

it('shows an external-control startup failure beside the relay instead of silently leaving Connect disabled', async () => {
  Object.assign(window.electron.ai, {
    onMCPRelay: jest.fn(() => () => {}),
    mcpRelay: jest.fn().mockResolvedValue({ enabled: false, paired: false, connected: false, relayUrl: 'https://browser.kudium.com', account: { available: true, signedIn: true }, connectors: [], quickTunnel: { running: false, available: false } }),
    mcpUpdate: jest.fn().mockResolvedValue({ enabled: true, running: false, port: 43187, url: 'http://127.0.0.1:43187/mcp' }),
  });
  render(<Theme><ExternalAISettings /></Theme>);
  fireEvent.click(screen.getByText('Other agents & manual setup'));
  fireEvent.click(await screen.findByRole('button', { name: 'Enable external control' }));
  const error = await screen.findByText('External control could not start. Check the local port setting and try again.');
  expect(error).toHaveAttribute('role', 'alert');
  expect(error.closest('.preference-row')).toBe(document.querySelector('.ai-relay-settings > .preference-row'));
  expect(window.electron.ai.mcpRelay).not.toHaveBeenCalledWith({ action: 'connect' });
});
