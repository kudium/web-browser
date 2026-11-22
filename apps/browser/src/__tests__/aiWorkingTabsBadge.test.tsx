import { render, screen } from '@testing-library/react';
import { AIWorkingTabsBadge } from '../components/UI/AIWorkingTabsBadge';

it('replaces working animations with a reply-needed indicator while waiting', () => {
  const { container, rerender } = render(
    <AIWorkingTabsBadge
      tabs={[{ id: 'one', name: 'Atlas' }]}
      activeTabId="one"
      onSelect={() => {}}
    />,
  );
  expect(container.querySelector('.loading-spinner')).not.toBeNull();
  rerender(
    <AIWorkingTabsBadge
      tabs={[{ id: 'one', name: 'Atlas' }]}
      activeTabId="one"
      waitingForReply
      onSelect={() => {}}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'AI needs your reply' }),
  ).toBeTruthy();
  expect(container.querySelector('.loading-spinner')).toBeNull();
  expect(container.querySelector('[data-working=true]')).toBeNull();
});

it('still shows the question attention indicator before any tab was used', () => {
  render(<AIWorkingTabsBadge tabs={[]} waitingForReply onSelect={() => {}} />);
  expect(
    screen.getByRole('button', { name: 'AI needs your reply' }),
  ).toBeTruthy();
});
