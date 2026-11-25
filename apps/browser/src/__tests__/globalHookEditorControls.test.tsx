import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { GlobalHookEditorPage } from '../components/View/GlobalHookEditorPage';
beforeAll(() => { global.ResizeObserver = jest.fn(() => ({observe:jest.fn(),unobserve:jest.fn(),disconnect:jest.fn()})) as any; });
jest.mock('../components/UI/HookEditor', () => ({ HookEditor: () => null }));
jest.mock('../components/UI/HookMarketplaceDialog', () => ({ OPEN_HOOK_MARKETPLACE: 'marketplace' }));
it('saves visible switches immediately while preserving unsaved edits and links to Hooks preferences', async () => {
  const hook = { id:'reader', name:'Reader', enabled:true, autoMode:false, path:'/*', exclusions:[], before:'', after:'log("ready")', css:'' };
  let state: any = { global:{enabled:true,hooks:[hook]}, globalHash:'first', editorHook:hook };
  const request = jest.fn(async input => {
    if(input.action==='global-save') state = { ...state, global:input.config, globalHash:'next', editorHook:input.config.hooks[0] };
    return state;
  });
  window.electron = { hookMarketplace:{request,onTestState:()=>()=>{}}, siteDeveloper:{command:jest.fn()}, browser:{tooltip:jest.fn()}, platform:'darwin' } as any;
  render(<Theme><GlobalHookEditorPage /></Theme>);
  const enabled = await screen.findByRole('switch', {name:'Enabled globally'});
  fireEvent.change(screen.getByLabelText('Name'), {target:{value:'Unfinished name'}});
  fireEvent.click(enabled);
  await waitFor(()=>expect(request).toHaveBeenCalledWith(expect.objectContaining({action:'global-save',config:expect.objectContaining({hooks:[expect.objectContaining({name:'Reader',enabled:false})]})})));
  await waitFor(()=>expect(enabled).not.toBeDisabled());
  expect(screen.getByLabelText('Name')).toHaveValue('Unfinished name');
  fireEvent.click(screen.getByRole('switch',{name:'Auto'}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith(expect.objectContaining({action:'global-save',config:expect.objectContaining({hooks:[expect.objectContaining({autoMode:true,enabled:false,enabledSites:[]})]})})));
  await waitFor(()=>expect(screen.getByRole('switch',{name:'Auto'})).not.toBeDisabled());
  fireEvent.keyDown(screen.getByRole('button',{name:'Hook footer options'}),{key:'ArrowDown'});
  fireEvent.click(await screen.findByRole('menuitem',{name:'View all global hooks'}));
  expect(request).toHaveBeenCalledWith({action:'global-preferences'});
});
