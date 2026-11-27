export interface HookSuggestion {
  id: string;
  key: string;
  title: string;
  description?: string;
  actionId: string;
  hookName: string;
  groupId: string;
  expiresAt: number;
}
export function validateHookSuggestion(value: unknown) {
  const input = value as {
    key: string;
    title: string;
    description?: string;
    actionId: string;
    expiresAt?: string;
  };
  if (
    !input ||
    Object.keys(input).some(
      (key) =>
        !['key', 'title', 'description', 'actionId', 'expiresAt'].includes(key),
    ) ||
    typeof input.key !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.key) ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 200 ||
    typeof input.actionId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.actionId) ||
    (input.description !== undefined &&
      (typeof input.description !== 'string' || input.description.length > 500))
  )
    throw new Error('Invalid hook suggestion.');
  if (input.expiresAt !== undefined && typeof input.expiresAt !== 'string')
    throw new Error('Provide an ISO expiry timestamp.');
  const expiresAt =
    input.expiresAt === undefined
      ? Date.now() + 3600000
      : Date.parse(input.expiresAt);
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    expiresAt > Date.now() + 86400000
  )
    throw new Error('Suggestions must expire within 24 hours.');
  return { ...input, expiresAt };
}
