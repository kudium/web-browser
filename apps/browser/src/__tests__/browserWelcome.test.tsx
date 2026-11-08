import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserWelcome } from '../components/UI/BrowserWelcome';
import { browser } from '../browser/client';
jest.mock('../browser/client', () => ({ browser: { preferences: jest.fn(), preferenceAction: jest.fn() } }));
beforeEach(() => {
  jest.clearAllMocks();
  (browser.preferences as jest.Mock).mockResolvedValue({ setupCompleted: false });
  (browser.preferenceAction as jest.Mock).mockResolvedValue({ platform: 'darwin', systemSetupAvailable: true, defaultBrowser: false, openAtLogin: false });
});
it('only applies selected options', async () => {
  render(<BrowserWelcome />);
  fireEvent.click(await screen.findByLabelText(/Open Kudium at login/));
  fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
  await waitFor(() => expect(browser.preferences).toHaveBeenCalledWith('update', { setupCompleted: true }));
  expect(browser.preferenceAction).toHaveBeenCalledWith('enable-open-at-login');
  expect(browser.preferenceAction).not.toHaveBeenCalledWith('set-default-browser');
  expect(browser.preferenceAction).not.toHaveBeenCalledWith('reveal-app-for-dock');
});
it('skips without changing system settings', async () => {
  render(<BrowserWelcome />);
  fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
  await waitFor(() => expect(screen.getByTitle('About Kudium Browser')).toBeInTheDocument());
  expect(browser.preferenceAction).toHaveBeenCalledTimes(1);
});
it('remembers completed onboarding', async () => {
  (browser.preferences as jest.Mock).mockResolvedValue({ setupCompleted: true });
  render(<BrowserWelcome />);
  expect(await screen.findByTitle('About Kudium Browser')).toBeInTheDocument();
});
