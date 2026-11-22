import { createPersonalDataMatching, personalDataMatching } from '../../browser/personalDataMatching';
import type { VaultItem } from '../../browser/passwordManager';
/** Serialized into the owning main frame. No values or page errors return. */
export function fillDocument(
  item: VaultItem,
  ai: boolean,
  matchField = personalDataMatching.score
) {
  if (
    window.location.origin !== item.origin ||
    window.location.protocol !== 'https:'
  )
    return { filled: 0 };
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  );
  const usable = (
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  ) =>
    !input.disabled &&
    !('readOnly' in input && input.readOnly) &&
    input.getClientRects().length > 0 &&
    !['hidden', 'file', 'checkbox', 'radio', 'submit', 'button'].includes(
      input.type
    );
  const visible = inputs.filter(usable);
  const controls = Array.from(
    document.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input, textarea, select')
  ).filter(usable);
  const assignments: Array<
    [
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
      string,
      boolean
    ]
  > = [];
  if (item.kind === 'login') {
    const passwords = visible.filter(
      (input) =>
        input.type === 'password' && input.autocomplete !== 'new-password'
    );
    if (
      passwords.length === 1 &&
      !visible.some((input) => input.autocomplete === 'new-password')
    ) {
      const password = passwords[0];
      const usernames = visible.filter(
        (input) =>
          input.form === password.form &&
          (input.autocomplete === 'username' ||
            input.autocomplete === 'email' ||
            input.type === 'email')
      );
      if (usernames.length === 1 && item.username)
        assignments.push([usernames[0], item.username, false]);
      else {
        const candidates = visible.filter(
          (input) =>
            input.form === password.form &&
            input.type === 'text' &&
            /user|login|email/i.test([
              input.name, input.id, input.placeholder,
              input.getAttribute('aria-label') || '',
              Array.from(input.labels || []).map((label) => label.textContent || '').join(' '),
            ].join(' '))
        );
        if (candidates.length === 1 && item.username)
          assignments.push([candidates[0], item.username, false]);
      }
      if (item.password) assignments.push([password, item.password, true]);
    }
  }
  if (!ai || item.kind !== 'login') {
    const proposed = item.fields
      .filter((field) => field.value)
      .flatMap((field) => {
        const scored = controls.map((input) => ({
          input,
          score:
            input.type === 'password' && !field.secret
              ? 0
              : matchField(field.name, field.aliases || [], {
                  name: input.name,
                  id: input.id,
                  label:
                    (input.getAttribute('aria-labelledby') || '')
                      .split(/\s+/)
                      .slice(0, 10)
                      .map(
                        (id) => document.getElementById(id)?.textContent || ''
                      )
                      .join(' ')
                      .trim() ||
                    input.getAttribute('aria-label') ||
                    Array.from(input.labels || [])
                      .map((label) => label.textContent || '')
                      .join(' ')
                      .trim() ||
                    '',
                  placeholder: input.getAttribute('placeholder') || '',
                  autocomplete: input.autocomplete,
                  type: input.type,
                }),
        }));
        const best = Math.max(0, ...scored.map((entry) => entry.score));
        const matches = scored.filter(
          (entry) => entry.score === best && best > 0
        );
        return matches.length === 1 ? [{ input: matches[0].input, field }] : [];
      });
    proposed.forEach(({ input, field }) => {
      // Never resolve two saved values for one control by their storage order.
      if (
        proposed.filter((entry) => entry.input === input).length === 1 &&
        !assignments.some(([assigned]) => assigned === input)
      )
        assignments.push([input, field.value, field.secret]);
    });
  }
  let filled = 0;
  assignments.forEach(([input, value, secret]) => {
    if (window.location.origin !== item.origin || !input.isConnected) return;
    if (secret && !(input instanceof HTMLInputElement)) return;
    if (input instanceof HTMLSelectElement) {
      const options = Array.from(input.options).filter(
        (option) =>
          !option.disabled &&
          (option.value === value ||
            option.text.trim().toLowerCase() === value.toLowerCase())
      );
      if (options.length !== 1) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value'
      )?.set;
      if (!setter) return;
      setter.call(input, options[0].value);
    } else {
      if (secret && input instanceof HTMLInputElement) input.type = 'password';
      const prototype =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) return;
      setter.call(input, value);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    filled += 1;
  });
  return { filled };
}

/** Shared page injection: module dependencies must be supplied in the page realm. */
export function fillDocumentScript(item: VaultItem, ai: boolean) {
  return `(${fillDocument.toString()})(${JSON.stringify(item)},${ai},(${createPersonalDataMatching.toString()})().score)`;
}
