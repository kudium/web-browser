import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SiteDeveloperPanel } from '../components/UI/SiteDeveloperPanel';
import { SiteSettingsDialog } from '../components/UI/SiteSettingsDialog';
import {
  emptyDeveloperConfig,
  validDeveloperConfig,
} from '../browser/siteDeveloper';
import { isBrowserCommand } from '../main/browserRequests';
import type { BrowserState } from '../browser/contracts';

jest.mock('../components/UI/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, label, disabled }: any) => (
    <textarea
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
beforeAll(() => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
});

it('installs a preset without editing code and re-enables it without duplicating or overwriting it', () => {
  const send = jest.fn();
  const content = (config: any) => (
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        developer={{ config, status: 'waiting', logs: [] }}
      />
    </Theme>
  );
  const view = render(content(emptyDeveloperConfig));
  fireEvent.click(screen.getByRole('button', { name: 'Examples' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enable & run' }));
  const installed = send.mock.calls.at(-1)![1].developer;
  expect(send).toHaveBeenLastCalledWith(
    'set-site-developer',
    expect.objectContaining({ run: true })
  );
  expect(installed.enabled).toBe(true);
  expect(installed.hooks).toHaveLength(1);
  expect(installed.hooks[0].id).toBe('preset-dark-mode');
  const modified = {
    ...installed,
    hooks: [{ ...installed.hooks[0], enabled: false, after: 'log("custom")' }],
  };
  view.rerender(content(modified));
  fireEvent.click(screen.getByRole('button', { name: 'Examples' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enable & run' }));
  const reenabled = send.mock.calls.at(-1)![1].developer;
  expect(reenabled.hooks).toHaveLength(1);
  expect(reenabled.hooks[0]).toMatchObject({
    enabled: true,
    after: 'log("custom")',
  });
});

it('restores only the selected hook and preserves its enabled state and other hooks', () => {
  const send = jest.fn();
  const hook = {
    id: 'a',
    name: 'A',
    path: '/*',
    enabled: false,
    before: '',
    after: 'broken()',
    css: '',
  };
  const other = {
    ...hook,
    id: 'b',
    name: 'B',
    enabled: true,
    after: 'log("new B")',
  };
  const config = {
    ...emptyDeveloperConfig,
    enabled: true,
    hooks: [hook, other],
  };
  const previous = {
    ...config,
    hooks: [
      { ...hook, enabled: true, after: 'log("working")' },
      { ...other, after: 'log("old B")' },
    ],
  };
  render(
    <Theme>
      <SiteDeveloperPanel
        selectedHookId="a"
        disabled={false}
        send={send}
        developer={{
          config,
          status: 'waiting',
          logs: [],
          revisions: [{ time: 1, config: previous, workingHooks: ['a'] }],
        }}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'History' }));
  fireEvent.click(
    screen.getByRole('button', { name: /Successfully executed/ })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Restore version' }));
  const restored = send.mock.calls.at(-1)![1].developer;
  expect(restored.hooks[0]).toMatchObject({
    enabled: false,
    after: 'log("working")',
  });
  expect(restored.hooks[1]).toEqual(other);
  expect(send.mock.calls.at(-1)![1].run).toBeUndefined();
});

it('opens AI setup with the requested outcome and site context without saving or running', () => {
  const send = jest.fn();
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        origin="https://example.com"
        send={send}
        developer={{
          config: emptyDeveloperConfig,
          status: 'waiting',
          logs: [],
        }}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Hook outcome' }), {
    target: { value: 'Notify me when this price changes' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue in AI' }));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith('ask-hook-ai', {
    prompt: expect.stringContaining('Notify me when this price changes'),
  });
  expect(send.mock.calls[0][1].prompt).toContain('https://example.com');
});

it('offers AI setup from the preset picker and closes both dialogs', () => {
  const send = jest.fn();
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        developer={{
          config: emptyDeveloperConfig,
          status: 'waiting',
          logs: [],
        }}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Examples' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Hook outcome' }), {
    target: { value: 'Highlight headings' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue in AI' }));
  expect(send).toHaveBeenCalledWith('ask-hook-ai', {
    prompt: expect.stringContaining('Highlight headings'),
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('repairs the hook that caused the error instead of an unrelated selected hook', () => {
  const send = jest.fn();
  const hook = {
    id: 'prices',
    name: 'Price watcher',
    enabled: true,
    path: '/*',
    before: '',
    after: 'priceSelector()',
    css: '',
  };
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        developer={{
          config: {
            ...emptyDeveloperConfig,
            enabled: true,
            after: 'unrelatedDefault()',
            hooks: [hook],
          },
          status: 'error',
          logs: [
            {
              time: 1,
              level: 'error',
              hookId: 'prices',
              phase: 'after',
              message: 'priceSelector failed',
            },
          ],
        }}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Fix with AI' }));
  const { prompt } = send.mock.calls[0][1];
  expect(prompt).toContain('Price watcher (prices)');
  expect(prompt).toContain('priceSelector()');
  expect(prompt).not.toContain('unrelatedDefault()');
});
it('rejects malformed and oversized hook commands at the process boundary', () => {
  const request = {
    id: 'page',
    url: 'https://example.com',
    action: 'set-site-developer',
    developer: { ...emptyDeveloperConfig, enabled: true },
  };
  expect(isBrowserCommand(request)).toBe(true);
  expect(isBrowserCommand({ ...request, developer: undefined })).toBe(false);
  expect(
    validDeveloperConfig({ ...emptyDeveloperConfig, enabled: 'yes' })
  ).toBe(false);
  expect(
    validDeveloperConfig({ ...emptyDeveloperConfig, after: 'x'.repeat(100001) })
  ).toBe(false);
});
it('keeps hook editing explicit, preserves unsaved code while switching stages, and exposes logs', () => {
  const command = jest.fn();
  const state: BrowserState = {
    id: 'page',
    url: 'https://example.com/path',
    title: 'Example',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    siteSettings: {
      origin: 'https://example.com',
      permissions: {},
      blocked: false,
      developer: {
        config: { ...emptyDeveloperConfig, enabled: true },
        status: 'error',
        logs: [{ time: 0, level: 'error', message: 'After load failed' }],
      },
    },
  };
  const content = (current: BrowserState) => (
    <Theme>
      <SiteDeveloperPanel
        developer={current.siteSettings?.developer}
        disabled={false}
        send={(action, patch) =>
          command({
            id: current.id,
            url: current.siteSettings?.origin,
            action,
            ...patch,
          })
        }
      />
    </Theme>
  );
  const view = render(content(state));
  expect(screen.getByText('Hook needs attention')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: 'After load code' }), {
    target: { value: "log('URL', url);" },
  });
  expect(screen.getByRole('button', { name: 'Save & Run' })).toBeEnabled();
  fireEvent.keyDown(screen.getByRole('tab', { name: /CSS/ }), { key: 'Enter' });
  fireEvent.change(screen.getByRole('textbox', { name: 'CSS code' }), {
    target: { value: 'body { color: blue; }' },
  });
  fireEvent.keyDown(screen.getByRole('tab', { name: /After load/ }), {
    key: 'Enter',
  });
  expect(screen.getByRole('textbox', { name: 'After load code' })).toHaveValue(
    "log('URL', url);"
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save hooks' }));
  const saved = {
    ...emptyDeveloperConfig,
    enabled: true,
    after: "log('URL', url);",
    css: 'body { color: blue; }',
  };
  expect(command).toHaveBeenLastCalledWith({
    id: 'page',
    url: 'https://example.com',
    action: 'set-site-developer',
    developer: saved,
  });
  view.rerender(
    content({
      ...state,
      siteSettings: {
        ...state.siteSettings!,
        developer: {
          ...state.siteSettings!.developer!,
          config: saved,
          status: 'waiting',
        },
      },
    })
  );
  expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  expect(command).toHaveBeenLastCalledWith({
    id: 'page',
    url: 'https://example.com',
    action: 'set-site-developer',
    developer: saved,
    run: true,
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(command).toHaveBeenLastCalledWith({
    id: 'page',
    url: 'https://example.com',
    action: 'clear-site-developer-logs',
  });
});

it('opens the Developer window from site settings and dismisses the blocking dialog', () => {
  const command = jest.fn();
  const close = jest.fn();
  render(
    <Theme>
      <SiteSettingsDialog
        open
        onOpenChange={close}
        command={command}
        state={{
          id: 'tab',
          url: 'https://example.com',
          title: 'Example',
          loading: false,
          canGoBack: false,
          canGoForward: false,
          siteSettings: {
            origin: 'https://example.com',
            permissions: {},
            blocked: false,
          },
        }}
      />
    </Theme>
  );
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Manage Site Hooks' }));
  expect(command).toHaveBeenCalledWith({
    id: 'tab',
    url: 'https://example.com',
    action: 'open-site-developer',
  });
  expect(close).toHaveBeenCalledWith(false);
});

it('allows and revokes only the bound notification permission and blocks approval of unsaved code', () => {
  const command = jest.fn();
  const developer = {
    config: { ...emptyDeveloperConfig, enabled: true },
    status: 'waiting' as const,
    logs: [],
    notifications: [
      {
        id: 'grant',
        key: 'market',
        label: 'Telegram',
        destinationHost: 'api.telegram.org',
        active: false,
      },
    ],
  };
  const state: BrowserState = {
    id: 'page',
    url: 'https://example.com',
    title: 'Market',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    siteSettings: {
      origin: 'https://example.com',
      permissions: {},
      blocked: false,
      developer,
    },
  };
  render(
    <Theme>
      <SiteDeveloperPanel
        developer={developer}
        disabled={false}
        send={(action, patch) =>
          command({
            id: state.id,
            url: state.siteSettings?.origin,
            action,
            ...patch,
          })
        }
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
  expect(command).toHaveBeenLastCalledWith({
    id: 'page',
    url: 'https://example.com',
    action: 'activate-hook-notification',
    grantId: 'grant',
  });
  fireEvent.change(screen.getByLabelText('After load code'), {
    target: { value: 'changed source' },
  });
  expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  expect(command).toHaveBeenLastCalledWith({
    id: 'page',
    url: 'https://example.com',
    action: 'revoke-hook-notification',
    grantId: 'grant',
  });
  expect(
    isBrowserCommand({ id: 'page', action: 'activate-hook-notification' })
  ).toBe(false);
});

it('keeps all hooks visible and preserves drafts while switching, adding and removing hooks', () => {
  const send = jest.fn();
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        developer={{
          config: {
            ...emptyDeveloperConfig,
            enabled: true,
            hooks: [
              {
                id: 'research',
                name: 'Research updates',
                enabled: true,
                path: '/research/*',
                before: '',
                after: 'original',
                css: '',
              },
              {
                id: 'prices',
                name: 'Price alerts',
                enabled: false,
                path: '/pricing',
                before: '',
                after: 'prices',
                css: '',
              },
            ],
          },
          status: 'waiting',
          logs: [],
        }}
      />
    </Theme>
  );
  expect(
    screen.queryByRole('combobox', { name: 'Selected hook' })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Research updates/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'After load code' }), {
    target: { value: 'research draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Price alerts/ }));
  expect(screen.getByRole('textbox', { name: 'After load code' })).toHaveValue(
    'prices'
  );
  fireEvent.click(screen.getByRole('button', { name: /^Research updates/ }));
  expect(screen.getByRole('textbox', { name: 'After load code' })).toHaveValue(
    'research draft'
  );
  expect(screen.queryByRole('button', { name: 'Hook settings' })).toBeNull();
  expect(screen.queryByRole('switch', { name: 'Enable selected hook' })).toBeNull();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Options for Research updates' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
  fireEvent.change(screen.getByLabelText('Hook name'), {
    target: { value: 'Renamed research' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  expect(screen.getByRole('button', { name: /^Renamed research/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(screen.getByRole('button', { name: 'Options for Renamed research' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(
    screen.queryByRole('button', { name: /^Renamed research/ })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add hook' }));
  expect(screen.getByRole('button', { name: /^New hook/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save hooks' }));
  expect(send).toHaveBeenCalledWith(
    'set-site-developer',
    expect.objectContaining({
      developer: expect.objectContaining({
        hooks: expect.arrayContaining([
          expect.objectContaining({ id: 'prices', after: 'prices' }),
          expect.objectContaining({ name: 'New hook' }),
        ]),
      }),
    })
  );
});

it('lets users delete a custom hook directly and save the removal', () => {
  const send = jest.fn();
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        developer={{
          config: {
            ...emptyDeveloperConfig,
            enabled: true,
            hooks: [
              {
                id: 'custom',
                name: 'Dark mode',
                path: '/*',
                enabled: true,
                before: '',
                after: '',
                css: 'body { color:white; }',
              },
            ],
          },
          status: 'waiting',
          logs: [],
        }}
      />
    </Theme>
  );
  expect(
    screen.queryByRole('button', { name: 'Delete hook' })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Dark mode/ }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Options for Dark mode' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(
    screen.queryByRole('button', { name: /^Dark mode/ })
  ).not.toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save hooks' }));
  expect(send).toHaveBeenCalledWith('set-site-developer', {
    developer: expect.objectContaining({ hooks: [] }),
  });
});

it('offers to enable a disabled site after saving without running it', () => {
  const send = jest.fn();
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        developer={{
          config: emptyDeveloperConfig,
          status: 'waiting',
          logs: [],
        }}
      />
    </Theme>
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'After load code' }), {
    target: { value: 'log(url);' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save hooks' }));
  expect(screen.getByRole('alertdialog')).toBeVisible();
  expect(send).toHaveBeenLastCalledWith('set-site-developer', {
    developer: expect.objectContaining({ enabled: false, after: 'log(url);' }),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enable hook' }));
  expect(send).toHaveBeenLastCalledWith('set-site-developer', {
    developer: expect.objectContaining({ enabled: true, after: 'log(url);' }),
  });
  expect(send).not.toHaveBeenCalledWith('reload');
});
it('lets users keep a custom hook disabled while the site is enabled', () => {
  const send = jest.fn();
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        developer={{
          config: {
            ...emptyDeveloperConfig,
            enabled: true,
            hooks: [
              {
                id: 'off',
                name: 'Paused hook',
                path: '/*',
                enabled: false,
                before: '',
                after: '',
                css: '',
              },
            ],
          },
          status: 'waiting',
          logs: [],
        }}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: /^Paused hook/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'After load code' }), {
    target: { value: 'log(url);' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save hooks' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep disabled' }));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenLastCalledWith('set-site-developer', {
    developer: expect.objectContaining({
      hooks: [expect.objectContaining({ enabled: false })],
    }),
  });
});

it('offers publishing beside save and run for saved default code and blocks unsaved changes', () => {
  const config = { ...emptyDeveloperConfig, after: 'log("saved")' };
  const listener = jest.fn();
  window.addEventListener('kudium-hooks-dialog', listener);
  const view = render(
    <Theme>
      <SiteDeveloperPanel
        developer={{ config, status: 'waiting', logs: [] }}
        disabled={false}
        origin="https://example.com"
        send={jest.fn()}
      />
    </Theme>
  );
  const publish = screen.getByRole('button', { name: 'Publish' });
  expect(publish).toBeEnabled();
  fireEvent.click(publish);
  expect(listener.mock.calls[0][0].detail).toEqual({
    mode: 'publish',
    origin: 'https://example.com',
    hookId: '',
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'After load code' }), {
    target: { value: 'draft' },
  });
  expect(publish).toBeDisabled();
  view.unmount();
  window.removeEventListener('kudium-hooks-dialog', listener);
});

it('renames a hook from its list menu without changing its code or enabled state', async () => {
  const send = jest.fn();
  const hook = {
    id: 'rename-test',
    name: 'Reader',
    path: '/*',
    enabled: false,
    before: '',
    after: 'log("kept")',
    css: '',
  };
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        developer={{
          config: { ...emptyDeveloperConfig, hooks: [hook] },
          status: 'waiting',
          logs: [],
        }}
      />
    </Theme>
  );
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Options for Reader' }),
    { key: 'ArrowDown' }
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  fireEvent.change(screen.getByLabelText('Hook name'), {
    target: { value: 'Renamed reader' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  expect(
    screen.getByRole('button', { name: /^Renamed reader/ })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save hooks' }));
  expect(send).toHaveBeenLastCalledWith('set-site-developer', {
    developer: expect.objectContaining({
      hooks: [{ ...hook, name: 'Renamed reader' }],
    }),
  });
});

it('opens a new hook draft from the page tree without saving until requested', () => {
  const send = jest.fn();
  render(
    <Theme>
      <SiteDeveloperPanel
        disabled={false}
        send={send}
        selectedHookId="__new__"
        developer={{
          config: emptyDeveloperConfig,
          status: 'waiting',
          logs: [],
        }}
      />
    </Theme>
  );
  expect(screen.getAllByText('New hook').length).toBeGreaterThan(0);
  expect(send).not.toHaveBeenCalled();
});

it('shows individual hook status and reruns only the requested saved hook', () => {
  const send = jest.fn();
  const config = {
    ...emptyDeveloperConfig, enabled: true, after: 'log("default")',
    hooks: [{ id: 'watch', name: 'Watcher', path: '/*', enabled: true, before: '', after: 'log("watch")', css: '' }],
  };
  const developer = { config, status: 'error' as const, logs: [], hookStatuses: { '': 'success' as const, watch: 'error' as const } };
  const view = render(<Theme><SiteDeveloperPanel origin="https://example.com/page" developer={developer} disabled={false} send={send} /></Theme>);
  expect(screen.getByRole('status', { name: 'Default hook: Success' })).toBeTruthy();
  expect(screen.getByRole('status', { name: 'Watcher: Failed' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Run Watcher' }));
  expect(send).toHaveBeenLastCalledWith('run-site-hook', { hookId: 'watch', url: 'https://example.com' });
  expect(screen.getByRole('status', { name: 'Watcher: Running' })).toBeTruthy();
  view.rerender(<Theme><SiteDeveloperPanel origin="https://example.com/page" developer={{ ...developer, hookStatuses: { '': 'success', watch: 'running' } }} disabled={false} send={send} /></Theme>);
  expect(screen.getByRole('button', { name: 'Run Watcher' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Run Default hook' }));
  expect(send).toHaveBeenLastCalledWith('run-site-hook', { hookId: '', url: 'https://example.com' });
});

it('shows hook output and errors by default, with execution details available on demand', () => {
  render(<Theme><SiteDeveloperPanel disabled={false} send={jest.fn()} developer={{ config: emptyDeveloperConfig, status: 'success', logs: [
    { time: 0, level: 'info', category: 'execution', message: 'Page load started' },
    { time: 1, level: 'info', category: 'output', message: 'hello world' },
    { time: 2, level: 'error', category: 'execution', message: 'Failed callback' },
    { time: 3, level: 'info', category: 'execution', message: 'Hooks completed' },
  ] }} /></Theme>);
  expect(screen.queryByText('Page load started')).toBeNull();
  expect(screen.queryByText('Hooks completed')).toBeNull();
  expect(screen.getByText('hello world')).toBeTruthy();
  expect(screen.getByText('Failed callback')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show details' }));
  expect(screen.getByText('Page load started')).toBeTruthy();
  expect(screen.getByText('Hooks completed')).toBeTruthy();
});
