import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { Downloads } from '../components/View/Downloads/Downloads';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({
  browser: {
    downloads: jest.fn().mockResolvedValue([]),
    downloadRecovery: jest.fn(),
    onDownloads: jest.fn(() => () => {}),
    onShortcut: jest.fn(() => () => {}),
  },
}));

it('keeps recovery details collapsed and reveals the main-owned backup on request', async () => {
  (browser.downloadRecovery as jest.Mock).mockResolvedValue({
    status: 'recovered',
    canReveal: true,
  });
  render(
    <Theme>
      <Downloads embedded />
    </Theme>
  );
  expect(
    await screen.findByText('Some download history was recovered.')
  ).toBeInTheDocument();
  const summary = screen.getByText('More information');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(summary);
  fireEvent.click(screen.getByText('Show in Finder'));
  await waitFor(() =>
    expect(browser.downloads).toHaveBeenCalledWith('reveal-recovery', undefined)
  );
});

it('explains blocked persistence without offering a missing recovery file', async () => {
  (browser.downloadRecovery as jest.Mock).mockResolvedValue({
    status: 'blocked',
    canReveal: false,
  });
  render(
    <Theme>
      <Downloads embedded />
    </Theme>
  );
  expect(
    await screen.findByText('Download history needs attention.')
  ).toBeInTheDocument();
  expect(screen.queryByText('Show in Finder')).not.toBeInTheDocument();
});
