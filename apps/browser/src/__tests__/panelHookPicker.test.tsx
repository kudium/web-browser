import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SidebarPanels } from '../components/UI/SidebarPanels';
import { EMPTY_SIDEBAR_PANELS } from '../browser/sidebarPanels';
jest.mock('../utils/hooks/useAppList', () => ({
  useAppList: () => ({
    appList: [
      {
        id: 'current-page',
        name: 'Current page',
        url: 'https://example.com',
        sessionId: 'current-group',
      },
    ],
    lastIndex: 0,
  }),
}));
jest.mock('../browser/client', () => ({
  browser: { sidebarPanels: jest.fn(async () => ({})) },
}));
beforeAll(() => {
  global.ResizeObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })) as any;
});
it('runs a global hook in the current page, independently of the pinned panel group', async () => {
  const hook = {
    id: 'reader',
    name: 'Reader',
    enabled: true,
    path: '/*',
    exclusions: [],
    before: '',
    after: 'log("ready")',
    css: '',
  };
  const request = jest.fn(async (input) =>
    input.action === 'state'
      ? {
          destination: { id: 'current-page', url: 'https://example.com' },
          global: { enabled: true, hooks: input.allGroups ? [hook] : [] },
          globalHash: 'hash',
        }
      : null,
  );
  window.electron = {
    hookMarketplace: { request },
    browser: { tooltip: jest.fn(), nativeMenu: jest.fn() },
    platform: 'darwin',
  } as any;
  render(
    <Theme>
      <SidebarPanels
        active
        onClose={() => {}}
        state={{
          ...EMPTY_SIDEBAR_PANELS,
          panels: [{ id: 'existing', title: 'Existing panel', kind: 'hook' }],
          activeId: 'existing',
          targetGroup: 'another-group',
        }}
      />
    </Theme>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sidebar panel' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Global hooks' }));
  fireEvent.click(await screen.findByRole('option', { name: /Reader/ }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      action: 'global-run',
      id: 'current-page',
      hookId: 'global:all:reader',
      allGroups: true,
    }),
  );
});

it('opens the exact global hook editor when Manage is selected', async () => {
  const hook = { id:'reader',name:'Reader',enabled:true,path:'/*',exclusions:[],before:'',after:'log("ready")',css:'' };
  const request = jest.fn(async input => input.action === 'state' ? { destination:{id:'current-page',url:'https://example.com'},global:{enabled:true,hooks:input.allGroups?[hook]:[]},globalHash:'hash' } : null);
  window.electron = {hookMarketplace:{request},browser:{tooltip:jest.fn(),nativeMenu:jest.fn()},platform:'darwin'} as any;
  render(<Theme><SidebarPanels active onClose={()=>{}} state={{...EMPTY_SIDEBAR_PANELS,panels:[{id:'existing',title:'Existing panel',kind:'hook'}],activeId:'existing'}} /></Theme>);
  fireEvent.click(screen.getByRole('button',{name:'Sidebar panel'}));
  fireEvent.click(await screen.findByRole('button',{name:'Global hooks'}));
  fireEvent.click(await screen.findByRole('button',{name:'Manage Reader'}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith({action:'global-editor-open',id:'current-page',hookId:'reader',allGroups:true}));
  expect(request.mock.calls.some(([input])=>input.action==='site-editor-open')).toBe(false);
});
