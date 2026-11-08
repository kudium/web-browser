import { render, screen } from '@testing-library/react';
import { GroupIcon } from '../components/UI/GroupIcon';

jest.mock('../components/UI/AppIcon/AppIcon', () => ({
  AppIcon: ({ icon }: any) => <span data-testid="icon">{icon}</span>,
}));
it('uses the loaded tab icon even when imported group settings retain their original snapshot', () => {
  const imported = {
    id: 'one',
    sessionId: 'group',
    name: 'Example',
    url: 'https://example.com',
    icon: '',
  };
  render(
    <GroupIcon
      item={imported}
      tabs={[{ ...imported, icon: 'loaded-favicon' }]}
    />
  );
  expect(screen.getByTestId('icon').textContent).toBe('loaded-favicon');
});
