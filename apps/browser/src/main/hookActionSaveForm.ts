import type { BrowserWindow, WebContents } from 'electron';
import { personalDataMatching } from '../browser/personalDataMatching';
import { isProtectedField, type VaultItem } from '../browser/passwordManager';
import { showBrowserDialog } from './dialogs';
import {
  readActionFormForSave,
  findPageActionForms,
  captureSelectedActionForm,
} from './hookActionField';
import { onPersonalDataRevoked, savePersonalDocument } from './passwordManager';
import {
  validateFormReviewResult,
  type FormReviewOptions,
  type FormReviewResult,
} from './browserFormReview';

type CapturedField = Awaited<ReturnType<typeof readActionFormForSave>>[number];
function inferredMapping(field: CapturedField) {
  if (field.type === 'password') return 'current-password';
  const matches = personalDataMatching.types
    .filter((type) => type.value !== 'current-password')
    .map((type) => ({
      type,
      score: personalDataMatching.score(type.value, [], field),
    }))
    .sort((a, b) => b.score - a.score);
  return matches[0]?.score && matches[0].score > (matches[1]?.score || 0)
    ? matches[0].type.value
    : '';
}
export function formSaveReview(
  fields: CapturedField[],
  host: string
): FormReviewOptions {
  return {
    title: host,
    fields: fields.map((field) => {
      const mapping = inferredMapping(field);
      const label = (
        field.label ||
        field.placeholder ||
        field.name ||
        field.id ||
        `Field ${field.key.slice(1)}`
      )
        .trim()
        .slice(0, 120);
      const secret =
        field.type === 'password' ||
        isProtectedField({
          name: label,
          value: '',
          secret: false,
          aliases: mapping ? [mapping] : [],
        });
      return {
        key: field.key,
        label,
        mapping,
        secret,
        value: secret ? '' : field.value,
      };
    }),
  };
}
export function reviewedFormItem(
  fields: CapturedField[],
  review: FormReviewOptions,
  answer: FormReviewResult,
  origin: string
): VaultItem {
  const result = validateFormReviewResult(answer, review);
  const selected = result.fields
    .map((chosen) => {
      const captured = fields.find((field) => field.key === chosen.key)!;
      const original = review.fields.find((field) => field.key === chosen.key)!;
      return {
        captured,
        chosen,
        original,
        value: original.secret ? captured.value : chosen.value,
      };
    })
    .filter((field) => field.value);
  if (!selected.length) throw new Error('Choose at least one filled field.');
  const passwords = selected.filter(
    (field) => field.captured.type === 'password'
  );
  if (new Set(passwords.map((field) => field.value)).size > 1)
    throw new Error('Choose one password to save.');
  const usernames = selected.filter((field) =>
    ['username', 'email'].includes(field.chosen.mapping)
  );
  const username =
    usernames.find((field) => field.chosen.mapping === 'username') ||
    (usernames.length === 1 ? usernames[0] : undefined);
  const seen = new Map<string, number>();
  return {
    id: '',
    title: result.title,
    kind: passwords.length ? 'login' : 'profile',
    origin: result.availability === 'site' ? origin : '',
    username: passwords.length ? username?.value || '' : '',
    password: passwords[0]?.value || '',
    allowAI: true,
    notes: '',
    fields: selected
      .filter(
        (field) =>
          field.captured.type !== 'password' &&
          !(passwords.length && field === username)
      )
      .map((field) => {
        const label = field.original.label;
        const count = (seen.get(label) || 0) + 1;
        seen.set(label, count);
        const name = count === 1 ? label : `${label.slice(0, 110)} (${count})`;
        return {
          name,
          value: field.value,
          secret: field.original.secret,
          aliases: field.chosen.mapping
            ? [field.chosen.mapping]
            : [field.captured.name, field.captured.id]
                .filter(Boolean)
                .map((v) => v.slice(0, 120)),
        };
      }),
    source: {
      label: 'Saved form',
      url: origin,
      capturedAt: new Date().toISOString(),
    },
  };
}
export async function saveActionForm(options: {
  owner: BrowserWindow;
  contents: WebContents;
  token: string;
  url: string;
  scope?: string;
  signal: AbortSignal;
  check: () => void;
  page?: boolean;
}) {
  const { owner, contents, token, url, scope, check } = options;
  const origin = new URL(url).origin;
  if (new URL(url).protocol !== 'https:')
    throw new Error('Saving form data requires an HTTPS website.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  const off = onPersonalDataRevoked(abort);
  const current = () => {
    check();
    controller.signal.throwIfAborted();
  };
  try {
    current();
    if (options.page) {
      const forms = await findPageActionForms(contents, token);
      current();
      if (!forms.length)
        throw new Error('This page has no filled forms to save.');
      let selected = forms[0];
      if (forms.length > 1) {
        const choice = await showBrowserDialog(owner, {
          message: 'Choose a form',
          eyebrow: new URL(url).host,
          buttons: ['Cancel'],
          cancelId: 0,
          signal: controller.signal,
          savedPicker: forms.map((form) => ({ label: form.label })),
        });
        if (!choice.response) return;
        current();
        selected = forms[choice.response - 1];
        if (!selected) throw new Error('This form is unavailable.');
      }
      if (!(await captureSelectedActionForm(contents, token, selected.key)))
        throw new Error('The form changed. Open Save form again.');
      current();
    }
    const fields = await readActionFormForSave(contents, token);
    current();
    if (!fields.length)
      throw new Error('This form has no filled fields to save.');
    const review = formSaveReview(fields, new URL(url).host);
    const answer = await showBrowserDialog(owner, {
      message: 'Save form to Personal Data',
      eyebrow: new URL(url).host,
      buttons: ['Cancel', 'Save'],
      cancelId: 0,
      defaultId: 1,
      formReview: review,
      signal: controller.signal,
    });
    if (answer.response !== 1) return;
    current();
    if (!answer.formReview) throw new Error('Invalid form review.');
    const latest = await readActionFormForSave(contents, token);
    current();
    if (JSON.stringify(latest) !== JSON.stringify(fields))
      throw new Error('The form changed. Open Save form again.');
    await savePersonalDocument(
      reviewedFormItem(fields, review, answer.formReview, origin),
      scope,
      current
    );
  } finally {
    off();
    options.signal.removeEventListener('abort', abort);
  }
}
