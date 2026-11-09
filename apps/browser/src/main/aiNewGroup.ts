import { randomUUID } from 'crypto';
import type { IApp } from '../types';
import { loginProfileKey } from '../utils/groups';

export function aiNewGroupName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100)
    throw new Error('Choose a group name between 1 and 100 characters.');
  return value.trim();
}

/** Sharing login state is explicit; group identity and layout remain separate. */
export function aiNewGroupFields(
  name: string,
  source?: IApp,
  shareSession: unknown = false
): Partial<IApp> {
  if (typeof shareSession !== 'boolean')
    throw new Error('shareSession must be true or false.');
  if (shareSession && !source)
    throw new Error('Choose a source tab to share its login session.');
  return {
    sessionId: randomUUID(),
    sessionProfileId: shareSession ? loginProfileKey(source!) : undefined,
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
    folderId: undefined,
    position: undefined,
    tabPinned: false,
    tabDefaultURL: undefined,
    tags: undefined,
    spaceId: source?.spaceId,
  };
}
