import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SiteSettingsDialog } from '../components/UI/SiteSettingsDialog';
import type { BrowserState } from '../browser/contracts';

beforeAll(() => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })) as unknown as typeof ResizeObserver;
});

it('shows saved choices and exposes mute, reset, and reload controls', () => {
  const command = jest.fn();
  const close = jest.fn();
  const state: BrowserState = {
    id: 'page',
    url: 'https://example.com/page',
    title: 'Example',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    muted: true,
    siteSettings: {
      origin: 'https://example.com',
      permissions: { geolocation: 'block' },
      blocked: false,
    },
  };
  render(
    <Theme>
      <SiteSettingsDialog
        open
        onOpenChange={close}
        state={state}
        command={command}
      />
    </Theme>
  );
  expect(screen.getByRole('dialog')).toHaveAccessibleName('example.com');
  expect(screen.getByRole('combobox', { name: 'Location' })).toHaveTextContent(
    'Block'
  );
  expect(
    screen.getByText('Connection uses HTTPS').closest('details')
  ).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('switch', { name: 'Mute this site' }));
  expect(command).toHaveBeenLastCalledWith({
    id: 'page',
    url: 'https://example.com',
    action: 'toggle-mute',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset permissions' }));
  expect(command).toHaveBeenLastCalledWith({
    id: 'page',
    url: 'https://example.com',
    action: 'reset-permissions',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(command).toHaveBeenLastCalledWith({
    id: 'page',
    url: 'https://example.com',
    action: 'reload',
  });
  expect(close).toHaveBeenCalledWith(false);
});

it('exposes compact capture modes and PDF export independently of website permissions', async () => {
  const capture = jest.fn();
  render(
    <Theme>
      <SiteSettingsDialog
        open
        onOpenChange={jest.fn()}
        command={jest.fn()}
        onCapture={capture}
        state={{
          id: 'page',
          url: 'https://example.com',
          title: 'Example',
          loading: false,
          canGoBack: false,
          canGoForward: false,
          siteSettings: {
            origin: 'https://example.com',
            permissions: {},
            blocked: true,
          },
        }}
      />
    </Theme>
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Capture page' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Capture area' })
  );
  expect(capture).toHaveBeenLastCalledWith('area');
  fireEvent.click(screen.getByRole('button', { name: 'Save PDF' }));
  expect(capture).toHaveBeenLastCalledWith('pdf');
});

it('shows invalid HTTPS certificates as insecure', () => {
  render(
    <Theme>
      <SiteSettingsDialog
        open
        onOpenChange={jest.fn()}
        command={jest.fn()}
        state={{
          id: 'expired',
          url: 'https://expired.example',
          title: 'Expired',
          loading: false,
          canGoBack: false,
          canGoForward: false,
          siteSettings: {
            origin: 'https://expired.example',
            permissions: {},
            blocked: false,
            certificateError: 'net::ERR_CERT_DATE_INVALID',
          },
        }}
      />
    </Theme>
  );
  expect(screen.getByText('Connection is not secure')).toBeInTheDocument();
  expect(screen.getByText(/identity could not be verified/)).toHaveTextContent(
    'ERR_CERT_DATE_INVALID'
  );
  expect(screen.queryByText('Connection uses HTTPS')).not.toBeInTheDocument();
});
