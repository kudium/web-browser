import { randomUUID } from 'crypto';
import type { IApp } from '../types';
import { loginProfileKey } from '../utils/groups';
import { collectionProfile } from '../utils/collectionGroups';

export function aiNewGroupName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100)
    throw new Error('Choose a group name between 1 and 100 characters.');
  return value.trim();
}

/** Sharing login state is explicit; group identity and layout remain separate. */
export function aiNewGroupFields(
  name: string,
  source?: IApp,
  shareSession: unknown = false,
  collectionId: unknown = undefined,
  display: unknown = 'folder',
  sessionMode: unknown = collectionId ? 'collection' : 'separate'
): Partial<IApp> {
  if (typeof shareSession !== 'boolean')
    throw new Error('shareSession must be true or false.');
  if (shareSession && !source)
    throw new Error('Choose a source tab to share its login session.');
  if (display !== 'folder' && display !== 'stack')
    throw new Error('Choose folder or stack display.');
  if (
    collectionId !== undefined &&
    (typeof collectionId !== 'string' ||
      !source ||
      source.folderId !== collectionId)
  )
    throw new Error('Choose a source tab in the requested collection.');
  if (sessionMode !== 'collection' && sessionMode !== 'separate')
    throw new Error('Choose collection or separate session.');
  if (sessionMode === 'collection' && !collectionId)
    throw new Error('Choose a collection to inherit its session.');
  const inheritedProfile =
    sessionMode === 'collection' && typeof collectionId === 'string'
      ? collectionProfile(source?.spaceId || 'default', collectionId)
      : undefined;
  return {
    groupDisplay: display,
    sessionMode: shareSession ? 'separate' : sessionMode,
    sessionId: randomUUID(),
    sessionProfileId: shareSession
      ? loginProfileKey(source!)
      : inheritedProfile,
    protectionGroupId: shareSession
      ? source!.protectionGroupId || source!.sessionId || 'legacy'
      : undefined,
    extensionInstallTarget: undefined,
    sessionName: name,
    sessionNameCustom: true,
    sessionNameGenerated: false,
    sessionSlug: undefined,
    sessionIconEmoji: undefined,
    sessionIconImage: undefined,
    sessionHomeURL: undefined,
    browserEmail: undefined,
    browserEmails: undefined,
    folderId: typeof collectionId === 'string' ? collectionId : undefined,
    position: undefined,
    tabPinned: false,
    tabDefaultURL: undefined,
    tags: undefined,
    spaceId: source?.spaceId,
  };
}
