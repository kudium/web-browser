export interface ActivityInput {
  title: string;
  message?: string;
  url?: string;
  noteId?: string;
}
export interface HookActivityTrigger {
  sourceId?: string;
  profile: string;
  origin: string;
  pageURL: string;
  hookId?: string;
  hookName: string;
}
export interface BrowserActivity extends ActivityInput {
  trigger?: HookActivityTrigger;
  id: string;
  createdAt: number;
  asRead: boolean;
  source: 'ai' | 'hook';
  scope?: string;
  groupId?: string;
}
export const activityLink = (id: string) => `#kudiumbrowser-activity-${id}`;
export function validateActivity(value: unknown): ActivityInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid activity.');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['title', 'message', 'url', 'noteId'].includes(key)
    ) ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 120 ||
    (input.message !== undefined &&
      (typeof input.message !== 'string' || input.message.length > 2000)) ||
    (input.noteId !== undefined &&
      (typeof input.noteId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(input.noteId)))
  )
    throw new Error('Invalid activity title, message or note link.');
  if (input.url !== undefined) {
    if (typeof input.url !== 'string' || input.url.length > 4096)
      throw new Error('Invalid activity URL.');
    const url = new URL(input.url);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error(
        'Activity URLs must use HTTP or HTTPS without credentials.'
      );
  }
  return {
    title: input.title.trim(),
    message: input.message as string | undefined,
    url: input.url as string | undefined,
    noteId: input.noteId as string | undefined,
  };
}

/** Shared destination behavior for timeline rows and their browser toast action. */
export function openActivityDestination(entry: Pick<BrowserActivity, 'noteId' | 'url'>) {
  if (entry.noteId) window.dispatchEvent(new CustomEvent('kudiumbrowser-open-note', {detail:entry.noteId}));
  else if (entry.url) window.open(entry.url, '_blank', 'noopener,noreferrer');
}
