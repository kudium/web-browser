import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { BulkActions } from '../components/View/Settings/tabs/BulkActions';
import { preferenceSections } from '../components/View/Settings/Settings';

it('prioritizes search and hooks and consolidates workspace management', () => {
  expect(preferenceSections.slice(0, 2).map((item) => item.id)).toEqual([
    'search',
    'hooks',
  ]);
  expect(preferenceSections.find((item) => item.id === 'apps')?.title).toBe(
    'Workspace'
  );
  expect(
    preferenceSections.some((item) => ['spaces', 'archive'].includes(item.id))
  ).toBe(false);
});
it('requires confirmation and only removes selected eligible items', () => {
  const onRemove = jest.fn();
  const onSelect = jest.fn();
  render(
    <Theme>
      <BulkActions
        ids={['one', 'two']}
        selected={['one', 'locked', 'gone']}
        onSelect={onSelect}
        onRemove={onRemove}
        action="Remove"
        description="Saved logins remain on this device."
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected…' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    'Saved logins remain'
  );
  expect(onRemove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onRemove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected…' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove 1 item' }));
  expect(onRemove).toHaveBeenCalledWith(['one']);
  expect(onSelect).toHaveBeenCalledWith([]);
});
it('selects all eligible items and disables removal without a selection', () => {
  const onSelect = jest.fn();
  render(
    <Theme>
      <BulkActions
        ids={['one', 'two']}
        selected={[]}
        onSelect={onSelect}
        onRemove={jest.fn()}
        action="Delete"
        description="Contents move to Personal."
      />
    </Theme>
  );
  expect(
    screen.getByRole('button', { name: 'Delete selected…' })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
  expect(onSelect).toHaveBeenCalledWith(['one', 'two']);
});
