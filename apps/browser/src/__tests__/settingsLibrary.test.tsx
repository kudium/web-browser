import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsLibrary } from '../components/UI/SettingsLibrary';

it('supports keyboard selection and keeps a valid detail after removal', () => {
  const entries = [
    { id: 'one', name: 'First' },
    { id: 'two', name: 'Second' },
  ];
  const show = (items: typeof entries) => (
    <SettingsLibrary label="Items" entries={items}>
      {(entry) => <p>Details for {entry.name}</p>}
    </SettingsLibrary>
  );
  const view = render(show(entries));
  const first = screen.getByRole('button', { name: 'First' });
  first.focus();
  fireEvent.keyDown(first, { key: 'ArrowDown' });
  expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
  expect(screen.getByText('Details for Second')).toBeInTheDocument();
  view.rerender(show([entries[0]]));
  expect(screen.getByText('Details for First')).toBeInTheDocument();
  view.rerender(show([...entries, { id: 'three', name: 'New item' }]));
  expect(screen.getByText('Details for New item')).toBeInTheDocument();
});
