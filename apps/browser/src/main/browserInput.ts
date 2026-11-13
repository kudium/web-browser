import type { BrowserWindow } from 'electron';
// eslint-disable-next-line import/no-relative-packages
import {
  validateHookInputRequest,
  validateHookInputResponse,
  type HookInputResponse,
  type HookInputRequest,
} from '../../../../packages/hooks/actions';
import { showBrowserDialog } from './dialogs';
import { hookInputMemory, type HookInputBinding } from './hookInputMemory';
import { prepareInputPersonalData } from './hookActionPersonalData';
import { onPersonalDataRevoked } from './passwordManager';

export { inputFieldLabel } from '../../../../packages/hooks/actions';

/** One local form for saved values, custom answers and future AI input flows. */
export async function requestBrowserInput(
  owner: BrowserWindow,
  options: {
    recipient: string;
    fields: HookInputRequest['fields'];
    request?: HookInputRequest;
    signal: AbortSignal;
    detail?: string;
    url?: string;
    scope?: string;
    check?: () => void;
    binding?: HookInputBinding;
    preview?: boolean;
  }
): Promise<HookInputResponse> {
  const request = validateHookInputRequest(
    options.request || { type: 'input', fields: options.fields }
  );
  const check = () => {
    options.signal.throwIfAborted();
    options.check?.();
  };
  check();
  const saved =
    options.url && !options.preview
      ? await prepareInputPersonalData(request, {
          url: options.url,
          scope: options.scope,
          signal: options.signal,
          check,
        })
      : undefined;
  check();
  const memory =
    options.binding && !options.preview
      ? hookInputMemory(options.binding)
      : undefined;
  const remembered = memory?.load(request.fields) || {};
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  const off = saved ? onPersonalDataRevoked(abort) : () => {};
  try {
    const answer = await showBrowserDialog(owner, {
      message: request.title || 'Provide input',
      eyebrow: `${options.recipient}${
        options.url ? ` · ${new URL(options.url).host}` : ''
      }`,
      detail: options.detail,
      buttons: ['Cancel', 'Continue'],
      cancelId: 0,
      defaultId: 1,
      inputs: request.fields.map((field) => {
        const choice = saved?.choices[field.key]?.find(
          (item) => item.id === saved.initial[field.key]
        );
        const hasRemembered = Object.prototype.hasOwnProperty.call(
          remembered,
          field.key
        );
        return {
          ...field,
          label: field.label!,
          value: hasRemembered ? remembered[field.key] : choice?.value || '',
          saved: saved?.choices[field.key],
          savedHint: field.personalData
            ? saved?.unavailable ||
              saved?.hints?.[field.key] ||
              (!saved
                ? options.preview
                  ? 'Personal Data is unavailable in previews. Enter a sample value.'
                  : 'Personal Data is unavailable here. Enter a value instead.'
                : undefined)
            : undefined,
          savedId: hasRemembered ? undefined : choice?.id,
          remember: !!memory?.available && field.type !== 'password',
          remembered: hasRemembered,
        };
      }),
      signal: controller.signal,
    });
    check();
    controller.signal.throwIfAborted();
    if (answer.response === 0) return null;
    saved?.check(answer.savedSources || {});
    const values = validateHookInputResponse(request, answer.inputValues)!;
    check();
    const remember = answer.remembered || [];
    if (
      remember.some(
        (key) =>
          !request.fields.some(
            (field) => field.key === key && field.type !== 'password'
          )
      )
    )
      throw new Error('Invalid remembered field.');
    memory?.save(request.fields, values, remember);
    return values;
  } finally {
    off();
    options.signal.removeEventListener('abort', abort);
  }
}
