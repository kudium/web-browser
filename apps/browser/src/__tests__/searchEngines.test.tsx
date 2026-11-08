import '@testing-library/jest-dom';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { defaultPreferences } from '../browser/preferences';
import { validateSearchEngines } from '../browser/searchEngines';
import { SearchEngineManager } from '../components/View/Settings/SearchEngineManager';
import { resolveAddress } from '../utils/navigation';

it('validates templates and safely encodes custom searches', () => {
  expect(() =>
    validateSearchEngines([
      // eslint-disable-next-line no-script-url
      { id: 'custom', name: 'Custom', url: 'javascript:alert("%s")' },
    ])
  ).toThrow('HTTP or HTTPS');
  expect(() =>
    validateSearchEngines([
      { id: 'custom', name: 'Custom', url: 'https://example.com/' },
    ])
  ).toThrow('%s');
  expect(() => validateSearchEngines([])).toThrow();
  localStorage.setItem(
    'touchbox-search-engines',
    JSON.stringify([
      {
        id: 'custom',
        name: 'Custom',
        url: 'https://example.com/search?q=%s&source=touchbox',
      },
    ])
  );
  localStorage.setItem('touchbox-search-engine', 'custom');
  expect(resolveAddress('coffee & tea')).toBe(
    'https://example.com/search?q=coffee%20%26%20tea&source=touchbox'
  );
  localStorage.clear();
});
it('adds, edits, selects defaults and deletes engines while retaining one default', async () => {
  function Harness() {
    const [preferences, setPreferences] = useState(defaultPreferences);
    return (
      <Theme>
        <SearchEngineManager
          preferences={preferences}
          busy={false}
          save={async (patch) => {
            setPreferences((current) => ({ ...current, ...patch }));
            return true;
          }}
        />
      </Theme>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByText('Add search engine'));
  expect(screen.getByRole('dialog')).toHaveAccessibleName('New search engine');
  expect(screen.getByLabelText('Search URL').tagName).toBe('TEXTAREA');
  fireEvent.change(screen.getByLabelText('Search engine name'), {
    target: { value: 'Brave' },
  });
  fireEvent.change(screen.getByLabelText('Search URL'), {
    target: { value: 'https://search.brave.com/search?q=%s' },
  });
  fireEvent.change(screen.getByLabelText('Search shortcut'), {
    target: { value: 'brave' },
  });
  fireEvent.click(screen.getByText('Save search engine'));
  await waitFor(() =>
    expect(screen.queryByLabelText('Search URL')).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByLabelText('Edit Brave'));
  expect(screen.getByLabelText('Search shortcut')).toHaveValue('brave');
  fireEvent.change(screen.getByLabelText('Search engine name'), {
    target: { value: 'Brave Search' },
  });
  fireEvent.click(screen.getByText('Save search engine'));
  await screen.findByLabelText('Edit Brave Search');
  const row = screen
    .getByLabelText('Edit Brave Search')
    .closest('.preference-row')!;
  fireEvent.click(row.querySelector('button')!);
  expect(row).toHaveTextContent('Default');
  fireEvent.click(screen.getByLabelText('Delete Brave Search'));
  expect(screen.queryByText('Brave Search')).not.toBeInTheDocument();
  expect(
    screen.getByLabelText('Edit DuckDuckGo').closest('.preference-row')
  ).toHaveTextContent('Default');
  fireEvent.click(screen.getByLabelText('Delete Google'));
  fireEvent.click(screen.getByLabelText('Delete Bing'));
  expect(screen.getByLabelText('Delete DuckDuckGo')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Edit DuckDuckGo'));
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit search engine');
  fireEvent.change(screen.getByLabelText('Search URL'), {
    target: { value: 'https://draft.example/?q=%s' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByLabelText('Edit DuckDuckGo').closest('.preference-row')
  ).not.toHaveTextContent('draft.example');
});

it('preserves shortcuts and rejects duplicate keywords', () => {
  expect(
    validateSearchEngines([
      {
        id: 'jira',
        name: 'Jira',
        keyword: ' JIRA ',
        url: 'https://jira.example.com/?q=%s',
      },
    ])[0].keyword
  ).toBe('jira');
  expect(() =>
    validateSearchEngines([
      { id: 'a', name: 'A', keyword: 'same', url: 'https://a.test/?q=%s' },
      { id: 'b', name: 'B', keyword: 'SAME', url: 'https://b.test/?q=%s' },
    ])
  ).toThrow('unique shortcut');
});
