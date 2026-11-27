import { BrowserWindow, type WebContents } from 'electron';
import { randomUUID } from 'crypto';
import {
  validateHookSuggestion,
  type HookSuggestion,
} from '../browser/hookSuggestions';
interface Binding {
  source: WebContents;
  owner: BrowserWindow;
  token: string;
  hookId: string;
  hookName: string;
  groupId: string;
  authorized: () => boolean;
}
const entries = new Map<string, { value: HookSuggestion; binding: Binding }>();
const pending = new Map<
  string,
  { binding: Binding; resolve: (error?: string) => void }
>();
function changed() {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed())
      window.webContents.send('hook-suggestions-changed');
  });
}
export function removeSuggestions(source: WebContents, hookId?: string) {
  let removed = false;
  entries.forEach((entry, id) => {
    if (
      entry.binding.source === source &&
      (hookId === undefined || entry.binding.hookId === hookId)
    ) {
      entries.delete(id);
      removed = true;
    }
  });
  pending.forEach((entry, id) => {
    if (
      entry.binding.source === source &&
      (hookId === undefined || entry.binding.hookId === hookId)
    ) {
      entry.resolve('Hook action is no longer available.');
      pending.delete(id);
    }
  });
  if (removed) changed();
}
export function upsertSuggestion(binding: Binding, input: unknown) {
  const output = validateHookSuggestion(input);
  const id = `${binding.source.id}:${binding.hookId}:${output.key}`;
  entries.forEach((entry, key) => {
    if (
      entry.value.expiresAt <= Date.now() ||
      entry.binding.source.isDestroyed()
    )
      entries.delete(key);
  });
  if (
    !entries.has(id) &&
    [...entries.values()].filter(
      (entry) => entry.binding.source === binding.source,
    ).length >= 20
  )
    throw new Error('Suggestion queue is full.');
  entries.set(id, {
    binding,
    value: {
      ...output,
      id,
      hookName: binding.hookName,
      groupId: binding.groupId,
    },
  });
  changed();
  return { id };
}
export function dismissSuggestion(binding: Binding, key: unknown) {
  if (typeof key !== 'string') throw new Error('Provide a suggestion key.');
  entries.delete(`${binding.source.id}:${binding.hookId}:${key}`);
  changed();
}
export function listSuggestions(
  owner: BrowserWindow,
  groupId?: string,
): HookSuggestion[] {
  return [...entries.values()]
    .filter(
      (entry) =>
        entry.binding.owner === owner &&
        entry.value.groupId === groupId &&
        entry.value.expiresAt > Date.now() &&
        !entry.binding.source.isDestroyed() &&
        entry.binding.authorized(),
    )
    .map((entry) => ({ ...entry.value }));
}
export async function runSuggestion(
  owner: BrowserWindow,
  id: string,
  groupId?: string,
) {
  const entry = entries.get(id);
  if (!entry || !listSuggestions(owner, groupId).some((item) => item.id === id))
    throw new Error('Suggestion unavailable.');
  if (
    [...pending.values()].some(
      (item) =>
        item.binding.source === entry.binding.source &&
        item.binding.hookId === entry.binding.hookId,
    )
  )
    throw new Error('This hook action is already running.');
  const requestId = randomUUID();
  await new Promise<void>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(
        new Error(
          'Hook action timed out and may still be running. Wait for it to finish before retrying.',
        ),
      );
    }, 10000);
    pending.set(requestId, {
      binding: entry.binding,
      resolve: (error) => {
        clearTimeout(timer);
        pending.delete(requestId);
        if (timedOut) {
          if (!error && entries.get(id) === entry) {
            entries.delete(id);
            changed();
          }
          return;
        }
        error ? reject(new Error(error)) : resolve();
      },
    });
    entry.binding.source.send('site-developer-suggestion-action', {
      token: entry.binding.token,
      hookId: entry.binding.hookId,
      actionId: entry.value.actionId,
      requestId,
    });
  });
  // Do not remove a new version submitted while the action was running.
  if (entries.get(id) === entry) entries.delete(id);
  changed();
}
export function suggestionResult(
  source: WebContents,
  token: unknown,
  hookId: string,
  input: unknown,
) {
  const result = input as { requestId?: string; error?: string };
  const request = result && pending.get(result.requestId || '');
  if (
    !request ||
    request.binding.source !== source ||
    request.binding.token !== token ||
    request.binding.hookId !== hookId ||
    !request.binding.authorized()
  )
    throw new Error('Unauthorized suggestion result.');
  request.resolve(
    result.error ? String(result.error).slice(0, 300) : undefined,
  );
}
