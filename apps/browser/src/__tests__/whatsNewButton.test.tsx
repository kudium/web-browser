import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { WhatsNewButton } from '../components/UI/WhatsNewButton';

beforeEach(() => localStorage.clear());
test('opens website notes and remembers the viewed version', () => {
  const onOpen = jest.fn(() => true);
  const view = render(
    <Theme>
      <WhatsNewButton version="1.0.8" onOpen={onOpen} />
    </Theme>
  );
  fireEvent.click(screen.getByRole('button', { name: 'What’s New in 1.0.8' }));
  expect(onOpen).toHaveBeenCalledWith(
    'https://browser.kudium.com/whats-new#release-1.0.8'
  );
  expect(
    screen.queryByRole('button', { name: 'What’s New in 1.0.8' })
  ).toBeNull();
  view.unmount();
  render(
    <Theme>
      <WhatsNewButton version="1.0.8" onOpen={onOpen} />
    </Theme>
  );
  expect(
    screen.queryByRole('button', { name: 'What’s New in 1.0.8' })
  ).toBeNull();
});
test('a later version offers notes again', () => {
  localStorage.setItem('kudiumbrowser-whats-new-seen', '1.0.7');
  render(
    <Theme>
      <WhatsNewButton version="1.0.8" compact />
    </Theme>
  );
  expect(
    screen.getByRole('button', { name: 'What’s New in 1.0.8' })
  ).toBeTruthy();
});
