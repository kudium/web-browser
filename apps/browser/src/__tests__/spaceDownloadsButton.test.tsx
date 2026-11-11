import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SpaceDownloadsButton } from '../components/UI/SpaceDownloadsButton';
import type { DownloadRecord } from '../browser/downloads';

const record = (values: Partial<DownloadRecord>): DownloadRecord => ({
  id: 'one',
  name: 'sample.zip',
  path: '/tmp/sample.zip',
  mime: 'application/zip',
  startedAt: 1,
  receivedBytes: 0,
  totalBytes: 100,
  state: 'progressing',
  active: true,
  paused: false,
  ...values,
});
it('hides without active or completed downloads and opens retained completed downloads', () => {
  const onOpen = jest.fn();
  const { rerender } = render(
    <Theme>
      <SpaceDownloadsButton records={[]} onOpen={onOpen} />
    </Theme>
  );
  expect(screen.queryByRole('button')).toBeNull();
  rerender(
    <Theme>
      <SpaceDownloadsButton
        records={[record({ state: 'cancelled', active: false })]}
        onOpen={onOpen}
      />
    </Theme>
  );
  expect(screen.queryByRole('button')).toBeNull();
  rerender(
    <Theme>
      <SpaceDownloadsButton
        records={[record({ state: 'completed', active: false })]}
        onOpen={onOpen}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Downloads' }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.space-downloads-progress')).toBeNull();
});
it('weights progress by bytes and excludes completed downloads', () => {
  render(
    <Theme>
      <SpaceDownloadsButton
        records={[
          record({ receivedBytes: 50 }),
          record({ id: 'two', totalBytes: 300, receivedBytes: 150 }),
          record({
            id: 'done',
            state: 'completed',
            active: false,
            totalBytes: 1000,
            receivedBytes: 1000,
          }),
        ]}
        onOpen={() => {}}
      />
    </Theme>
  );
  expect(
    screen.getByRole('button', { name: 'Downloads — 2 active, 50%' })
  ).toBeInTheDocument();
  expect(
    document.querySelector('.space-downloads-progress circle:last-child')
  ).toHaveAttribute('stroke-dasharray', '50 100');
});
it('uses an indeterminate arc for unknown sizes and stops motion when paused', () => {
  const { rerender } = render(
    <Theme>
      <SpaceDownloadsButton
        records={[record({ totalBytes: 0 })]}
        onOpen={() => {}}
      />
    </Theme>
  );
  expect(document.querySelector('.space-downloads-progress')).toHaveAttribute(
    'data-indeterminate',
    'true'
  );
  rerender(
    <Theme>
      <SpaceDownloadsButton
        records={[record({ totalBytes: 0, paused: true })]}
        onOpen={() => {}}
      />
    </Theme>
  );
  expect(
    document.querySelector('.space-downloads-progress')
  ).not.toHaveAttribute('data-indeterminate');
  expect(
    screen.getByRole('button', { name: 'Downloads — 1 active, paused' })
  ).toBeInTheDocument();
});
