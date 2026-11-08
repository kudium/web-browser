import { useLayoutEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { AppManager } from '../utils/AppManager';
import { useAppList } from '../utils/hooks/useAppList';
import { eventBus } from '../utils/EventBus';
import { EVENT_KEY } from '../utils/constant';
import { LocalStorage } from '../utils/LocalStorage';

const mockListeners = new Set<(data?: unknown) => void>();
jest.mock('../utils/EventBus', () => ({
  eventBus: {
    on: jest.fn((_name, listener) => {
      mockListeners.add(listener);
      return () => mockListeners.delete(listener);
    }),
    dispatch: jest.fn(() => mockListeners.forEach((listener) => listener())),
  },
}));

const tab = {
  id: 'first',
  name: 'First',
  url: 'https://fixture.example',
  icon: '',
  sessionId: 'account',
  sessionSlug: 'first',
};
beforeEach(() => {
  localStorage.clear();
  mockListeners.clear();
});

it('surfaces failed authoritative removal without broadcasting a retry loop', () => {
  AppManager.set([tab]);
  const original = localStorage.getItem('user_apps');
  const save = jest.spyOn(LocalStorage, 'set').mockImplementation(() => {});
  (eventBus.dispatch as jest.Mock).mockClear();
  try {
    expect(() => AppManager.removeDeleted([tab.id])).toThrow(
      'saved tabs could not be updated'
    );
    expect(localStorage.getItem('user_apps')).toBe(original);
    expect(eventBus.dispatch).not.toHaveBeenCalled();
  } finally {
    save.mockRestore();
  }
});

it('observes replacement, removal and unavailable storage after a cached read', () => {
  AppManager.set([tab]);
  expect(AppManager.getAll()[0].name).toBe('First');
  localStorage.setItem(
    'user_apps',
    JSON.stringify([{ ...tab, name: 'Other' }])
  );
  expect(AppManager.getAll()[0].name).toBe('Other');
  const read = jest.spyOn(LocalStorage, 'get').mockReturnValue(undefined);
  expect(AppManager.getAll()).toEqual([]);
  read.mockRestore();
  expect(AppManager.getAll()[0].name).toBe('Other');
  localStorage.removeItem('user_apps');
  expect(AppManager.getAll()).toEqual([]);
});

it('keeps cached results independent, including preserved unknown nested fields', () => {
  const futureTab = { ...tab, metadata: { tags: ['original'] } };
  localStorage.setItem('user_apps', JSON.stringify([futureTab]));
  const first = AppManager.getAll() as (typeof futureTab)[];
  first[0].name = 'Unsaved';
  first[0].metadata.tags.push('unsaved');
  first.push({ ...futureTab, id: 'unsaved' });
  expect(AppManager.getAll()).toEqual([futureTab]);
  expect(JSON.parse(localStorage.getItem('user_apps')!)).toEqual([futureTab]);
});

it('retries recovery after a damaged record replaces cached valid data', () => {
  AppManager.set([tab]);
  AppManager.getAll();
  const damaged = JSON.stringify([{ ...tab, sessionSlug: undefined }, null]);
  localStorage.setItem('user_apps', damaged);
  const save = jest.spyOn(LocalStorage, 'set').mockImplementation(() => {});
  expect(AppManager.getAll()[0].id).toBe(tab.id);
  expect(localStorage.getItem('user_apps')).toBe(damaged);
  save.mockRestore();
  expect(AppManager.getAll()[0].id).toBe(tab.id);
  expect(localStorage.getItem('user_apps.recovery')).toBe(damaged);
  expect(AppManager.getAll()).toHaveLength(1);
});

function Consumer({ tick }: { tick: number }) {
  const { appList } = useAppList();
  return <div data-testid="layout">{`${tick}:${appList[0]?.name}`}</div>;
}

it('updates subscribed consumers and releases listeners on unmount', () => {
  AppManager.set([tab]);
  const view = render(<Consumer tick={0} />);
  expect(screen.getByTestId('layout').textContent).toBe('0:First');
  const read = jest.spyOn(AppManager, 'getAll');
  view.rerender(<Consumer tick={1} />);
  expect(read).not.toHaveBeenCalled();
  act(() => AppManager.update('id', tab.id, { ...tab, name: 'Changed' }));
  expect(screen.getByTestId('layout').textContent).toBe('1:Changed');
  // A different app window writes the shared storage, then broadcasts its event.
  localStorage.setItem(
    'user_apps',
    JSON.stringify([{ ...tab, name: 'Foreign' }])
  );
  act(() => eventBus.dispatch(EVENT_KEY.APP_LIST_UPDATE));
  expect(screen.getByTestId('layout').textContent).toBe('1:Foreign');
  view.unmount();
  expect(mockListeners.size).toBe(0);
  read.mockRestore();
});

it('catches a write between render and subscription without another event', () => {
  AppManager.set([tab]);
  function Writer() {
    useLayoutEffect(() => {
      // The consumer has rendered, but has not installed its passive effect.
      AppManager.update('id', tab.id, { ...tab, name: 'During mount' });
    }, []);
    return null;
  }
  const view = render(
    <>
      <Consumer tick={0} />
      <Writer />
    </>
  );
  expect(screen.getByTestId('layout').textContent).toBe('0:During mount');
  view.unmount();
  expect(mockListeners.size).toBe(0);
});
