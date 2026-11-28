import { act, renderHook } from '@testing-library/react';
import { SpaceManager, useSpaces } from '../utils/SpaceManager';
import { AppManager } from '../utils/AppManager';
import { eventBus } from '../utils/EventBus';
import { EVENT_KEY } from '../utils/constant';

jest.mock('../utils/EventBus', () => ({
  eventBus: { dispatch: jest.fn(), on: jest.fn(() => () => {}) },
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

it('switches synchronously without rebuilding metadata, scanning tabs or broadcasting selection', () => {
  SpaceManager.set([
    { id: 'default', name: 'Personal', color: 'iris', folders: [] },
    { id: 'work', name: 'Work', color: 'blue', folders: [], selectedAppId: 'saved' },
  ]);
  const { result, unmount } = renderHook(useSpaces);
  const original = result.current.spaces;
  const getAll = jest.spyOn(AppManager, 'getAll');
  (eventBus.dispatch as jest.Mock).mockClear();
  for (let index = 0; index < 100; index += 1) {
    act(() => SpaceManager.select(index % 2 ? 'default' : 'work'));
    expect(result.current.activeId).toBe(index % 2 ? 'default' : 'work');
    expect(result.current.spaces).toBe(original);
  }
  act(() => SpaceManager.update('work', { selectedAppId: 'another-tab' }));
  expect(result.current.spaces[0]).toBe(original[0]);
  expect(result.current.spaces[1].selectedAppId).toBe('another-tab');
  const updated = result.current.spaces;
  act(() => SpaceManager.update('work', { selectedAppId: 'another-tab' }));
  expect(result.current.spaces).toBe(updated);
  expect(getAll).not.toHaveBeenCalled();
  expect(eventBus.dispatch).not.toHaveBeenCalled();
  getAll.mockRestore();
  unmount();
});

it('still refreshes shared metadata from another window without replacing local selection', () => {
  SpaceManager.set([{ id: 'work', name: 'Work', color: 'blue', folders: [] }]);
  SpaceManager.select('work');
  SpaceManager.update('work', { selectedAppId: 'local-tab' });
  const { result, unmount } = renderHook(useSpaces);
  const refresh = (eventBus.on as jest.Mock).mock.calls.find(([key]) => key === EVENT_KEY.SPACE_UPDATE)[1];
  localStorage.setItem('kudium-window-selected-tabs', JSON.stringify({ work: 'other-window-tab' }));
  act(() => refresh());
  expect(result.current.active.selectedAppId).toBe('local-tab');
  unmount();
  act(() => SpaceManager.select('default'));
});
