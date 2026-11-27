import { act, renderHook, waitFor } from '@testing-library/react';
import { useTodoEntries } from '../components/UI/useTodoEntries';
import { localDay } from '../browser/todos';

test('a task saved while Today is open appears on the change event in its group', async () => {
  let tasks: any[] = [];
  let changed = () => {};
  const unsubscribe = jest.fn();
  const request = jest.fn(async () => tasks);
  Object.assign(window, {electron:{
    passwordManager:request,
    onTodosChanged:(callback:()=>void)=>{changed=callback;return unsubscribe;},
  }});
  const subscribe = jest.spyOn(window.electron, 'onTodosChanged');
  const view = renderHook(() => useTodoEntries('group:page'));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(subscribe).toHaveBeenCalled());
  expect(view.result.current.entries).toEqual([]);
  tasks=[{id:'task',noteId:'inbox',title:'Review https://example.com',today:localDay(),scope:'group:page'}];
  await act(async ()=>{ changed(); });
  expect(request).toHaveBeenCalledTimes(2);
  await waitFor(()=>expect(view.result.current.entries).toEqual(tasks));
  expect(request).toHaveBeenLastCalledWith({action:'todos',scope:'group:page',all:false});
  view.unmount();
  expect(unsubscribe).toHaveBeenCalled();
});
