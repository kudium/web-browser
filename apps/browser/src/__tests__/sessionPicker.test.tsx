import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { GroupPicker } from '../components/UI/GroupPicker';

Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});
it('searches all groups, deduplicates profiles and chooses with the keyboard', () => {
  const change = jest.fn();
  render(
    <Theme>
      <GroupPicker
        options={[
          { id: 'a', name: 'Personal' },
          { id: 'b', name: 'Work' },
          { id: 'b', name: 'Work duplicate' },
        ]}
        value="a"
        onChange={change}
        label="Group login"
        disabled={false}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Group login' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'work' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  expect(change).toHaveBeenCalledWith('b');
});

it.each([2, 120])(
  'opens with the current group active and Enter keeps it (%i groups)',
  (count) => {
    const change = jest.fn();
    const options = Array.from({ length: count }, (_, index) => ({
      id: `group-${index}`,
      name: `Group ${index}`,
    }));
    const current = options[count - 1];
    render(
      <Theme>
        <GroupPicker
          options={options}
          value={current.id}
          onChange={change}
          label="Developer group"
          disabled={false}
        />
      </Theme>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Developer group' }));
    const input = screen.getByRole('combobox');
    const selected = screen.getByRole('option', { name: current.name });
    expect(selected).toHaveAttribute('data-active', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', selected.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith(current.id);
  }
);
