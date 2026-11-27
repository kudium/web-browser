import type { WebContents } from 'electron';

export interface FormContextState { hasValue: boolean; formHasValues: boolean }
const empty = (): FormContextState => ({ hasValue: false, formHasValues: false });

/** Runs in the isolated page world; returns flags only, never field values. */
export function formContextStateAtPoint(x: number, y: number): FormContextState {
  const usable = (element: Element): element is HTMLInputElement | HTMLTextAreaElement =>
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    !element.disabled && !element.readOnly && !!element.value &&
    !['hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'search'].includes(element.type) &&
    element.getClientRects().length > 0;
  const field = document.elementFromPoint(x, y);
  if (field && usable(field)) return { hasValue: true, formHasValues: true };
  const controls = (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.form
    ? field.form.elements : document.querySelectorAll('input,textarea');
  const deadline = performance.now() + 8;
  for (let index = 0; index < controls.length && performance.now() < deadline; index++) {
    if (usable(controls[index])) return { hasValue: false, formHasValues: true };
  }
  return { hasValue: false, formHasValues: false };
}

/** A busy or failed renderer cannot hold up the native menu indefinitely. */
export async function readFormContextState(contents: WebContents, x: number, y: number): Promise<FormContextState> {
  if (!Number.isFinite(x) || !Number.isFinite(y) || contents.isDestroyed()) return empty();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      contents.executeJavaScriptInIsolatedWorld(999, [{ code: `(${formContextStateAtPoint.toString()})(${x},${y})` }])
        .then(result => ({ hasValue: result?.hasValue === true, formHasValues: result?.formHasValues === true })),
      new Promise<FormContextState>(resolve => { timer = setTimeout(() => resolve(empty()), 60); }),
    ]);
  } catch { return empty(); }
  finally { if (timer) clearTimeout(timer); }
}
