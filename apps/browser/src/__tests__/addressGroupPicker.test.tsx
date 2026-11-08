import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { GroupPicker } from '../components/UI/GroupPicker';

const options = [
  { id: 'one', name: 'Research' },
  { id: 'two', name: 'Work' },
];

test('reports opening and selection closure so the native page can suspend and resume', () => {
  const onOpenChange = jest.fn();
  const onChange = jest.fn();
  render(
    <Theme>
      <GroupPicker
        options={options}
        value="one"
        label="Switch group"
        disabled={false}
        onChange={onChange}
        onOpenChange={onOpenChange}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Switch group' }));
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('option', { name: 'Work' }));
  expect(onChange).toHaveBeenCalledWith('two');
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

test('releases native page suspension when an open picker unmounts', () => {
  const onOpenChange = jest.fn();
  const { unmount } = render(
    <Theme>
      <GroupPicker
        options={options}
        value="one"
        label="Switch group"
        disabled={false}
        onChange={() => {}}
        onOpenChange={onOpenChange}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Switch group' }));
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  unmount();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});
