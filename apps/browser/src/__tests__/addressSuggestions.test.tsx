import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { AddressBar } from '../components/UI/AddressBar';
import { browser } from '../browser/client';

jest.mock('../browser/client', () => ({browser:{history:jest.fn(),onHistory:jest.fn(()=>()=>{}),preferences:jest.fn(()=>Promise.resolve({searchEngines:[]}))}}));
Object.assign(global,{ResizeObserver:jest.fn(()=>({observe:jest.fn(),unobserve:jest.fn(),disconnect:jest.fn()}))});
const props={placement:'header' as const,inputProps:{onChange:jest.fn()},onSubmit:jest.fn(),onCopy:jest.fn(),onSiteSettings:jest.fn(),toolsDisabled:false,expanded:false,onToggleExtensions:jest.fn(),extensions:null,tools:null};
const record={id:'history',profile:'public',url:'https://example.com/visited',title:'Example visited',visitedAt:Date.now()};
it('keeps input focus and supports typing, keyboard selection and click navigation',async()=>{
 (browser.history as jest.Mock).mockResolvedValue([record]);
 const navigate=jest.fn(), select=jest.fn();
 render(<Theme><AddressBar {...props} suggestionTabs={[{id:'tab',name:'Example open',url:'https://example.com/open',icon:''}]} onSuggestionTab={select} onSuggestionNavigate={navigate}/></Theme>);
 const input=screen.getByRole('combobox');input.focus();
 fireEvent.change(input,{target:{value:'example'}});
 await screen.findByRole('option',{name:/Example visited/});
 expect(input).toHaveFocus();
 fireEvent.keyDown(input,{key:'ArrowDown'});fireEvent.keyDown(input,{key:'Enter'});
 expect(select).toHaveBeenCalledWith(expect.objectContaining({id:'tab'}));
 expect(navigate).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:'example.com'}});
 fireEvent.click(await screen.findByRole('option',{name:/Example visited/}));
 expect(navigate).toHaveBeenCalledWith(record.url);
 await waitFor(()=>expect(screen.queryByRole('listbox')).toBeNull());
});
it('excludes locked history and does not load history in private mode',async()=>{
 (browser.history as jest.Mock).mockClear().mockResolvedValue([record]);
 const {rerender}=render(<Theme><AddressBar {...props} onSuggestionNavigate={jest.fn()} hiddenHistoryProfiles={new Set(['public'])}/></Theme>);
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'example'}});
 await waitFor(()=>expect(browser.history).toHaveBeenCalled());
 expect(screen.queryByRole('option',{name:/Example visited/})).toBeNull();
 fireEvent.keyDown(screen.getByRole('combobox'),{key:'Escape'});
 (browser.history as jest.Mock).mockClear();
 rerender(<Theme><AddressBar {...props} onSuggestionNavigate={jest.fn()} privateMode/></Theme>);
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'example'}});
 expect(browser.history).not.toHaveBeenCalled();
 expect(screen.queryByRole('option',{name:/Example visited/})).toBeNull();
});

it('offers Chat and the full command dialog without navigating the page', async () => {
 (browser.history as jest.Mock).mockResolvedValue([]);
 const chat=jest.fn(), more=jest.fn(), navigate=jest.fn();
 render(<Theme><AddressBar {...props} onSuggestionNavigate={navigate} onChat={chat} onMoreActions={more}/></Theme>);
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'Explain this page'}});
 fireEvent.click(await screen.findByRole('button',{name:'Chat'}));
 expect(chat).toHaveBeenCalledWith('Explain this page');expect(navigate).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'Find my groups'}});
 fireEvent.click(await screen.findByRole('button',{name:'More actions'}));
 expect(more).toHaveBeenCalledWith('Find my groups');
});
