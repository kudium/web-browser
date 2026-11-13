import { personalDataMatching } from '../browser/personalDataMatching';
import type { BrowserWindow, WebContents } from 'electron';
import { createHash } from 'crypto';
import { isProtectedField, type VaultField } from '../browser/passwordManager';
// eslint-disable-next-line import/no-relative-packages
import {
  type NormalizedHookInputRequest,
  type HookActionContext,
} from '../../../../packages/hooks/actions';
import {
  authenticatePersonalData,
  passwordVault,
  withPersonalData,
  personalDataRevision,
  onPersonalDataRevoked,
} from './passwordManager';
import { showBrowserDialog } from './dialogs';
import { fillActionField } from './hookActionField';

const fingerprint = (field: VaultField) =>
  createHash('sha256').update(JSON.stringify(field)).digest('hex');
export const personalFieldScore = personalDataMatching.score;
function savedCandidates(
  url: string,
  scope: string | undefined,
  field?: HookActionContext['field']
) {
  return withPersonalData((vault) => {
    const allowed = new Set(
      vault.matching(url, false, scope).map((record) => record.id)
    );
    return vault
      .records(scope)
      .filter((record) => allowed.has(record.id))
      .flatMap((record) => {
        const fields = [
          ...(record.kind === 'login' && record.username
            ? [
                {
                  name: 'Username',
                  value: record.username,
                  secret: false,
                  aliases: ['username', 'email'],
                },
              ]
            : []),
          ...record.fields.filter((v) => !isProtectedField(v)),
        ];
        return fields.map((saved) => ({
          recordId: record.id,
          name: saved.name,
          login:
            record.kind === 'login' &&
            saved.name === 'Username' &&
            saved.value === record.username,
          hash: fingerprint(saved),
          value: saved.value,
          aliases: saved.aliases || [],
          label: `${record.title} · ${saved.name}`,
          score: personalFieldScore(saved.name, saved.aliases || [], field),
        }));
      });
  });
}
type SavedCandidate = ReturnType<typeof savedCandidates>[number];
function selectedValue(selected: SavedCandidate, url: string, scope?: string) {
  return withPersonalData((vault) => {
    const record = vault.forFill(selected.recordId, url, false, scope);
    const saved =
      selected.login && record.kind === 'login'
        ? {
            name: 'Username',
            value: record.username,
            secret: false,
            aliases: ['username', 'email'],
          }
        : record.fields.find(
            (v) => v.name === selected.name && !isProtectedField(v)
          );
    if (!saved || fingerprint(saved) !== selected.hash)
      throw new Error('The saved field changed. Open the action again.');
    if (saved.value.length > 10000)
      throw new Error('This saved value is too long.');
    return saved.value;
  });
}
/** Selection and filling are browser-owned. No saved values are returned to the handler. */
export async function fillActionPersonalData(options: {
  owner: BrowserWindow;
  contents: WebContents;
  token: string;
  url: string;
  scope?: string;
  field: HookActionContext['field'];
  signal: AbortSignal;
  check: () => void;
}) {
  const { owner, contents, token, url, scope, field, check } = options;
  check();
  if (new URL(url).protocol !== 'https:')
    throw new Error('Personal Data autofill requires an HTTPS website.');
  const status = passwordVault().status(scope);
  if (!status.initialized)
    throw new Error(
      'Add a profile in Personal Data before filling saved information.'
    );
  if (!status.enabled || !status.autofill)
    throw new Error(
      'Enable manual autofill in Personal Data before using this action.'
    );
  await authenticatePersonalData();
  check();
  options.signal.throwIfAborted();
  const revision = personalDataRevision();
  const candidates = savedCandidates(url, scope, field).sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label)
  );
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) controller.abort();
  const off = onPersonalDataRevoked(abort);
  try {
    const answer = await showBrowserDialog(owner, {
      message: 'Fill from Personal Data',
      eyebrow: `${
        field?.label || field?.placeholder || field?.name || 'This field'
      } · ${new URL(url).host}`,
      buttons: ['Cancel'],
      cancelId: 0,
      defaultId: 0,
      savedPicker: candidates.map((candidate) => ({ label: candidate.label })),
      signal: controller.signal,
    });
    if (answer.response === 0) return;
    check();
    controller.signal.throwIfAborted();
    if (personalDataRevision() !== revision)
      throw new Error('Personal Data was locked. Open the action again.');
    const selected = candidates[answer.response - 1];
    if (!selected) throw new Error('The selected saved field is unavailable.');
    const value = selectedValue(selected, url, scope);
    check();
    await fillActionField(contents, token, value, false);
  } finally {
    off();
    options.signal.removeEventListener('abort', abort);
  }
}

/** Prepare only mapped, non-secret fields for local display, never for the worker. */
export async function prepareInputPersonalData(
  request: NormalizedHookInputRequest,
  options: {
    url: string;
    scope?: string;
    signal: AbortSignal;
    check: () => void;
  }
) {
  const { url, scope, check, signal } = options;
  const unavailable = (message: string) => ({
    choices: {} as Record<
      string,
      { id: string; label: string; value: string }[]
    >,
    initial: {} as Record<string, string>,
    hints: {} as Record<string, string>,
    unavailable: message,
    check: () => {
      check();
      signal.throwIfAborted();
    },
  });
  if (!request.fields.some((field) => field.personalData)) return undefined;
  if (new URL(url).protocol !== 'https:')
    return unavailable(
      'Saved Personal Data requires HTTPS. Enter a value instead.'
    );
  check();
  signal.throwIfAborted();
  const status = passwordVault().status(scope);
  if (!status.initialized)
    return unavailable(
      'No Personal Data saved yet. Enter a value or add an item in Preferences.'
    );
  if (!status.enabled || !status.autofill)
    return unavailable(
      'Personal Data autofill is off in Preferences. You can still enter a value.'
    );
  try {
    await authenticatePersonalData();
  } catch {
    check();
    signal.throwIfAborted();
    return unavailable(
      'Personal Data is locked. Enter a value or unlock it in Preferences.'
    );
  }
  check();
  signal.throwIfAborted();
  const revision = personalDataRevision();
  const candidates = savedCandidates(url, scope);
  const choices: Record<
    string,
    { id: string; label: string; value: string }[]
  > = {};
  const initial: Record<string, string> = {};
  const hints: Record<string, string> = {};
  request.fields.forEach((field) => {
    if (!field.personalData || field.type === 'password') return;
    const matches = candidates
      .map((candidate, i) => ({
        candidate,
        id: String(i),
        score: personalFieldScore(candidate.name, candidate.aliases, {
          type: '',
          label: field.personalData,
        }),
      }))
      .filter((match) => match.candidate.value.length <= 10000)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.candidate.label.localeCompare(b.candidate.label)
      );
    if (!matches.length)
      hints[field.key] =
        'No saved values available for this website. Enter your own value.';
    choices[field.key] = matches.map((match) => ({
      id: match.id,
      label: match.candidate.label,
      value: match.candidate.value,
    }));
    if (
      matches[0]?.score === 2 &&
      matches.filter((match) => match.score === 2).length === 1
    )
      initial[field.key] = matches[0].id;
  });
  return {
    choices,
    initial,
    hints,
    unavailable: undefined,
    check(selected: Record<string, string>) {
      check();
      signal.throwIfAborted();
      if (personalDataRevision() !== revision)
        throw new Error('Personal Data was locked. Open the action again.');
      Object.entries(selected).forEach(([key, id]) => {
        if (!choices[key]?.some((choice) => choice.id === id))
          throw new Error('The selected saved field is unavailable.');
        selectedValue(candidates[Number(id)], url, scope);
      });
    },
  };
}
