import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AISettingsPage } from '../components/View/Settings/AISettingsPage';
import { AI_DEFAULTS } from '../browser/ai';

Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});

beforeEach(() => {
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
        mcpStatus: jest.fn().mockResolvedValue({
          enabled: false,
          running: false,
          port: 43187,
          url: 'http://127.0.0.1:43187/mcp',
        }),
        onMCP: jest.fn(() => () => {}),
        settings: jest.fn().mockResolvedValue({
          ...AI_DEFAULTS,
          hasKey: false,
          remembered: false,
        }),
        models: jest.fn().mockResolvedValue(['model-a', 'model-b']),
      },
    },
  });
});
it('discovers models, saves a selected model and never retains the entered key', async () => {
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await waitFor(() => expect(screen.getByLabelText('API key')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('API key'), {
    target: { value: 'test-key' },
  });
  fireEvent.click(screen.getByText('Refresh models'));
  await screen.findByRole('option', { name: 'model-b' });
  fireEvent.change(screen.getByLabelText('Model'), {
    target: { value: 'model-b' },
  });
  (window.electron.ai.settings as jest.Mock).mockResolvedValue({
    ...AI_DEFAULTS,
    model: 'model-b',
    hasKey: true,
    remembered: false,
  });
  fireEvent.click(screen.getByText('Save AI settings'));
  await waitFor(() =>
    expect(window.electron.ai.settings).toHaveBeenLastCalledWith({
      endpoint: AI_DEFAULTS.endpoint,
      model: 'model-b',
      key: 'test-key',
      remember: true,
    })
  );
  await waitFor(() => expect(screen.getByLabelText('API key')).toHaveValue(''));
});
it('supports custom model IDs when discovery is unavailable', async () => {
  (window.electron.ai.models as jest.Mock).mockRejectedValue(
    new Error('Model discovery unavailable')
  );
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await waitFor(() => expect(screen.getByLabelText('API key')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('API key'), {
    target: { value: 'test-key' },
  });
  fireEvent.click(screen.getByText('Refresh models'));
  await screen.findByText('Model discovery unavailable');
  fireEvent.change(screen.getByLabelText('Model'), {
    target: { value: '__custom__' },
  });
  fireEvent.change(screen.getByLabelText('Custom model ID'), {
    target: { value: 'custom-model' },
  });
  expect(screen.getByLabelText('Custom model ID')).toHaveValue('custom-model');
});

it('switches providers with matching endpoints and models', async () => {
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await waitFor(() => expect(screen.getByLabelText('Provider')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('API key'), {
    target: { value: 'old-key' },
  });
  fireEvent.change(screen.getByLabelText('Provider'), {
    target: { value: 'gemini' },
  });
  expect(screen.getByLabelText('API endpoint')).toHaveValue(
    'https://generativelanguage.googleapis.com/v1beta/openai'
  );
  expect(screen.getByLabelText('Model')).toHaveValue('gemini-3.8-flash');
  expect(screen.getByLabelText('API key')).toHaveValue('');
  expect(
    screen.queryByText('Your browser, with a little assistance.')
  ).not.toBeInTheDocument();
});

it('lets the user retry loading settings after a service error', async () => {
  (window.electron.ai.settings as jest.Mock).mockRejectedValueOnce(
    new Error('Settings unavailable')
  );
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await screen.findByText('Settings unavailable');
  expect(screen.getByLabelText('Provider')).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry loading settings' })
  );
  await waitFor(() => expect(screen.getByLabelText('Provider')).toBeEnabled());
  expect(screen.queryByText('Settings unavailable')).not.toBeInTheDocument();
});

it('switches settings tabs with the keyboard and keeps only the selected panel visible', async () => {
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  const modelTab = screen.getByRole('tab', { name: 'Model settings' });
  const externalTab = screen.getByRole('tab', { name: 'External AI' });
  modelTab.focus();
  fireEvent.keyDown(modelTab, { key: 'ArrowRight' });
  expect(externalTab).toHaveFocus();
  expect(externalTab).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveAttribute(
    'id',
    'ai-external-panel'
  );
  fireEvent.keyDown(externalTab, { key: 'Home' });
  expect(modelTab).toHaveFocus();
  expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'ai-model-panel');
  await waitFor(() => expect(screen.getByLabelText('Provider')).toBeEnabled());
});

it('offers current Gemini models without an API key and lets users choose Flash-Lite', async () => {
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await waitFor(() => expect(screen.getByLabelText('Provider')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Provider'), {
    target: { value: 'gemini' },
  });
  expect(
    screen.getByRole('option', { name: 'gemini-4-argon' })
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Model'), {
    target: { value: 'gemini-3.5-flash-lite' },
  });
  expect(screen.getByLabelText('Model')).toHaveValue('gemini-3.5-flash-lite');
  expect(window.electron.ai.models).not.toHaveBeenCalled();
});

it('configures Meta Muse and lets users select Wonder with their own API key', async () => {
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await waitFor(() => expect(screen.getByLabelText('Provider')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Provider'), {
    target: { value: 'meta' },
  });
  expect(screen.getByLabelText('API endpoint')).toHaveValue(
    'https://api.meta.ai/v1'
  );
  expect(screen.getByLabelText('Model')).toHaveValue('muse-spark-1.3');
  fireEvent.change(screen.getByLabelText('Model'), {
    target: { value: 'muse-wonder-1.0' },
  });
  fireEvent.change(screen.getByLabelText('API key'), {
    target: { value: 'fixture-meta-key' },
  });
  fireEvent.click(screen.getByText('Save AI settings'));
  await waitFor(() =>
    expect(window.electron.ai.settings).toHaveBeenLastCalledWith({
      endpoint: 'https://api.meta.ai/v1',
      model: 'muse-wonder-1.0',
      key: 'fixture-meta-key',
      remember: true,
    })
  );
});

it('remembers the Show stats setting independently of provider settings', async () => {
  localStorage.removeItem('kudiumbrowser-ai-page-showStats');
  const view = render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  const toggle = screen.getByRole('switch', { name: 'Show stats' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(localStorage.getItem('kudiumbrowser-ai-page-showStats')).toBe('false');
  view.unmount();
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  expect(screen.getByRole('switch', { name: 'Show stats' })).toHaveAttribute(
    'aria-checked',
    'false'
  );
  localStorage.removeItem('kudiumbrowser-ai-page-showStats');
});

it('automatically discovers installed Ollama models and saves without an API key', async () => {
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await waitFor(() => expect(screen.getByLabelText('API key')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Provider'), {
    target: { value: 'ollama' },
  });
  await screen.findByRole('option', { name: 'model-a' });
  expect(window.electron.ai.models).toHaveBeenCalledWith({
    endpoint: 'http://localhost:11434/v1',
    key: '',
  });
  expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Model')).toHaveValue('model-a');
  fireEvent.change(screen.getByLabelText('Model'), {
    target: { value: 'model-b' },
  });
  fireEvent.click(screen.getByText('Save AI settings'));
  await waitFor(() =>
    expect(window.electron.ai.settings).toHaveBeenLastCalledWith({
      endpoint: 'http://localhost:11434/v1',
      model: 'model-b',
      key: '',
      remember: true,
    })
  );
});

it('explains how to recover when Ollama has no installed models', async () => {
  (window.electron.ai.models as jest.Mock).mockResolvedValue([]);
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await waitFor(() => expect(screen.getByLabelText('API key')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Provider'), {
    target: { value: 'ollama' },
  });
  await screen.findByText(/No installed models/);
  expect(screen.getByText('Save AI settings')).toBeDisabled();
  expect(screen.getByText('Refresh models')).toBeEnabled();
});

it('ignores discovery from Ollama after switching providers', async () => {
  let complete!: (models: string[]) => void;
  (window.electron.ai.models as jest.Mock).mockReturnValue(
    new Promise<string[]>((resolve) => {
      complete = resolve;
    })
  );
  render(
    <Theme>
      <AISettingsPage />
    </Theme>
  );
  await waitFor(() => expect(screen.getByLabelText('API key')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Provider'), {
    target: { value: 'ollama' },
  });
  await waitFor(() => expect(window.electron.ai.models).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Provider'), {
    target: { value: 'openai' },
  });
  complete(['local-only']);
  await waitFor(() =>
    expect(screen.getByLabelText('Model')).toHaveValue('gpt-6.1-sol')
  );
  expect(
    screen.queryByRole('option', { name: 'local-only' })
  ).not.toBeInTheDocument();
});
