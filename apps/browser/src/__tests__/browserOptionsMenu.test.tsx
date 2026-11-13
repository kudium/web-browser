import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { BrowserOptionsMenu } from '../components/UI/BrowserOptionsMenu';

Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});

it('opens the custom menu, disables page actions, and routes settings', async () => {
  const select = jest.fn();
  render(
    <Theme>
      <BrowserOptionsMenu onSelect={select} pageAvailable={false} />
    </Theme>
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Browser options' }), {
    key: 'Enter',
  });
  expect(
    await screen.findByRole('menuitem', { name: 'Find on page…' })
  ).toHaveAttribute('data-disabled');
  expect(
    screen.getByRole('menuitem', { name: 'Passwords and autofill' })
  ).not.toHaveAttribute('data-disabled');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Settings…' }));
  expect(select).toHaveBeenCalledWith('settings');
});

it('offers Global hooks without an open page and routes to the Hooks preferences section', async () => {
  const select = jest.fn();
  render(
    <Theme>
      <BrowserOptionsMenu onSelect={select} pageAvailable={false} />
    </Theme>
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Browser options' }), {
    key: 'Enter',
  });
  const item = await screen.findByRole('menuitem', { name: 'Global hooks' });
  expect(item).not.toHaveAttribute('data-disabled');
  fireEvent.click(item);
  expect(select).toHaveBeenCalledWith('hooks');
});
