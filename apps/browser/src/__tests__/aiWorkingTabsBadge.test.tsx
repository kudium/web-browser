import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AIWorkingTabsBadge } from '../components/UI/AIWorkingTabsBadge';

const tabs = [
  { id: 'first', name: 'Research' },
  { id: 'second', name: 'Results' },
];
it('shows visual tab rows with status and closes after choosing a tab', async () => {
  const onSelect = jest.fn();
  render(
    <Theme>
      <form>
        <AIWorkingTabsBadge
          tabs={tabs}
          activeTabId="second"
          onSelect={onSelect}
        />
      </form>
    </Theme>
  );
  const button = screen.getByRole('button', {
    name: 'View active AI tabs (2)',
  });
  expect(button.getAttribute('type')).toBe('button');
  fireEvent.click(button);
  const row = await screen.findByRole('button', { name: 'Open Results' });
  expect(screen.getByText('Active now')).toBeTruthy();
  expect(screen.getByText('Used in this run')).toBeTruthy();
  expect(row.querySelector('.app-icon svg')).toBeTruthy();
  fireEvent.click(row);
  expect(onSelect).toHaveBeenCalledWith('second');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('disappears when the run has no working tabs', () => {
  const onSelect = jest.fn();
  const { rerender } = render(
    <AIWorkingTabsBadge tabs={tabs} onSelect={onSelect} />
  );
  expect(screen.getByRole('button')).toBeTruthy();
  rerender(<AIWorkingTabsBadge tabs={[]} onSelect={onSelect} />);
  expect(screen.queryByRole('button')).toBeNull();
});
