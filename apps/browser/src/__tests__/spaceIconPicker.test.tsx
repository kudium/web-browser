import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SpaceIconPicker } from '../components/UI/SpaceIcon';

it('suggests neutral symbols and clears custom icons when choosing one', () => {
  const onChange = jest.fn();
  render(
    <Theme>
      <SpaceIconPicker
        icon="work"
        emoji="💼"
        image=""
        label="Space icon"
        onChange={onChange}
      />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Space icon' }));
  expect(
    screen.getByRole('group', { name: 'Suggested icons' })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('group', { name: 'Suggested emojis' })
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Emoji for Space icon')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Use home icon for Space icon' })
  );
  expect(onChange).toHaveBeenCalledWith({
    icon: 'home',
    iconImage: undefined,
    iconEmoji: undefined,
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
