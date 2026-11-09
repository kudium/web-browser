import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { importBrowsers } from '../browser/browserImport';
import { ImportOrganizationChoices } from '../components/View/Settings/ImportOrganizationChoices';
import { BrowserImportSettings } from '../components/View/Settings/BrowserImportSettings';

const save = jest.fn();
jest.mock('../utils/AppManager', () => ({
  AppManager: {
    getAll: () => [],
    getStored: () =>
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
  HTMLElement.prototype.scrollIntoView = jest.fn();
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
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'From export' }), {
    button: 0,
  });
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

test('Arc organization choices default on and can be changed', () => {
  const change = jest.fn();
  render(
    <ImportOrganizationChoices
      source="Arc"
      options={{ foldersAsGroups: true, spacesAsFolders: true }}
      onChange={change}
      disabled={false}
    />
  );
  expect(
    screen.getByLabelText('Folders as tab groups').getAttribute('aria-checked')
  ).toBe('true');
  expect(
    screen.getByLabelText('Spaces as collections').getAttribute('aria-checked')
  ).toBe('true');
  fireEvent.click(screen.getByLabelText('Spaces as collections'));
  expect(change).toHaveBeenCalledWith({
    foldersAsGroups: true,
    spacesAsFolders: false,
  });
});

test.each(importBrowsers)(
  '%s shows the default folder mapping option',
  (source) => {
    render(
      <ImportOrganizationChoices
        source={source}
        options={{ foldersAsGroups: true, spacesAsFolders: true }}
        onChange={jest.fn()}
        disabled={false}
      />
    );
    expect(
      screen
        .getByLabelText('Folders as tab groups')
        .getAttribute('aria-checked')
    ).toBe('true');
  }
);

test('rolls back stored tabs when an export save fails', () => {
  save.mockImplementationOnce(() => {
    throw new Error('Storage unavailable');
  });
  render(
    <Theme>
      <BrowserImportSettings />
    </Theme>
  );
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'From export' }), {
    button: 0,
  });
  fireEvent.change(screen.getByLabelText('Links to import'), {
    target: { value: 'https://example.com' },
  });
  fireEvent.click(screen.getByText('Review links'));
  fireEvent.click(screen.getByText('Import 1 links'));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0].map((tab: any) => tab.id)).toEqual(['existing']);
  expect(screen.getByRole('status').textContent).toContain(
    'Storage unavailable'
  );
});

test('opens the export picker from the themed button and reviews the chosen file', async () => {
  render(
    <Theme>
      <BrowserImportSettings />
    </Theme>
  );
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'From export' }), {
    button: 0,
  });
  const input = screen.getByLabelText(
    'Browser export file'
  ) as HTMLInputElement;
  const picker = jest.spyOn(input, 'click');
  fireEvent.click(
    screen.getByRole('button', { name: 'Choose browser export' })
  );
  expect(picker).toHaveBeenCalledTimes(1);
  expect(input.hidden).toBe(true);
  const file = new File([''], 'bookmarks.html', { type: 'text/html' });
  Object.defineProperty(file, 'text', {
    value: async () => '<a href="https://example.com">Example</a>',
  });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() =>
    expect(screen.getByText('1 links ready to import')).toBeTruthy()
  );
  expect(screen.getByText('bookmarks.html')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  picker.mockRestore();
});
