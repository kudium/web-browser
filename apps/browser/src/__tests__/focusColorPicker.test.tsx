import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { IconPicker } from '../components/UI/IconPicker';
import { CollectionIconPicker } from '../components/UI/CollectionIcon';

it('only shows focus controls when enabled by its caller', () => {
  render(
    <Theme>
      <IconPicker
        label="Space icon"
        emoji=""
        image=""
        preview={<span />}
        onChange={jest.fn()}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Space icon' }));
  expect(screen.queryByText('Focus color')).toBeNull();
});
it('allows repeated custom color adjustments and restores the original color on cancel', () => {
  const onChange = jest.fn();
  render(
    <Theme>
      <CollectionIconPicker value={{ emoji: '', image: '', focusColor: '#123456' }} onChange={onChange} />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose collection icon' }));
  const custom = screen.getByLabelText('Custom background color for Choose collection icon');
  fireEvent.change(custom, { target: { value: '#223344' } });
  fireEvent.change(custom, { target: { value: '#334455' } });
  expect(custom).toHaveValue('#334455');
  expect(custom.closest('label')).toHaveAttribute('data-selected', 'true');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onChange).toHaveBeenLastCalledWith({ emoji: '', image: '', focusColor: '#123456' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('changes color independently of the icon and preserves the color when choosing an icon', () => {
  const onChange = jest.fn();
  const page = (focusColor?: string) => (
    <Theme>
      <CollectionIconPicker
        value={{ emoji: '📚', image: '', focusColor }}
        onChange={onChange}
      />
    </Theme>
  );
  const view = render(page());
  fireEvent.click(
    screen.getByRole('button', { name: 'Choose collection icon' })
  );
  expect(screen.getByText('Background color')).toBeInTheDocument();
  const transparent = screen.getByRole('button', {
    name: 'Transparent background color for Choose collection icon',
  });
  expect(transparent).toHaveAttribute('aria-pressed', 'true');
  expect(transparent).toBe(
    screen
      .getByRole('group', { name: 'Background color' })
      .querySelector('button')
  );
  expect(
    screen.queryByRole('button', { name: 'Use default background' })
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Red background color for Choose collection icon',
    })
  );
  expect(onChange).toHaveBeenLastCalledWith({
    emoji: '📚',
    image: '',
    focusColor: '#df6363',
  });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(
    screen.getByRole('button', {
      name: 'Red background color for Choose collection icon',
    })
  ).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(page('#df6363'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Choose collection icon' })
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Use work icon for Choose collection icon',
    })
  );
  expect(onChange).toHaveBeenLastCalledWith({
    emoji: '',
    image: 'kudium-symbol:work',
    focusColor: '#df6363',
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Choose collection icon' })
  );
  fireEvent.change(
    screen.getByLabelText('Custom background color for Choose collection icon'),
    { target: { value: '#123456' } }
  );
  expect(onChange).toHaveBeenLastCalledWith({
    emoji: '📚',
    image: '',
    focusColor: '#123456',
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Transparent background color for Choose collection icon',
    })
  );
  expect(onChange).toHaveBeenLastCalledWith({
    emoji: '📚',
    image: '',
    focusColor: undefined,
  });
});
