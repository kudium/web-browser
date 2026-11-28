import type { IApp } from '../types';
import { AppManager } from '../utils/AppManager';
import { applyWorkspaceMutation } from '../utils/workspaceMutation';
jest.mock('../utils/AppManager', () => ({
  AppManager: { getAll: jest.fn(), set: jest.fn() },
}));
const tab = (id: string) =>
  ({ id, sessionId: 'group', url: 'https://example.test/' }) as IApp;
beforeEach(() => {
  jest.clearAllMocks();
  (AppManager.getAll as jest.Mock).mockReturnValue([
    tab('one'),
    { ...tab('other'), sessionId: 'other-group' },
  ]);
});
it('saves imported tabs and group edits together while retaining other groups', () => {
  const addition = { ...tab('two'), tabPinned: true };
  applyWorkspaceMutation(
    [{ id: 'one', changes: { sessionName: 'Team' } }],
    [addition]
  );
  expect(AppManager.set).toHaveBeenCalledTimes(1);
  expect(AppManager.set).toHaveBeenCalledWith([
    { ...tab('one'), sessionName: 'Team' },
    { ...tab('other'), sessionId: 'other-group' },
    addition,
  ]);
});
it('rejects removed targets and colliding IDs before saving', () => {
  expect(() =>
    applyWorkspaceMutation([{ id: 'missing', changes: {} }], [tab('two')])
  ).toThrow('unavailable');
  expect(() => applyWorkspaceMutation([], [tab('one')])).toThrow('Duplicate');
  expect(() => applyWorkspaceMutation([], [tab('two'), tab('two')])).toThrow(
    'Duplicate'
  );
  expect(AppManager.set).not.toHaveBeenCalled();
});
it('uses the ordinary workspace access guard and propagates its refusal', () => {
  (AppManager.set as jest.Mock).mockImplementationOnce(() => {
    throw new Error('Locked group');
  });
  expect(() =>
    applyWorkspaceMutation([{ id: 'one', changes: { sessionName: 'Team' } }])
  ).toThrow('Locked group');
});
