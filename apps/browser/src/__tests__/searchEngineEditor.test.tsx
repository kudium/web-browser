import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SearchEngineManager } from '../components/View/Settings/SearchEngineManager';
import { defaultPreferences } from '../browser/preferences';

it('shows failed saves inside the search engine popup and preserves the draft', async () => {
  const save = jest.fn().mockResolvedValue(false);
  render(
    <Theme>
      <SearchEngineManager
        preferences={defaultPreferences}
        busy={false}
        save={save}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit DuckDuckGo' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit search engine' });
  fireEvent.change(within(dialog).getByLabelText('Search engine name'), {
    target: { value: 'My search' },
  });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Save search engine' })
  );
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Couldn’t save'
  );
  expect(within(dialog).getByLabelText('Search engine name')).toHaveValue(
    'My search'
  );
});
