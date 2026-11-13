import { personalDataMatching } from '../browser/personalDataMatching';

export interface FormReviewOptions {
  title: string;
  fields: {
    key: string;
    label: string;
    value: string;
    secret: boolean;
    mapping: string;
  }[];
}
export interface FormReviewResult {
  title: string;
  availability: 'site' | 'anywhere';
  fields: { key: string; value: string; mapping: string }[];
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ]!)
  );
const mappings = [
  { value: '', label: 'Field name' },
  ...personalDataMatching.types.filter((type) => !type.value.startsWith('cc-')),
];

/** Shared glass dialog content. Passwords stay in main; the review receives no secret values. */
export function formReviewDocument(review: FormReviewOptions) {
  return `<section class="form-review">
    <div class="review-heading"><div><label for="review-title">Name</label><input id="review-title" maxlength="120" value="${escape(
      review.title
    )}"></div><div><label for="review-availability">Use on</label><select id="review-availability"><option value="site">This website</option><option value="anywhere">Any website</option></select></div></div>
    <div class="review-fields">${review.fields
      .map(
        (field, i) =>
          `<div class="review-field"><label class="review-label"><input type="checkbox" data-review-key="${escape(
            field.key
          )}" checked><span>${escape(
            field.label
          )}</span></label><div class="review-controls"><input id="review-value-${i}" aria-label="${escape(
            field.label
          )} value" maxlength="4096" value="${
            field.secret ? '••••••••' : escape(field.value)
          }" ${
            field.secret ? 'readonly type="text"' : ''
          }><select id="review-mapping-${i}" aria-label="Fill ${escape(
            field.label
          )} as" ${field.secret ? 'disabled' : ''}>${(field.secret
            ? [{ value: field.mapping, label: 'Private field' }]
            : mappings.filter((m) => m.value !== 'current-password')
          )
            .map(
              (m) =>
                `<option value="${escape(m.value)}" ${
                  m.value === field.mapping ? 'selected' : ''
                }>${escape(m.label)}</option>`
            )
            .join('')}</select></div></div>`
      )
      .join('')}</div>
    <small class="input-error" id="review-error" role="status"></small>
  </section>`;
}
export const formReviewStyles = `
.review-heading{display:flex;gap:12px;margin-bottom:16px}.review-heading>div:first-child{flex:1;min-width:0}.review-heading>div:last-child{width:145px}.review-fields{display:flex;flex-direction:column;gap:8px}.review-field{padding:10px 12px;border-radius:10px;background:light-dark(#00000004,#ffffff05)}.review-label{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:12px}.review-label input{width:13px;height:13px;margin:0;flex-shrink:0}.review-label span{overflow-wrap:anywhere;min-width:0}.review-controls{display:flex;gap:8px}.review-controls>input{flex:1;min-width:0}.review-controls>select{width:145px;font-size:12px}.review-field:has(input[type=checkbox]:not(:checked)) .review-controls{opacity:.4}.review-controls input[readonly]{color:light-dark(#737377,#adadb2)}
`;
export function formReviewScript(review: FormReviewOptions) {
  return `const reviewFields=${JSON.stringify(
    review.fields.map(({ value, ...field }) => field)
  ).replace(/</g, '\\u003c')};
  const selectedReviewFields=()=>reviewFields.flatMap((field,i)=>document.querySelector('[data-review-key="'+field.key+'"]')?.checked?[{key:field.key,value:field.secret?'':document.getElementById('review-value-'+i).value,mapping:document.getElementById('review-mapping-'+i).value}]:[]);
  const updateReview=()=>{const secret=reviewFields.some(field=>field.secret&&document.querySelector('[data-review-key="'+field.key+'"]')?.checked);const availability=document.getElementById('review-availability');if(secret)availability.value='site';availability.disabled=secret};
  document.querySelectorAll('[data-review-key]').forEach(input=>input.addEventListener('change',updateReview));updateReview();
  window.formReviewValue=()=>({title:document.getElementById('review-title').value,availability:document.getElementById('review-availability').value,fields:selectedReviewFields()});
  window.validateFormReview=()=>{const value=window.formReviewValue();let error=!value.title.trim()?'Enter a name.':!value.fields.length?'Choose at least one field.':value.fields.length>30?'Choose up to 30 fields.':'';document.getElementById('review-error').textContent=error;return !error};`;
}
/** Renderer replies cannot select unknown fields or make private values portable. */
export function validateFormReviewResult(
  value: unknown,
  review: FormReviewOptions
): FormReviewResult {
  const result = value as FormReviewResult;
  if (
    !result ||
    typeof result.title !== 'string' ||
    !result.title.trim() ||
    result.title.length > 120 ||
    !['site', 'anywhere'].includes(result.availability) ||
    !Array.isArray(result.fields) ||
    !result.fields.length ||
    result.fields.length > 30 ||
    new Set(result.fields.map((f) => f?.key)).size !== result.fields.length
  )
    throw new Error('Invalid form review.');
  for (const field of result.fields) {
    const original = review.fields.find((f) => f.key === field?.key);
    if (
      !original ||
      typeof field.value !== 'string' ||
      field.value.length > 4096 ||
      typeof field.mapping !== 'string' ||
      (original.secret
        ? field.value !== '' ||
          field.mapping !== original.mapping ||
          result.availability !== 'site'
        : !mappings.some(
            (m) => m.value === field.mapping && m.value !== 'current-password'
          ))
    )
      throw new Error('Invalid form review field.');
  }
  return {
    title: result.title.trim(),
    availability: result.availability,
    fields: result.fields.map(({ key, value: text, mapping }) => ({
      key,
      value: text,
      mapping,
    })),
  };
}
