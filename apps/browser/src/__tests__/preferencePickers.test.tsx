import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SpaceIconPicker } from '../components/UI/SpaceIcon';
import { SpaceColorPicker } from '../components/UI/SpaceColorPicker';

Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});

it('reveals icon customization on demand and dismisses it with Escape', () => {
  const change = jest.fn();
  render(
    <Theme>
      <SpaceIconPicker
        icon="home"
        image=""
        emoji=""
        label="Personal icon"
        onChange={change}
      />
    </Theme>
  );
  expect(
    screen.queryByLabelText('Emoji for Personal icon')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Personal icon' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Use 🚀 for Personal icon' })
  );
  expect(change).toHaveBeenCalledWith({
    iconEmoji: '🚀',
    iconImage: undefined,
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Personal icon' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps color options hidden until requested and preserves custom color updates', () => {
  const change = jest.fn();
  render(
    <Theme>
      <SpaceColorPicker
        color="iris"
        customColor=""
        label="Personal color"
        onChange={change}
      />
    </Theme>
  );
  expect(
    screen.queryByLabelText('Custom Personal color')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Personal color' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Blue for Personal color' })
  );
  expect(change).toHaveBeenCalledWith({
    color: 'blue',
    customColor: undefined,
  });
  fireEvent.change(screen.getByLabelText('Custom Personal color'), {
    target: { value: '#112233' },
  });
  expect(change).toHaveBeenLastCalledWith({ customColor: '#112233' });
});
