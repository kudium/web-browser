import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { Archive } from '../components/View/Settings/tabs/Archive';
import { AppManager } from '../utils/AppManager';

const tabs = [
  {
    id: 'one',
    name: 'Docs',
    sessionName: 'Work',
    sessionId: 'work',
    spaceId: 'personal',
    url: 'https://docs.google.com',
    icon: '',
    archived: true,
  },
  {
    id: 'two',
    name: 'Slack',
    sessionName: 'Work',
    sessionId: 'work',
    spaceId: 'personal',
    url: 'https://slack.com',
    icon: '',
    archived: true,
  },
  {
    id: 'other',
    name: 'Other',
    sessionName: 'Other space',
    sessionId: 'work',
    spaceId: 'other',
    url: 'https://example.com',
    icon: '',
    archived: true,
  },
];
jest.mock('../utils/hooks/useAppList', () => ({
  useAppList: () => ({ appList: tabs }),
}));
jest.mock('../utils/groupAccess', () => ({
  lockedGroup: () => false,
  useGroupAccess: () => {},
}));
jest.mock('../utils/AppManager', () => ({
  AppManager: { getAll: jest.fn(), set: jest.fn(), restore: jest.fn() },
}));
it('groups archived tabs, supports individual restore, and restores only the selected group and space', () => {
  (AppManager.getAll as jest.Mock).mockReturnValue(tabs);
  render(
    <Theme>
      <Archive />
    </Theme>
  );
  expect(
    screen.getByRole('region', { name: 'Archived group Work' })
  ).toHaveTextContent('2 tabs');
  expect(screen.queryByText('Slack')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Work 2 tabs' }));
  expect(screen.getByText('Slack')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]);
  expect(AppManager.restore).toHaveBeenCalledWith(tabs[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Restore group Work' }));
  const saved = (AppManager.set as jest.Mock).mock.calls[0][0];
  expect(
    saved
      .filter((tab: { archived: boolean }) => !tab.archived)
      .map((tab: { id: string }) => tab.id)
  ).toEqual(['one', 'two']);
  expect(saved[2]).toEqual(tabs[2]);
});

it('renders an inline searchable archive and restores the full group when filtered', () => {
  jest.clearAllMocks();
  (AppManager.getAll as jest.Mock).mockReturnValue(tabs);
  render(
    <Theme>
      <Archive embedded />
    </Theme>
  );
  expect(
    screen.queryByText(
      'Restore a group, or expand it to restore individual tabs.'
    )
  ).not.toBeInTheDocument();
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search archived groups' }),
    { target: { value: 'Docs' } }
  );
  expect(
    screen.queryByRole('region', { name: 'Archived group Other space' })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Work 1 tab' }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore group Work' }));
  const saved = (AppManager.set as jest.Mock).mock.calls[0][0];
  expect(
    saved
      .filter((tab: { archived: boolean }) => !tab.archived)
      .map((tab: { id: string }) => tab.id)
  ).toEqual(['one', 'two']);
  expect(saved[2]).toEqual(tabs[2]);
});
