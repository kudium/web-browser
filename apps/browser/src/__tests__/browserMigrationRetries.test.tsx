import { Theme } from '@radix-ui/themes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserMigrationSettings } from '../components/View/Settings/BrowserMigrationSettings';

let mockTabs: any[] = [];
const mockSave = jest.fn((tabs) => {
  mockTabs = tabs;
});
jest.mock('../utils/AppManager', () => ({
  AppManager: {
    getStored: () => mockTabs,
    set: (tabs: any[]) => mockSave(tabs),
  },
}));
jest.mock('../utils/SpaceManager', () => ({
  SpaceManager: {
    getAll: () => [
      { id: 'target', name: 'Everyday', color: 'iris', folders: [] },
    ],
    set: jest.fn(),
  },
}));

beforeEach(() => {
  mockTabs = [
    { id: 'existing', name: 'Existing', url: 'https://existing.example' },
  ];
  mockSave.mockClear();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  /* eslint-disable class-methods-use-this -- jsdom observer stub */
  global.ResizeObserver = class {
    observe() {}

    unobserve() {}

    disconnect() {}
  };
  /* eslint-enable class-methods-use-this */
});

test.each(['error', 'cookies'])(
  'retries %s without saving another set of groups or changing profile',
  async (failure) => {
    let attempts = 0;
    const migrate = jest.fn(async (action: string) => {
      if (action === 'recover') return [];
      if (action === 'start' || action === 'discard')
        return { stage: 'Ready', completed: 0, total: 0 };
      if (action === 'profiles')
        return [
          {
            id: 'chrome',
            browser: 'Chrome',
            name: 'Default',
            bookmarks: true,
            history: true,
            cookies: false,
          },
        ];
      if (action === 'prepare')
        return {
          token: 'token',
          profileId: 'collection:target:token',
          history: 2,
          cookies: false,
          warnings: ['Older entries were omitted.'],
          links: [
            { name: 'One', url: 'https://one.example', folderPath: ['Work'] },
            {
              name: 'Two',
              url: 'https://two.example',
              folderPath: ['Personal'],
            },
          ],
        };
      if (action === 'status')
        return { stage: 'Importing history', completed: 0, total: 2 };
      attempts += 1;
      if (attempts === 1) {
        if (failure === 'error') throw new Error('History interrupted');
        return {
          history: 2,
          cookies: 0,
          skippedCookies: 0,
          retryable: true,
          warning: 'Cookie transfer needs a retry.',
        };
      }
      return { history: 2, cookies: 3, skippedCookies: 0 };
    });
    window.electron = { browserMigration: migrate } as any;
    render(
      <Theme>
        <BrowserMigrationSettings />
      </Theme>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Scan for browser data' })
    );
    await waitFor(() =>
      expect(
        (screen.getByText('Review import') as HTMLButtonElement).disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByText('Review import'));
    await screen.findByText('Older entries were omitted.');
    fireEvent.click(screen.getByText('Import into collection'));
    await waitFor(() => expect(attempts).toBe(1));
    const retry = await screen.findByText('Retry remaining data');
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false)
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockTabs).toHaveLength(3);
    expect(mockTabs.slice(1).map((tab) => tab.sessionProfileId)).toEqual([
      'collection:target:token',
      'collection:target:token',
    ]);
    expect(mockTabs[1].sessionId).not.toBe(mockTabs[2].sessionId);
    expect(
      (
        screen.getByLabelText(
          'Migration destination space'
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(retry);
    await screen.findByText(
      'Imported 2 bookmarks, 2 history entries and 3 cookies.'
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(
      migrate.mock.calls.filter((call) => call[0] === 'commit')
    ).toHaveLength(2);
  }
);

test('reopens a saved import after restart and reuses its existing groups', async () => {
  mockTabs.push({
    id: 'imported',
    name: 'Page',
    url: 'https://example.com',
    sessionId: 'group',
    sessionProfileId: 'original',
  });
  const migration = jest.fn(async (action: string) => {
    if (action === 'profiles') return [];
    if (action === 'recover')
      return [
        {
          token: 'recovered',
          profileId: 'original',
          links: [{ name: 'Page', url: 'https://example.com' }],
          history: 1,
          cookies: false,
          destinationSpace: 'target',
          organization: { foldersAsGroups: false, spacesAsFolders: false },
          source: {
            id: 'source',
            browser: 'Arc',
            name: 'Work',
            bookmarks: true,
            history: true,
            cookies: false,
          },
        },
      ];
    if (action === 'commit')
      return { history: 1, cookies: 0, skippedCookies: 0 };
    return { stage: 'Ready', completed: 0, total: 0 };
  });
  window.electron = { browserMigration: migration } as any;
  render(
    <Theme>
      <BrowserMigrationSettings />
    </Theme>
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Scan for browser data' })
  );
  const resume = await screen.findByText('Resume Arc import');
  await waitFor(() =>
    expect((resume as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(resume);
  expect(
    screen.getByLabelText('Folders as tab groups').getAttribute('aria-checked')
  ).toBe('false');
  fireEvent.click(screen.getByText('Retry remaining data'));
  await screen.findByText(
    'Imported 1 saved tabs, 1 history entries and 0 cookies.'
  );
  expect(mockSave).not.toHaveBeenCalled();
  expect(migration).toHaveBeenCalledWith('start', {
    token: 'recovered',
    destinationSpace: 'target',
    organization: { foldersAsGroups: false, spacesAsFolders: false },
  });
});
