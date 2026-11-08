/** @jest-environment node */
import { aiProjectGroups, aiProjectReference } from '../main/aiGroupProjects';
import { linkedProjectFolder } from '../main/developerProject';
import { isGroupLocked } from '../main/groupLocks';
import { aiGroupId } from '../browser/aiGroups';
import type { IApp } from '../types';

jest.mock('../main/developerProject', () => ({
  linkedProjectFolder: jest.fn(),
}));
jest.mock('../main/groupLocks', () => ({ isGroupLocked: jest.fn() }));
const tabs = [
  {
    id: 'work-page',
    name: 'Work',
    sessionName: 'Work',
    sessionId: 'work',
    url: 'https://example.com',
    icon: '',
  },
  {
    id: 'home-page',
    name: 'Home',
    sessionName: 'Home',
    sessionId: 'home',
    url: 'https://example.org',
    icon: '',
  },
  {
    id: 'archived-page',
    name: 'Archived',
    sessionId: 'archived',
    archived: true,
    url: 'https://example.net',
    icon: '',
  },
] as IApp[];
beforeEach(() => {
  jest.clearAllMocks();
  (isGroupLocked as jest.Mock).mockReturnValue(false);
  (linkedProjectFolder as jest.Mock).mockImplementation((id) =>
    id === aiGroupId(tabs[0]) ? '/path/to/user/project' : undefined
  );
});

it('includes the linked folder in scoped group metadata without exposing other groups', () => {
  expect(aiProjectGroups(tabs, aiGroupId(tabs[0]))).toEqual([
    expect.objectContaining({
      name: 'Work',
      project: { path: '/path/to/user/project' },
      locked: false,
    }),
  ]);
  expect(linkedProjectFolder).not.toHaveBeenCalledWith(aiGroupId(tabs[1]));
});

it('returns null for unlinked folders and excludes archived groups', () => {
  const groups = aiProjectGroups(tabs, null);
  expect(groups).toHaveLength(2);
  expect(groups.find((group) => group.name === 'Home')?.project).toBeNull();
});

it('does not disclose paths from locked groups', () => {
  (isGroupLocked as jest.Mock).mockReturnValue(true);
  expect(aiProjectGroups(tabs, aiGroupId(tabs[0]))[0]).toMatchObject({
    project: null,
    locked: true,
  });
  expect(linkedProjectFolder).not.toHaveBeenCalled();
});

it('includes project paths when resolving group or page references and rejects references outside scope', () => {
  expect(aiProjectReference(tabs, '@work', aiGroupId(tabs[0]))).toMatchObject({
    project: { path: '/path/to/user/project' },
  });
  expect(
    aiProjectReference(tabs, '@work/work', aiGroupId(tabs[0]))
  ).toMatchObject({
    tabId: 'work-page',
    project: { path: '/path/to/user/project' },
  });
  expect(() => aiProjectReference(tabs, '@home', aiGroupId(tabs[0]))).toThrow(
    'outside AI scope'
  );
});
