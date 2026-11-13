import type { ContextMenuParams, WebContents } from 'electron';
// eslint-disable-next-line import/no-relative-packages
import type { HookActionField } from '../../../../packages/hooks/actions';
const ACTION_WORLD = 1109;
export function captureActionField(
  contents: WebContents,
  params: ContextMenuParams,
  token: string
) {
  // Chromium menu coordinates are view pixels; DOM hit-testing uses CSS pixels.
  const zoom = contents.getZoomFactor();
  const x = params.x / zoom;
  const y = params.y / zoom;
  return captureFieldElement(
    contents,
    token,
    params.menuSourceType === 'keyboard'
      ? 'document.activeElement'
      : `document.elementFromPoint(${x}, ${y})`,
    params.menuSourceType === 'keyboard'
      ? 'element.shadowRoot.activeElement'
      : `element.shadowRoot.elementFromPoint(${x}, ${y})`
  );
}
function captureFieldElement(
  contents: WebContents,
  token: string,
  expression: string,
  shadowExpression = 'element.shadowRoot.querySelector("input, textarea, [contenteditable]")',
  fieldsExpression?: string
) {
  return contents
    .executeJavaScriptInIsolatedWorld(ACTION_WORLD, [
      {
        code: `(() => {
      let element = ${expression};
      while (element?.shadowRoot) {
        const next = ${shadowExpression};
        if (!next || next === element) break;
        element = next;
      }
      if (element?.isContentEditable) {
        while (element.parentElement?.isContentEditable) element = element.parentElement;
      }
      const type = e => e instanceof HTMLTextAreaElement ? 'textarea' : e instanceof HTMLInputElement ? e.type : e?.isContentEditable ? 'contenteditable' : '';
      const editable = e => ['text', 'search', 'tel', 'url', 'email', 'number', 'password', 'textarea', 'contenteditable'].includes(type(e)) && !e.readOnly && !e.matches(':disabled') && e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible';
      if (!editable(element)) throw new Error('Field unavailable.');
      const form = element.form || element.closest('form');
      const fields = (${
        fieldsExpression || '(form ? Array.from(form.elements) : [element])'
      }).filter(editable).slice(0, 50);
      if (!fields.includes(element)) {
        if (fields.length < 50) fields.push(element);
        else fields[fields.length - 1] = element;
      }
      const entries = fields.map((e, i) => ({ element: e, type: type(e), key: 'f' + i, form: e.form || e.closest('form') }));
      const metadata = entry => {
        const e = entry.element;
        const text = v => String(v || '').slice(0, 500);
        const root = e.getRootNode();
        const labelled = (e.getAttribute('aria-labelledby') || '').split(/\\s+/).slice(0, 10).map(id => root.getElementById?.(id)?.textContent || '').join(' ');
        return { key: entry.key, type: entry.type, label: text(labelled || e.getAttribute('aria-label') || Array.from(e.labels || []).map(l => l.textContent).join(' ')), name: text(e.name), id: text(e.id), placeholder: text(e.getAttribute('placeholder')), autocomplete: text(e.getAttribute('autocomplete')), required: !!e.required, ...(e.maxLength >= 0 ? { maxLength: e.maxLength } : {}), ...(e.minLength >= 0 ? { minLength: e.minLength } : {}), ...(e.pattern ? { pattern: text(e.pattern) } : {}) };
      };
      const check = entry => {
        const e = entry.element;
        if (!e.isConnected || !editable(e) || type(e) !== entry.type || (e.form || e.closest('form')) !== entry.form || (entry.metadata && JSON.stringify(metadata(entry)) !== JSON.stringify(entry.metadata))) throw new Error('The clicked field changed.');
      };
      globalThis.__hookActionField = { token: ${JSON.stringify(
        token
      )}, element, url: location.href, entries, metadata, check };
    })()`,
      },
    ])
    .then(
      () => true,
      () => false
    );
}
/** Snapshot of the clicked form when the user invokes an action. Password values stay private. */
export async function findPageActionForms(
  contents: WebContents,
  token: string
): Promise<Array<{ key: string; label: string }>> {
  return contents.executeJavaScriptInIsolatedWorld(ACTION_WORLD, [
    {
      code: `(() => {
    const usable = e => ['text','search','tel','url','email','number','password','textarea'].includes(e instanceof HTMLTextAreaElement ? 'textarea' : e.type) && !e.readOnly && !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const candidates = Array.from(document.forms).slice(0,99).flatMap(form => {
      const fields = Array.from(form.elements).filter(usable);
      if (!fields.length || !fields.some(e => e.value)) return [];
      return [{form, element:fields[0], fields, count:fields.length}];
    });
    const unowned = Array.from(document.querySelectorAll('input,textarea')).filter(e => !e.form && usable(e));
    if (unowned.length && unowned.some(e => e.value)) candidates.push({form:document.body,element:unowned[0],fields:unowned,count:unowned.length});
    globalThis.__hookActionPageForms = {token:${JSON.stringify(
      token
    )}, url:location.href, candidates};
    return candidates.map((candidate,i) => {
      const form = candidate.form;
      const labelled = (form.getAttribute('aria-labelledby') || '').split(/\\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
      const label = form===document.body ? 'Page fields' : String(labelled || form.getAttribute('aria-label') || form.querySelector('h1,h2,h3,legend')?.textContent || form.getAttribute('name') || form.id || ('Form '+(i+1))).trim().slice(0,120);
      return {key:'g'+i,label:label+' ('+candidate.count+' fields)'};
    });
  })()`,
    },
  ]);
}
export function captureSelectedActionForm(
  contents: WebContents,
  token: string,
  key: string
) {
  if (!/^g\d{1,2}$/.test(key)) throw new Error('Invalid form selection.');
  return captureFieldElement(
    contents,
    token,
    `(() => {
    const state=globalThis.__hookActionPageForms;
    const candidate=state?.candidates[${Number(key.slice(1))}];
    if (!state || state.token!==${JSON.stringify(
      token
    )} || state.url!==location.href || !candidate?.form.isConnected || !candidate.element.isConnected || !candidate.fields.includes(candidate.element)) throw new Error('The form changed.');
    if (candidate.fields.some(e => !e.isConnected || (candidate.form===document.body ? !!e.form : e.form!==candidate.form))) throw new Error('The form changed.');
    return candidate.element;
  })()`,
    undefined,
    `globalThis.__hookActionPageForms.candidates[${Number(
      key.slice(1)
    )}].fields`
  );
}
/** Snapshot of the clicked form when the user invokes an action. Password values stay private. */
export async function readActionFieldContext(
  contents: WebContents,
  token: string,
  includeForm: boolean
): Promise<{ field: HookActionField; form?: { fields: HookActionField[] } }> {
  return contents
    .executeJavaScriptInIsolatedWorld(ACTION_WORLD, [
      {
        code: `(() => {
      const field = globalThis.__hookActionField;
      if (!field || field.token !== ${JSON.stringify(
        token
      )} || field.url !== location.href) throw new Error('Field unavailable.');
      const entries = ${includeForm} ? field.entries : field.entries.filter(e => e.element === field.element);
      const fields = entries.map(e => { field.check(e); e.metadata = field.metadata(e); return { ...e.metadata, ...(e.type !== 'password' ? {value: String(e.element.isContentEditable ? e.element.textContent || '' : e.element.value).slice(0, 10000)} : {}) }; });
      return { field: fields.find(e => e.key === field.entries.find(v => v.element === field.element).key), ...(${includeForm} ? { form: {fields} } : {}) };
    })()`,
      },
    ])
    .catch(() => {
      throw new Error('The clicked field changed or is unavailable.');
    });
}
/** Browser-only snapshot for saving. Never supply this result to the hook worker. */
export async function readActionFormForSave(
  contents: WebContents,
  token: string
): Promise<Array<HookActionField & { value: string }>> {
  return contents.executeJavaScriptInIsolatedWorld(ACTION_WORLD, [
    {
      code: `(() => {
      const field = globalThis.__hookActionField;
      if (!field || field.token !== ${JSON.stringify(
        token
      )} || field.url !== location.href) throw new Error('Field unavailable.');
      return field.entries.flatMap(entry => {
        field.check(entry);
        const metadata = field.metadata(entry);
        if (/token|csrf|otp|one-time|cc-csc|cvv|cvc|security.?code/i.test([metadata.autocomplete, metadata.name, metadata.id, metadata.label].join(' '))) return [];
        const value = String(entry.element.isContentEditable ? entry.element.textContent || '' : entry.element.value);
        if (!value || value.length > 4096) return [];
        return [{...metadata, value}];
      });
    })()`,
    },
  ]);
}
/** Preflight all targets before filling, then check again after each page-owned input event. */
export async function fillActionForm(
  contents: WebContents,
  token: string,
  values: Array<{ key: string; value: string }>
) {
  await writeActionFields(contents, token, values, false, true);
}
export async function fillActionField(
  contents: WebContents,
  token: string,
  value: string,
  password: boolean
) {
  await writeActionFields(
    contents,
    token,
    [{ key: '', value }],
    password,
    false
  );
}
async function writeActionFields(
  contents: WebContents,
  token: string,
  values: Array<{ key: string; value: string }>,
  password: boolean,
  formFill: boolean
) {
  await contents
    .executeJavaScriptInIsolatedWorld(ACTION_WORLD, [
      {
        code: `(() => {
      const field = globalThis.__hookActionField;
      const checkDocument = () => { if (!field || field.token !== ${JSON.stringify(
        token
      )} || field.url !== location.href) throw new Error('The clicked field changed.'); };
      checkDocument();
      const values = ${JSON.stringify(values)};
      const entries = values.map(v => ({ ...v, entry: ${formFill} ? field.entries.find(e => e.key === v.key) : field.entries.find(e => e.element === field.element) }));
      const check = v => {
        checkDocument();
        if (!v.entry || (${formFill} && !v.entry.metadata) || ${password} !== (v.entry.type === 'password')) throw new Error('Invalid field target.');
        field.check(v.entry);
        if (v.entry.element.maxLength >= 0 && v.value.length > v.entry.element.maxLength) throw new Error('Value exceeds the field limit.');
      };
      entries.forEach(check);
      for (const v of entries) {
        check(v);
        const element = v.entry.element;
        if (element.isContentEditable) element.textContent = v.value;
        else Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, v.value);
        element.dispatchEvent(new Event('input', {bubbles: true}));
        element.dispatchEvent(new Event('change', {bubbles: true}));
      }
    })()`,
      },
    ])
    .catch(() => {
      throw new Error(
        'A target field changed, is unavailable, or rejects this value.'
      );
    });
}
