import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AIContextPicker } from '../components/UI/AIContextPicker';

beforeEach(() => {
  Object.assign(global, {
    ResizeObserver: jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    })),
  });
});

it('keeps large tab lists bounded and attaches only a chosen context', async () => {
  const onAttach = jest.fn();
  const onFiles = jest.fn();
  const groups = [
    {
      id: 'work',
      name: 'Work',
      slug: 'work',
      tabs: Array.from({ length: 1000 }, (_, index) => ({
        id: `tab-${index}`,
        name: `Page ${index}`,
        slug: `page-${index}`,
        url: `https://example.com/${index}`,
        icon: '',
      })),
    },
  ];
  render(
    <Theme>
      <AIContextPicker
        groups={groups}
        tabs={[]}
        activeTabId="tab-0"
        disabled={false}
        filesDisabled={false}
        onAttach={onAttach}
        onFiles={onFiles}
      />
    </Theme>
  );
  expect(
    screen.queryByLabelText('Search browser context')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Attach context' }));
  await screen.findByLabelText('Search browser context');
  expect(screen.getAllByRole('button', { name: /Page \d/ })).toHaveLength(5);
  expect(onAttach).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View more tabs' }));
  expect(screen.getAllByRole('button', { name: /Page \d/ })).toHaveLength(20);
  fireEvent.change(screen.getByLabelText('Search browser context'), {
    target: { value: 'Page 999' },
  });
  fireEvent.click(await screen.findByRole('button', { name: /Page 999/ }));
  expect(onAttach).toHaveBeenCalledWith({ kind: 'tab', id: 'tab-999' });
  fireEvent.click(screen.getByRole('button', { name: 'Attach context' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Upload files from computer' })
  );
  expect(onFiles).toHaveBeenCalledTimes(1);
});
