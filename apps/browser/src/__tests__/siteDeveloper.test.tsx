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
  expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
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
    action: 'reload',
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
  fireEvent.click(screen.getByRole('button', { name: 'Developer' }));
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
  fireEvent.click(screen.getByRole('button', { name: /Research updates/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'After load code' }), {
    target: { value: 'research draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Price alerts/ }));
  expect(screen.getByRole('textbox', { name: 'After load code' })).toHaveValue(
    'prices'
  );
  fireEvent.click(screen.getByRole('button', { name: /Research updates/ }));
  expect(screen.getByRole('textbox', { name: 'After load code' })).toHaveValue(
    'research draft'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Hook settings' }));
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Renamed research' },
  });
  expect(
    screen.getByRole('button', { name: /Renamed research/ })
  ).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Delete hook' }));
  expect(
    screen.queryByRole('button', { name: /Renamed research/ })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add hook' }));
  expect(screen.getByRole('button', { name: /New hook/ })).toHaveAttribute(
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
  fireEvent.click(screen.getByRole('button', { name: /Dark mode/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete hook' }));
  expect(
    screen.queryByRole('button', { name: /Dark mode/ })
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
  fireEvent.click(screen.getByRole('button', { name: /Paused hook/ }));
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
