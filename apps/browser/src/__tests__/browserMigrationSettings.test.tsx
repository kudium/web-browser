import React from 'react';
import { Theme } from '@radix-ui/themes';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserMigrationSettings } from '../components/View/Settings/BrowserMigrationSettings';
jest.mock('../utils/SpaceManager', () => ({
  SpaceManager: { getAll: () => [{ id: 'default', name: 'Everyday' }] },
}));
jest.mock('../utils/AppManager', () => ({ AppManager: {} }));
test('shows readable migration failures next to the import controls and brings them into view', async () => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  const scroll = jest.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  window.electron = {
    browserMigration: jest.fn(async (action) => {
      if (action === 'profiles')
        return [
          {
            id: 'arc',
            browser: 'Arc',
            name: 'Default',
            bookmarks: true,
            history: true,
            cookies: false,
          },
        ];
      throw new Error(
        "Error invoking remote method 'browser-migration': Error: History could not be read. Close the source browser and try again."
      );
    }),
  } as any;
  render(
    <Theme>
      <BrowserMigrationSettings />
    </Theme>
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Scan for browser data' })
  );
  await waitFor(() =>
    expect(screen.getByText('Review import').closest('button')?.disabled).toBe(
      false
    )
  );
  expect(
    screen
      .getByLabelText('Cookies and website logins')
      .getAttribute('aria-checked')
  ).toBe('false');
  fireEvent.click(screen.getByText('Review import'));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe(
    'History could not be read. Close the source browser and try again.'
  );
  expect(
    alert.compareDocumentPosition(screen.getByText('Import passwords')) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(scroll).toHaveBeenCalled();
});

test('requires an explicit scan on each visit before accessing browser data', async () => {
  const migration = jest.fn(async (action: string) => {
    if (action === 'profiles')
      return [
        {
          id: 'chrome',
          browser: 'Chrome',
          name: 'Default',
          bookmarks: true,
          history: true,
          cookies: true,
        },
      ];
    return [];
  });
  window.electron = { browserMigration: migration } as any;
  const page = () => (
    <Theme>
      <BrowserMigrationSettings />
    </Theme>
  );
  const first = render(page());
  expect(migration).not.toHaveBeenCalled();
  expect(screen.getByText(/macOS may ask you to allow access/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Review import' })).toBeNull();
  expect(screen.queryByLabelText('Source browser profile')).toBeNull();
  expect(screen.queryByLabelText('Migration destination space')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Choose CSV' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Scan for browser data' })
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeTruthy()
  );
  expect(
    screen
      .getByLabelText('Cookies and website logins')
      .getAttribute('aria-checked')
  ).toBe('true');
  expect(migration.mock.calls.map(([action]) => action)).toEqual([
    'profiles',
    'recover',
  ]);
  expect(
    (screen.getByRole('button', { name: 'Review import' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));
  await waitFor(() => expect(migration).toHaveBeenCalledTimes(4));
  first.unmount();
  migration.mockClear();
  render(page());
  expect(
    screen.getByRole('button', { name: 'Scan for browser data' })
  ).toBeTruthy();
  expect(migration).not.toHaveBeenCalled();
});
