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
    </Theme>,
  );
  expect(
    await screen.findByText('Some download history was recovered.'),
  ).toBeInTheDocument();
  const summary = screen.getByText('More information');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(summary);
  fireEvent.click(screen.getByText('Show in Finder'));
  await waitFor(() =>
    expect(browser.downloads).toHaveBeenCalledWith(
      'reveal-recovery',
      undefined,
    ),
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
    </Theme>,
  );
  expect(
    await screen.findByText('Download history needs attention.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Show in Finder')).not.toBeInTheDocument();
});

it('offers download again for recoverable inactive transfers and keeps live resume separate', async () => {
  (browser.downloadRecovery as jest.Mock).mockResolvedValue({
    status: 'none',
    canReveal: false,
  });
  (browser.downloads as jest.Mock).mockResolvedValue([
    {
      id: 'retry-ui',
      name: 'partial.txt',
      path: '/tmp/partial.txt',
      mime: 'text/plain',
      startedAt: Date.now(),
      receivedBytes: 4,
      totalBytes: 100,
      state: 'interrupted',
      paused: false,
      active: false,
      retryable: true,
    },
  ]);
  render(
    <Theme>
      <Downloads embedded />
    </Theme>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Download again partial.txt' }),
  );
  await waitFor(() =>
    expect(browser.downloads).toHaveBeenCalledWith('retry', 'retry-ui'),
  );
  expect(
    screen.queryByRole('button', { name: 'Resume partial.txt' }),
  ).not.toBeInTheDocument();
});

it('offers Resume for a validated interrupted partial transfer', async () => {
  (browser.downloadRecovery as jest.Mock).mockResolvedValue({
    status: 'none',
    canReveal: false,
  });
  (browser.downloads as jest.Mock).mockResolvedValue([
    {
      id: 'resume-ui',
      name: 'remaining.txt',
      path: '/tmp/remaining.txt',
      mime: 'text/plain',
      startedAt: Date.now(),
      receivedBytes: 4,
      totalBytes: 100,
      state: 'interrupted',
      paused: false,
      active: false,
      resumable: true,
      retryable: true,
    },
  ]);
  render(
    <Theme>
      <Downloads embedded />
    </Theme>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Resume remaining.txt' }),
  );
  await waitFor(() =>
    expect(browser.downloads).toHaveBeenCalledWith('resume', 'resume-ui'),
  );
});
