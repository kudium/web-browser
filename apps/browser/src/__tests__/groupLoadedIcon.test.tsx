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


it('shows compact folder groups as bounded icon stacks while preserving their custom identity and full-width folder icon', () => {
  const item={id:'one',sessionId:'group',sessionName:'Work',name:'Docs',url:'https://example.com',icon:'docs',groupDisplay:'folder' as const};
  const tabs=[item,{...item,id:'two',icon:'inbox'}, {...item,id:'three',icon:'calendar'}, {...item,id:'four',icon:'fourth'}];
  const view=render(<GroupIcon item={item} tabs={tabs} compact expanded />);
  const stack=view.container.querySelector('.compact-group-stack.group-icons');
  expect(stack).not.toBeNull();expect(stack?.children).toHaveLength(3);
  view.rerender(<GroupIcon item={{...item,sessionIconEmoji:'💼'}} tabs={tabs} compact />);
  expect(view.container.querySelector('.compact-group-stack')?.textContent).toBe('💼');
  view.rerender(<GroupIcon item={item} tabs={tabs} expanded />);
  expect(view.container.querySelector('.compact-group-stack')).toBeNull();
  expect(view.container.querySelector('svg')).not.toBeNull();
});
