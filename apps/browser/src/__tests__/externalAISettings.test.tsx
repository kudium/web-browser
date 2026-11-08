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
            touchbox: {
              url: status.url,
              headers: { Authorization: 'Bearer test-token' },
            },
          },
        }),
        mcpStdio: jest.fn().mockResolvedValue({
          mcpServers: { touchbox: { command: 'node', args: ['bridge.cjs'] } },
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
