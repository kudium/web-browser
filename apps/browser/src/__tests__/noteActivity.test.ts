/** @jest-environment node */
import { saveNoteWithActivity } from '../main/noteActivity';
import { passwordVault } from '../main/passwordManager';
import { browserActivity } from '../main/activity';
import type { VaultItem } from '../browser/passwordManager';

jest.mock('../main/passwordManager', () => ({ passwordVault: jest.fn() }));
jest.mock('../main/activity', () => ({ browserActivity: jest.fn() }));
const note: VaultItem = {
  id: '',
  title: 'Research',
  notes: 'Verdict',
  kind: 'note',
  origin: '',
  username: '',
  password: '',
  fields: [],
  allowAI: true,
};
const save = jest.fn(() => 'note-id');
const create = jest.fn(() => ({ id: 'activity-id' }));
beforeEach(() => {
  save.mockClear();
  create.mockReset().mockReturnValue({ id: 'activity-id' });
  (passwordVault as jest.Mock).mockReturnValue({ save });
  (browserActivity as jest.Mock).mockReturnValue({ create });
});
test('AI notes are unread and create a linked activity in their scope', () => {
  const result = saveNoteWithActivity(note, 'scope', {
    source: 'ai',
    groupId: 'group',
  });
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ asRead: false, allowAI: true }),
    'scope'
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ noteId: 'note-id', title: 'Research' }),
    { source: 'ai', groupId: 'group', scope: 'scope' }
  );
  expect(result).toMatchObject({
    recordId: 'note-id',
    activityId: 'activity-id',
    deepLink: '#kudiumbrowser-note-note-id',
  });
});
test('activity write failure preserves the saved note and returns an explicit warning', () => {
  create.mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  const result = saveNoteWithActivity(note, undefined, { source: 'hook' });
  expect(save).toHaveBeenCalledTimes(1);
  expect(result.recordId).toBe('note-id');
  expect(result.warning).toContain('could not be recorded');
});
