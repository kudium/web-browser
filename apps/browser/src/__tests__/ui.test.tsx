import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { Custom } from '../components/View/AddApp/tabs/Custom';
import { AppManager } from '../utils/AppManager';
import { eventBus } from '../utils/EventBus';
import { EVENT_KEY } from '../utils/constant';
import { TabOption } from '../components/View/Settings/tabs/TabOption';
import { getAppearance } from '../utils/appearance';

jest.mock('../utils/EventBus', () => ({
  eventBus: { on: jest.fn(() => () => {}), dispatch: jest.fn() },
}));
Object.assign(global, {
  ResizeObserver: jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  })),
});
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  Object.assign(window, {
    electron: { siteDeveloper: { project: jest.fn().mockResolvedValue(null) } },
  });
});
it('adds an independent app and preserves the group when editing', () => {
  render(
    <Theme>
      <Custom />
    </Theme>
  );
  fireEvent.change(screen.getByLabelText('Website address'), {
    target: { value: 'example.com' },
  });
  fireEvent.change(screen.getByLabelText('App name'), {
    target: { value: 'Example' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add to workspace' }));
  const item = AppManager.getAll()[0];
  expect(item.url).toBe('https://example.com/');
  expect(item.sessionId).toBeTruthy();
  const editListener = (eventBus.on as jest.Mock).mock.calls.find(
    (call) => call[0] === EVENT_KEY.EDIT_APP
  )[1];
  const { act } = jest.requireActual('@testing-library/react');
  act(() => editListener(item));
  fireEvent.change(screen.getByLabelText('Group name'), {
    target: { value: 'Renamed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(AppManager.getAll()).toHaveLength(1);
  expect(AppManager.getAll()[0]).toEqual(
    expect.objectContaining({
      name: item.name,
      customName: item.customName,
      sessionId: item.sessionId,
      sessionName: 'Renamed',
      sessionNameCustom: true,
    })
  );
});
it('saves the chosen appearance', () => {
  render(
    <Theme>
      <TabOption />
    </Theme>
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(getAppearance()).toBe('dark');
});

it('keeps horizontal pages in the same group and separates sidebar groups', () => {
  const { tabGroups, groupTabs } = jest.requireActual('../utils/groups');
  const tabs = [
    {
      id: 'personal-home',
      name: 'Facebook',
      sessionId: 'personal',
      spaceId: 'default',
    },
    {
      id: 'personal-page',
      name: 'Messages',
      sessionId: 'personal',
      spaceId: 'default',
    },
    {
      id: 'work-home',
      name: 'Facebook Work',
      sessionId: 'work',
      spaceId: 'default',
    },
    {
      id: 'other-space',
      name: 'Project',
      sessionId: 'project',
      spaceId: 'project',
    },
  ];
  expect(
    tabGroups(tabs, 'default').map((item: { id: string }) => item.id)
  ).toEqual(['personal-home', 'work-home']);
  expect(
    groupTabs(tabs, tabs[0]).map((item: { id: string }) => item.id)
  ).toEqual(['personal-home', 'personal-page']);
});
it('moves tabs out of a deleted space without changing group identities', () => {
  const { SpaceManager } = jest.requireActual('../utils/SpaceManager');
  const work = SpaceManager.add('Work', 'blue');
  AppManager.add({
    id: 'work-tab',
    name: 'Work',
    icon: '',
    url: 'https://example.com',
    spaceId: work.id,
  });
  const before = AppManager.getAll()[0];
  SpaceManager.remove(work.id);
  expect(AppManager.getAll()[0]).toEqual({
    ...before,
    spaceId: 'default',
    folderId: undefined,
  });
  expect(SpaceManager.activeId()).toBe('default');
  expect(SpaceManager.getAll()).toHaveLength(1);
});
