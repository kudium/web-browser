import type { VaultItem } from '../browser/passwordManager';
import type { BrowserActivity } from '../browser/activity';
import { passwordVault } from './passwordManager';
import { browserActivity } from './activity';

export function saveNoteWithActivity(
  note: VaultItem,
  scope: string | undefined,
  context: Pick<BrowserActivity, 'source' | 'groupId' | 'trigger'>,
  url?: string
) {
  const recordId = passwordVault().save({ ...note, asRead: false }, scope);
  // Persist the note first: a timeline failure must never lose the user's note.
  let activityId: string | undefined;
  try {
    activityId = browserActivity().create(
      {
        title: note.title,
        message: 'A note is ready to review.',
        noteId: recordId,
        url,
      },
      { ...context, scope }
    ).id;
  } catch {
    /* The saved note remains available through its own unread badge. */
  }
  return {
    recordId,
    title: note.title,
    asRead: false,
    deepLink: `#kudiumbrowser-note-${recordId}`,
    activityId,
    ...(activityId
      ? {}
      : {
          warning:
            'Note saved, but the activity notification could not be recorded.',
        }),
  };
}
