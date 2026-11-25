import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserWelcome } from '../components/UI/BrowserWelcome';
import { browser } from '../browser/client';
jest.mock('../browser/client', () => ({
  browser: { preferences: jest.fn(), preferenceAction: jest.fn(), onPreferences: jest.fn(() => () => {}) },
}));
beforeEach(() => {
  jest.clearAllMocks();
  (browser.preferences as jest.Mock).mockResolvedValue({
    setupCompleted: false,
  });
  (browser.preferenceAction as jest.Mock).mockResolvedValue({
    platform: 'darwin',
    systemSetupAvailable: true,
    defaultBrowser: false,
    openAtLogin: false,
  });
});
it('shows all options together and applies only the clicked setting', async () => {
  render(<BrowserWelcome />);
  expect(
    await screen.findByRole('heading', { name: 'Default browser' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Keep in Dock' })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Open at login' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
  await waitFor(() =>
    expect(browser.preferenceAction).toHaveBeenCalledWith(
      'enable-open-at-login'
    )
  );
  expect(browser.preferenceAction).not.toHaveBeenCalledWith(
    'set-default-browser'
  );
  expect(browser.preferenceAction).not.toHaveBeenCalledWith(
    'reveal-app-for-dock'
  );
});
it('starts browsing without changing optional settings', async () => {
  render(<BrowserWelcome />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Start browsing' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('button',{name:'Start browsing'})).not.toBeInTheDocument()
  );
  expect(browser.preferenceAction).toHaveBeenCalledTimes(1);
});
it('disables system actions when running outside the installed app', async () => {
  (browser.preferenceAction as jest.Mock).mockResolvedValue({
    platform: 'darwin',
    systemSetupAvailable: false,
  });
  render(<BrowserWelcome />);
  expect(
    await screen.findByRole('button', { name: 'Make default' })
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Show in Finder' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Start browsing' })).toBeEnabled();
});
it('remembers completed onboarding', async () => {
  (browser.preferences as jest.Mock).mockResolvedValue({
    setupCompleted: true,
  });
  render(<BrowserWelcome />);
  expect(await screen.findByRole('heading',{name:'Keep in Dock'})).toBeInTheDocument();
  expect(screen.queryByTitle('Start page website')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Start browsing'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Show in Finder'}));
  await waitFor(()=>expect(browser.preferenceAction).toHaveBeenCalledWith('reveal-app-for-dock'));
});

it('shows a blank start page with browser shortcuts after setup', async () => {
  (browser.preferences as jest.Mock).mockResolvedValue({setupCompleted:true,startPage:'blank'});
  render(<BrowserWelcome />);
  expect(await screen.findByText('Open a tab or enter an address to start browsing.')).toBeInTheDocument();
  expect(screen.queryByTitle('Start page website')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Manage global hooks'}));
  expect(browser.preferences).toHaveBeenCalledWith('open',{section:'hooks'});
});
it('uses a custom HTTP(S) start page and rejects privileged URLs even in saved data', async () => {
  (browser.preferences as jest.Mock).mockResolvedValue({setupCompleted:true,startPage:'custom',startPageURL:'https://example.com/start'});
  const view = render(<BrowserWelcome preview />);
  expect(await screen.findByTitle('Start page website')).toHaveAttribute('src','https://example.com/start');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  view.unmount();
  (browser.preferences as jest.Mock).mockResolvedValue({setupCompleted:true,startPage:'custom',startPageURL:'javascript:alert(1)'});
  render(<BrowserWelcome />);
  expect(await screen.findByRole('heading',{name:'Keep in Dock'})).toBeInTheDocument();
  expect(screen.queryByTitle('Start page website')).not.toBeInTheDocument();
});
