import { LocalStorage } from '../utils/LocalStorage';
import { SpaceManager, SPACE_KEY } from '../utils/SpaceManager';

jest.mock('../utils/EventBus', () => ({ eventBus: { dispatch: jest.fn() } }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test('restores the last space and selected tab after a new window session', () => {
  localStorage.setItem(
    SPACE_KEY,
    JSON.stringify([{ id: 'work', name: 'Work', color: 'iris', folders: [] }])
  );
  SpaceManager.select('work');
  SpaceManager.update('work', { selectedAppId: 'research-tab' });
  LocalStorage.set('user_last_app_id', 'research-tab');
  sessionStorage.clear();
  expect(SpaceManager.activeId()).toBe('work');
  expect(
    SpaceManager.getAll().find((space) => space.id === 'work')?.selectedAppId
  ).toBe('research-tab');
  expect(LocalStorage.get('user_last_app_id')).toBe('research-tab');
});

test('another window changing the saved selection does not replace this window selection', () => {
  LocalStorage.set('user_last_app_id', 'this-window-tab');
  localStorage.setItem('user_last_app_id', 'other-window-tab');
  expect(LocalStorage.get('user_last_app_id')).toBe('this-window-tab');
  sessionStorage.clear();
  expect(LocalStorage.get('user_last_app_id')).toBe('other-window-tab');
});

test('deleting selection clears both the current window and restart state', () => {
  LocalStorage.set('user_last_app_id', 'tab');
  LocalStorage.delete('user_last_app_id');
  expect(LocalStorage.get('user_last_app_id')).toBeNull();
});
