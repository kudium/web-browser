import '@testing-library/jest-dom';
import { render,screen,fireEvent,waitFor,act } from '@testing-library/react';
import { browser } from '../browser/client';
import { SuggestionsWidget } from '../components/UI/SuggestionsWidget';
jest.mock('../browser/client',()=>({browser:{nativeMenu:jest.fn()}}));
test('has no collapse button and builds Hide Suggestions only on context-menu request',async()=>{
  const hide=jest.fn();
  jest.mocked(browser.nativeMenu).mockClear().mockResolvedValue('0');
  const view=render(<SuggestionsWidget expanded onHide={hide}><span>Task</span></SuggestionsWidget>);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(browser.nativeMenu).not.toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByText('Task'));
  await waitFor(()=>expect(hide).toHaveBeenCalledTimes(1));
  expect(browser.nativeMenu).toHaveBeenCalledWith([{id:'0',label:'Hide Suggestions',enabled:true}]);
  view.rerender(<SuggestionsWidget expanded={false} onHide={hide}>Task</SuggestionsWidget>);
  await waitFor(()=>expect(screen.queryByText('Task')).not.toBeInTheDocument());
});
test('quickly showing the widget again cancels pending cleanup',async()=>{
  jest.useFakeTimers();
  const view=render(<SuggestionsWidget expanded onHide={()=>{}}>Task</SuggestionsWidget>);
  try {
    view.rerender(<SuggestionsWidget expanded={false} onHide={()=>{}}>Task</SuggestionsWidget>);
    view.rerender(<SuggestionsWidget expanded onHide={()=>{}}>Task</SuggestionsWidget>);
    await act(async()=>{jest.advanceTimersByTime(250);});
    expect(screen.getByText('Task')).toBeInTheDocument();
  }finally{view.unmount();jest.useRealTimers();}
});
