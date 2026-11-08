import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { BrowserImportSettings } from '../components/View/Settings/BrowserImportSettings';

const save = jest.fn();
jest.mock('../utils/AppManager', () => ({
  AppManager: {
    getAll: () =>
      save.mock.calls.at(-1)?.[0] || [
        {
          id: 'existing',
          name: 'Existing',
          url: 'https://existing.example',
          icon: '',
        },
      ],
    set: (items: unknown) => save(items),
  },
}));
jest.mock('../utils/SpaceManager', () => ({
  SpaceManager: {
    getAll: () => [{ id: 'default', name: 'Personal', folders: [] }],
    set: jest.fn(),
  },
}));
beforeEach(() => {
  save.mockClear();
  /* eslint-disable class-methods-use-this -- jsdom observer stub */
  global.ResizeObserver = class {
    observe = () => {};

    unobserve = () => {};

    disconnect = () => {};
  };
  /* eslint-enable class-methods-use-this */
});
test('reviews links before saving and preserves existing tabs in a fresh group', () => {
  render(
    <Theme>
      <BrowserImportSettings />
    </Theme>
  );
  fireEvent.change(screen.getByLabelText('Links to import'), {
    target: { value: 'https://example.com\nhttps://other.example' },
  });
  fireEvent.click(screen.getByText('Review links'));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Import 2 links'));
  const items = save.mock.calls[0][0];
  expect(items).toHaveLength(3);
  expect(items[0].id).toBe('existing');
  expect(items[1].sessionId).toBe(items[2].sessionId);
  expect(items[1].spaceId).toBe('default');
  expect(screen.getByRole('status').textContent).toContain('Imported 2 links');
});
