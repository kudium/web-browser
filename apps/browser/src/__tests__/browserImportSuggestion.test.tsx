import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserImportSuggestion } from '../components/UI/BrowserImportSuggestion';

const preferences = jest.fn();
jest.mock('../browser/client', () => ({
  browser: { preferences: (...args: unknown[]) => preferences(...args) },
}));
beforeEach(() => {
  localStorage.clear();
  preferences.mockClear();
});
test('startup suggestion opens the permanent import preference and stays dismissed', () => {
  const view = render(<BrowserImportSuggestion />);
  fireEvent.click(screen.getByText('Import browsing data'));
  expect(preferences).toHaveBeenCalledWith('open', { section: 'import' });
  view.unmount();
  render(<BrowserImportSuggestion />);
  expect(screen.queryByText('Import browsing data')).toBeNull();
});
