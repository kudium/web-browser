import {
  formReviewDocument,
  formReviewScript,
  formReviewStyles,
  validateFormReviewResult,
  type FormReviewOptions,
  type FormReviewResult,
} from './browserFormReview';
import { savedPickerScript } from './browserInputPicker';
import {
  BrowserWindow,
  MessageBoxOptions,
  dialog,
  nativeTheme,
} from 'electron';
// eslint-disable-next-line import/no-relative-packages
import {
  hookInputError,
  type HookInputField,
} from '../../../../packages/hooks/actions';
import { browserDialogStyles } from './browserDialogStyles';

export interface BrowserDialogOptions extends MessageBoxOptions {
  destructive?: boolean;
  formReview?: FormReviewOptions;
  /** Searchable saved-value list; selecting an item returns its index + 1. */
  savedPicker?: { label: string }[];
  eyebrow?: string;
  /** Browser-owned input fields, reusable by hooks and other request consumers. */
  inputs?: (HookInputField & {
    label: string;
    value?: string;
    choices?: { value: string; label: string }[];
    saved?: { id: string; label: string; value: string }[];
    savedId?: string;
    savedHint?: string;
    remember?: boolean;
    remembered?: boolean;
  })[];
  importReview?: {
    pages: { name: string; url: string; hooks: boolean }[];
    hooks: { origin: string; source: string }[];
  };
  scope?: { label: string; response: number }[];
  scopeLabel?: string;
  confirmLabel?: string;
  technicalDetail?: string;
  technicalDetailLabel?: string;
  permissions?: string[];
  moreInformation?: string;
  siteOrigin?: string;
  icon?: 'location' | 'shield';
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character]!)
  );

function inputDocument(inputs: NonNullable<BrowserDialogOptions['inputs']>) {
  const groups = new Map<string, string[]>();
  inputs.forEach((input, i) => {
    const group = input.group || '';
    if (!groups.has(group)) groups.set(group, []);
    const attrs = `id="input-${i}" data-input="${escapeHtml(input.key)}" ${
      input.required ? 'required' : ''
    } aria-describedby="error-${i}" ${
      input.remembered ? 'data-was-remembered="true"' : ''
    } ${input.savedId ? `data-source="${escapeHtml(input.savedId)}"` : ''}`;
    const choices = input.options || input.choices;
    const type = choices ? 'select' : input.type || 'text';
    const control =
      type === 'select'
        ? `<select ${attrs}><option value="">Choose…</option>${choices!
            .map(
              (choice) =>
                `<option value="${escapeHtml(choice.value)}" ${
                  choice.value === input.value ? 'selected' : ''
                }>${escapeHtml(choice.label)}</option>`
            )
            .join('')}</select>`
        : type === 'textarea'
        ? `<textarea ${attrs} maxlength="10000" rows="3" placeholder="${escapeHtml(
            input.placeholder || ''
          )}">${escapeHtml(input.value || '')}</textarea>`
        : `<input ${attrs} type="${type}" ${
            type === 'number' ? 'step="any"' : ''
          } maxlength="10000" autocomplete="off" placeholder="${escapeHtml(
            input.placeholder || ''
          )}" value="${escapeHtml(input.value || '')}">`;
    const picker =
      input.personalData || input.saved?.length
        ? `<button type="button" class="saved-picker" aria-label="Personal Data for ${escapeHtml(
            input.label
          )}" aria-haspopup="dialog" aria-expanded="false" data-saved-for="input-${i}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`
        : '';
    groups
      .get(group)!
      .push(
        `<div class="input-row"><div class="input-label"><label for="input-${i}">${escapeHtml(
          input.label
        )}${
          input.required
            ? '<span class="required" aria-hidden="true">*</span>'
            : ''
        }</label></div>${
          picker
            ? `<div class="saved-input">${control}${picker}</div>`
            : control
        }<small class="input-error" id="error-${i}" role="status"></small>${
          input.remember
            ? `<label class="remember"><input type="checkbox" data-remember="${escapeHtml(
                input.key
              )}" ${
                input.remembered ? 'checked' : ''
              }>Remember this value</label>`
            : ''
        }</div>`
      );
  });
  return [...groups]
    .map(
      ([group, rows]) =>
        `<section class="input-group">${
          group ? `<h2>${escapeHtml(group)}</h2>` : ''
        }${rows.join('')}</section>`
    )
    .join('');
}

export function permissionSummary(permissions: string[]) {
  const descriptions: Record<string, string> = {
    privacy: 'Change privacy-related browser settings',
    nativeMessaging: 'Communicate with companion software on your computer',
    webNavigation: 'Observe your page navigation',
    storage: 'Save extension settings and data',
    contextMenus: 'Add actions to right-click menus',
    scripting: 'Run scripts on permitted websites',
    tabs: 'Read information about your open tabs',
    cookies: 'Read and change cookies on permitted websites',
    downloads: 'Manage downloads',
    clipboardRead: 'Read your clipboard',
    clipboardWrite: 'Write to your clipboard',
    notifications: 'Show notifications',
    history: 'Read and change browsing history',
    bookmarks: 'Read and change bookmarks',
    management: 'Manage other extensions',
    declarativeNetRequest: 'Filter network requests on permitted websites',
    declarativeNetRequestWithHostAccess:
      'Filter network requests on permitted websites',
    webRequest: 'Observe network requests on permitted websites',
    webRequestBlocking: 'Block or change network requests',
  };
  const lines = permissions
    .filter((permission) => permission !== 'declarativeContent')
    .map((permission) => {
      if (
        permission === '<all_urls>' ||
        permission === '*://*/*' ||
        permission === 'https://*/*' ||
        permission === 'http://*/*'
      )
        return 'Access website content across all websites';
      if (permission.includes('://'))
        return `Access website content on ${permission}`;
      return (
        descriptions[permission] ||
        `Use ${permission.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`
      );
    });
  return (
    [...new Set(lines)].map((line) => `• ${line}`).join('\n') ||
    'No additional permissions requested.'
  );
}

export function dialogDocument(options: BrowserDialogOptions, glass = false) {
  const buttons = options.buttons || ['OK'];
  const cancel = options.cancelId ?? 0;
  const primary = options.scope
    ? options.confirmLabel || 'Install extension'
    : buttons.find((_, index) => index !== cancel) || buttons[0];
  const primaryResponse = options.scope
    ? options.defaultId ?? 1
    : Math.max(
        0,
        buttons.findIndex((_, index) => index !== cancel)
      );
  const permissionLines = options.permissions
    ? permissionSummary(options.permissions)
        .split('\n')
        .map((line) => line.replace(/^• /, ''))
    : [];
  const permissionList = `<ul class="permission-list">${permissionLines
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('')}</ul>`;
  let permissions = '';
  if (options.permissions) {
    permissions =
      permissionLines.length > 5
        ? `<details class="permission-section"><summary>Requested permissions (${permissionLines.length})</summary>${permissionList}</details>`
        : `<section class="permission-section" aria-labelledby="permissions-title"><h2 id="permissions-title">Requested permissions</h2>${permissionList}</section>`;
  }
  let siteLabel = options.siteOrigin || '';
  try {
    const site = new URL(siteLabel);
    siteLabel = site.protocol === 'http:' ? `http://${site.host}` : site.host;
  } catch {
    // Preserve identities that are not URLs.
  }
  let initialFocus = buttons.length > 1 ? 'cancel' : 'confirm';
  if (options.scope) initialFocus = 'scope';
  if (options.inputs) initialFocus = 'input-0';
  if (options.savedPicker) initialFocus = 'saved-search';
  if (options.formReview) initialFocus = 'review-title';
  const review = options.importReview;
  const pageList = review
    ? `<h2>Pages (${
        review.pages.length
      })</h2><ul class="import-pages">${review.pages
        .map(
          (page) =>
            `<li><div><strong>${escapeHtml(
              page.name
            )}</strong><small>${escapeHtml(page.url)}</small></div>${
              page.hooks ? '<span class="hook-badge">Hooks</span>' : ''
            }</li>`
        )
        .join('')}</ul>`
    : '';
  const hookPreview = review?.hooks.length
    ? `<p class="import-note">Hooks stay disabled. Developer opens after import so you can review and enable them.</p><details class="hook-review"><summary>View all hooks (${
        review.hooks.length
      } ${
        review.hooks.length === 1 ? 'website' : 'websites'
      })</summary><div class="hook-sources">${review.hooks
        .map(
          (entry) =>
            `<section><h2>${escapeHtml(
              entry.origin
            )}</h2><pre tabindex="0">${escapeHtml(
              entry.source
            )}</pre></section>`
        )
        .join('')}</div></details>`
    : '';
  const importReview = review
    ? `<section class="import-review">${hookPreview}${pageList}</section>`
    : '';
  return `<!doctype html><html data-glass="${glass}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>
  ${browserDialogStyles}
  ${
    review
      ? `.import-review h2{font-size:13px;margin:0 0 10px;font-weight:600}.import-pages{list-style:none;margin:0 0 16px;padding:0}.import-pages li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid light-dark(#e5e5e7,#414144)}.import-pages li>div{min-width:0;flex:1}.import-pages strong{display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere}.import-pages small{display:block;font-size:12px;line-height:1.5;color:light-dark(#666,#bbb);overflow-wrap:anywhere;margin-top:3px}.hook-badge{font-size:11px;color:light-dark(#666,#bbb);flex-shrink:0}.import-note{font-size:12px;line-height:1.6}.hook-review summary{font-size:13px;font-weight:600;color:inherit}.hook-sources{display:flex;flex-direction:column;gap:16px;padding:12px 0}.hook-sources pre{padding:12px;border:1px solid light-dark(#ddd,#48484a);border-radius:8px;background:light-dark(#f0f0f2,#1d1d1f);max-height:260px;margin:0;line-height:1.6;color:inherit}p{color:light-dark(#666,#bbb)}`
      : ''
  }
  ${options.formReview ? formReviewStyles : ''}
  </style></head><body><header><div class="icon" aria-hidden="true"${
    options.icon ? '' : ' hidden'
  }><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${
    options.icon === 'location'
      ? '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'
      : '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>'
  }</svg></div><div class="heading"><div class="eyebrow"${
    options.siteOrigin || options.eyebrow ? '' : ' hidden'
  }>${
    options.eyebrow
      ? escapeHtml(options.eyebrow)
      : options.siteOrigin
      ? escapeHtml(siteLabel)
      : 'Kudium Browser'
  }</div><h1>${escapeHtml(
    options.message
  )}</h1></div></header><div class="content">${
    options.siteOrigin && !options.moreInformation
      ? `<div class="site"><small>Requesting website</small>${escapeHtml(
          options.siteOrigin
        )}</div>`
      : ''
  }${permissions}${
    options.detail && !options.moreInformation
      ? `<p>${escapeHtml(options.detail)}</p>`
      : ''
  }${
    options.moreInformation
      ? `<details><summary>More information</summary><p>${escapeHtml(
          options.siteOrigin || ''
        )} ${escapeHtml(options.detail || '')}</p><p>${escapeHtml(
          options.moreInformation
        )}</p></details>`
      : ''
  }${
    options.scope
      ? `<label for="scope">${escapeHtml(
          options.scopeLabel || 'Available in'
        )}</label><select id="scope">${options.scope
          .map(
            (scope) =>
              `<option value="${scope.response}" ${
                scope.response === primaryResponse ? 'selected' : ''
              }>${escapeHtml(scope.label)}</option>`
          )
          .join('')}</select>`
      : ''
  }${
    options.technicalDetail
      ? `<details><summary>${escapeHtml(
          options.technicalDetailLabel || 'Technical permissions'
        )}</summary><pre>${escapeHtml(options.technicalDetail)}</pre></details>`
      : ''
  }${options.inputs ? inputDocument(options.inputs) : ''}${
    options.formReview ? formReviewDocument(options.formReview) : ''
  }${importReview}</div><footer>${
    options.inputs?.some((input) => input.remembered)
      ? '<button type="button" class="forget-answers" id="forget-answers" aria-label="Clear remembered answers" title="Clear remembered answers"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6a5 5 0 1 1 0 4M3 2v4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Clear remembered</span></button>'
      : ''
  }${
    options.scope
      ? `${
          buttons.length > 1
            ? `<button id="cancel" data-response="${cancel}">${escapeHtml(
                buttons[cancel]
              )}</button>`
            : ''
        }<button class="primary" id="confirm">${escapeHtml(primary)}</button>`
      : buttons
          .map((label, index) => {
            const destructive =
              options.destructive &&
              index === buttons.length - 1 &&
              index !== cancel;
            const id =
              index === primaryResponse
                ? 'confirm'
                : index === cancel
                ? 'cancel'
                : `choice-${index}`;
            return `<button id="${id}" data-response="${index}"${
              index !== cancel
                ? ` class="primary${destructive ? ' destructive' : ''}"`
                : ''
            }>${escapeHtml(label)}</button>`;
          })
          .join('')
  }</footer><script>
  window.dialogResult=new Promise(resolve=>{window.finish=response=>{if(response!==${cancel}&&window.validateFormReview&&!window.validateFormReview())return;if(response!==${cancel}&&window.validateInputs&&!window.validateInputs())return;resolve(${
    options.formReview
      ? '{response, formReview: window.formReviewValue()}'
      : options.inputs
      ? "{response, inputValues: Object.fromEntries(Array.from(document.querySelectorAll('[data-input]'), input => [input.dataset.input, input.value])), remembered: Array.from(document.querySelectorAll('[data-remember]:checked'), input => input.dataset.remember), savedSources: Object.fromEntries(Array.from(document.querySelectorAll('[data-input][data-source]'), input => [input.dataset.input, input.dataset.source]))}"
      : 'response'
  })}});
  document.querySelectorAll('button[data-response]').forEach(button=>button.addEventListener('click',()=>window.finish(Number(button.dataset.response))));
  ${
    options.scope
      ? `document.getElementById('confirm').onclick=()=>window.finish(Number(document.getElementById('scope').value));`
      : ''
  }
  ${
    options.inputs
      ? `const errorFor=${hookInputError.toString()};
        const fields=${JSON.stringify(
          options.inputs.map(({ saved, savedHint, ...input }) =>
            input.choices
              ? {
                  ...input,
                  type: 'select',
                  options: input.choices,
                  required: true,
                }
              : input
          )
        ).replace(/</g, '\\u003c')};
        window.validateInputs=()=>{
          let first;
          fields.forEach((field,i)=>{const input=document.getElementById('input-'+i);const error=errorFor(field,input.value);document.getElementById('error-'+i).textContent=error;input.setAttribute('aria-invalid',String(!!error));if(error&&!first)first=input});
          if(first)first.focus();return !first;
        };
        document.querySelectorAll('[data-input]').forEach(input=>input.addEventListener('input',()=>{const i=fields.findIndex(field=>field.key===input.dataset.input);if(input.getAttribute('aria-invalid')==='true'){const error=errorFor(fields[i],input.value);document.getElementById('error-'+i).textContent=error;input.setAttribute('aria-invalid',String(!!error))}}));
        ${savedPickerScript(options.inputs)}
        document.getElementById('forget-answers')?.addEventListener('click',()=>{document.querySelectorAll('[data-remember]').forEach(input=>{input.checked=false});document.querySelectorAll('[data-was-remembered]').forEach(input=>{input.value='';delete input.dataset.source;const picker=document.querySelector('[data-saved-for="'+input.id+'"]');if(picker)picker.removeAttribute('data-selected')});document.getElementById('forget-answers').disabled=true;document.getElementById('input-0').focus()});`
      : ''
  }
  ${
    options.savedPicker
      ? savedPickerScript(
          [
            {
              key: 'saved',
              label: 'Saved value',
              saved: options.savedPicker.map((choice, i) => ({
                id: String(i),
                label: choice.label,
                value: '',
              })),
            },
          ],
          true
        )
      : ''
  }
  ${options.formReview ? formReviewScript(options.formReview) : ''}
  document.addEventListener('keydown',event=>{if(event.key==='Escape')window.finish(${cancel});if(event.key==='Enter'&&(event.target===document.body||(event.target.matches('[data-input]')&&event.target.tagName!=='TEXTAREA'&&event.target.tagName!=='SELECT')))document.getElementById('confirm').click()});
  document.getElementById('${initialFocus}')?.focus();
  document.querySelectorAll('details').forEach(section=>section.addEventListener('toggle',()=>{if(section.open)(section.classList.contains('hook-review') ? section.querySelector('summary') : section).scrollIntoView({block:section.classList.contains('hook-review')?'start':'nearest'})}));
  </script></body></html>`;
}

export async function showBrowserDialog(
  owner: BrowserWindow,
  options: BrowserDialogOptions
): Promise<{
  response: number;
  checkboxChecked: boolean;
  inputValues?: Record<string, string>;
  remembered?: string[];
  savedSources?: Record<string, string>;
  formReview?: FormReviewResult;
}> {
  options.signal?.throwIfAborted();
  const cancel = options.cancelId ?? 0;
  if (options.siteOrigin && !options.moreInformation) {
    let site = options.siteOrigin;
    try {
      const url = new URL(site);
      site = url.host;
      if (url.protocol === 'http:') site = `http://${site}`;
    } catch {
      // Keep the supplied identity visible if it is not a URL.
    }
    return dialog.showMessageBox(owner, {
      type: 'question',
      title: 'Website permission',
      signal: options.signal,
      message: options.message,
      detail: `${site} ${options.detail || 'is requesting access.'}`,
      buttons: options.buttons || ['Deny', 'Allow'],
      defaultId: options.defaultId ?? cancel,
      cancelId: cancel,
      noLink: true,
    });
  }
  const usesGlass = () =>
    process.platform === 'darwin' &&
    !nativeTheme.prefersReducedTransparency &&
    !nativeTheme.shouldUseHighContrastColors;
  const modal = new BrowserWindow({
    parent: owner,
    modal: true,
    width: options.importReview || options.formReview ? 540 : 440,
    useContentSize: true,
    height:
      options.importReview ||
      options.formReview ||
      options.scope ||
      options.savedPicker
        ? 510
        : 340,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: options.title || 'Kudium Browser',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin' && {
      vibrancy: usesGlass() ? ('sidebar' as const) : undefined,
      visualEffectState: 'followWindow' as const,
    }),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.platform === 'darwin') {
    const updateMaterial = () => {
      if (modal.isDestroyed()) return;
      modal.setVibrancy(usesGlass() ? 'sidebar' : null);
      void modal.webContents
        .executeJavaScript(
          `document.documentElement.dataset.glass = ${JSON.stringify(
            String(usesGlass())
          )}`
        )
        .catch(() => {});
    };
    nativeTheme.on('updated', updateMaterial);
    modal.once('closed', () =>
      nativeTheme.removeListener('updated', updateMaterial)
    );
  }
  modal.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  modal.webContents.on('will-navigate', (event) => event.preventDefault());
  return new Promise<{
    response: number;
    checkboxChecked: boolean;
    inputValues?: Record<string, string>;
    remembered?: string[];
    savedSources?: Record<string, string>;
    formReview?: FormReviewResult;
  }>((resolve) => {
    let finished = false;
    let cancelReview: (() => void) | undefined;
    const finish = (
      response: number,
      inputValues?: Record<string, string>,
      remembered?: string[],
      savedSources?: Record<string, string>,
      formReview?: FormReviewResult
    ) => {
      if (finished) return;
      finished = true;
      if (cancelReview)
        options.signal?.removeEventListener('abort', cancelReview);
      resolve({
        response,
        checkboxChecked: false,
        ...(formReview ? { formReview } : {}),
        ...(inputValues ? { inputValues, remembered, savedSources } : {}),
      });
      if (!modal.isDestroyed()) modal.destroy();
    };
    modal.on('closed', () => finish(cancel));
    cancelReview = () => finish(cancel);
    options.signal?.addEventListener('abort', cancelReview, { once: true });
    if (options.signal?.aborted) {
      finish(cancel);
      return;
    }
    modal
      .loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          dialogDocument(options, usesGlass())
        )}`
      )
      .then(async () => {
        if (modal.isDestroyed()) return null;
        // Let macOS establish the sheet's frame before measuring its content.
        modal.setOpacity(0);
        modal.show();
        await modal.webContents.executeJavaScript(
          'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'
        );
        if (modal.isDestroyed()) return null;
        const contentHeight = await modal.webContents.executeJavaScript(
          `(()=>{const body=getComputedStyle(document.body),header=document.querySelector('header'),footer=document.querySelector('footer'),content=document.querySelector('.content'),top=content.getBoundingClientRect().top;const contentHeight=Math.max(0,...Array.from(content.children,child=>child.getBoundingClientRect().bottom-top))+parseFloat(getComputedStyle(content).paddingBottom);return Math.ceil(parseFloat(body.paddingTop)+parseFloat(body.paddingBottom)+header.getBoundingClientRect().height+parseFloat(getComputedStyle(header).marginBottom)+contentHeight+parseFloat(getComputedStyle(footer).marginTop)+footer.getBoundingClientRect().height)})()`
        );
        if (modal.isDestroyed()) return null;
        // Native sheets include a frame inset; size the renderer's content explicitly.
        const frame = modal.getBounds();
        const content = modal.getContentBounds();
        modal.setSize(
          (options.importReview || options.formReview ? 540 : 440) +
            frame.width -
            content.width,
          Math.min(
            640,
            Math.max(options.moreInformation ? 260 : 180, contentHeight)
          ) +
            frame.height -
            content.height
        );
        modal.setOpacity(1);
        const result = await modal.webContents.executeJavaScript(
          'window.dialogResult'
        );
        const response =
          options.inputs || options.formReview ? result?.response : result;
        const formReview =
          options.formReview && response !== cancel
            ? validateFormReviewResult(result?.formReview, options.formReview)
            : undefined;
        let inputValues: Record<string, string> | undefined;
        if (options.inputs && response !== cancel) {
          const values = result?.inputValues;
          if (
            !values ||
            typeof values !== 'object' ||
            Array.isArray(values) ||
            Object.keys(values).length !== options.inputs.length ||
            options.inputs.some(
              (input) =>
                !Object.prototype.hasOwnProperty.call(values, input.key) ||
                typeof values[input.key] !== 'string' ||
                !!hookInputError(
                  input.choices
                    ? {
                        ...input,
                        type: 'select',
                        options: input.choices,
                        required: true,
                      }
                    : input,
                  values[input.key]
                ) ||
                (input.choices &&
                  !input.choices.some(
                    (choice) => choice.value === values[input.key]
                  ))
            )
          ) {
            finish(cancel);
            return null;
          }
          inputValues = Object.fromEntries(
            options.inputs.map((input) => [input.key, values[input.key]])
          );
        }
        const remembered =
          options.inputs && response !== cancel
            ? result?.remembered
            : undefined;
        const savedSources =
          options.inputs && response !== cancel
            ? result?.savedSources
            : undefined;
        if (
          options.inputs &&
          response !== cancel &&
          (!Array.isArray(remembered) ||
            new Set(remembered).size !== remembered.length ||
            remembered.some(
              (key) =>
                !options.inputs!.some(
                  (input) =>
                    input.key === key &&
                    input.remember &&
                    input.type !== 'password'
                )
            ) ||
            !savedSources ||
            typeof savedSources !== 'object' ||
            Array.isArray(savedSources) ||
            Object.entries(savedSources).some(
              ([key, id]) =>
                !options
                  .inputs!.find((input) => input.key === key)
                  ?.saved?.some((choice) => choice.id === id)
            ))
        ) {
          finish(cancel);
          return null;
        }
        finish(
          Number.isInteger(response) &&
            response >= 0 &&
            (options.savedPicker
              ? response === cancel || response <= options.savedPicker.length
              : options.scope
              ? response === cancel ||
                options.scope.some((choice) => choice.response === response)
              : response < (options.buttons?.length || 1))
            ? response
            : cancel,
          inputValues,
          remembered,
          savedSources,
          formReview
        );
        return null;
      })
      .catch(() => finish(cancel));
  });
}

export function websitePermissionDialog(
  origin: string,
  permission: string
): BrowserDialogOptions {
  const descriptions: Record<string, [string, string]> = {
    geolocation: [
      'Share your location?',
      'wants to use your current location.',
    ],
    notifications: ['Allow notifications?', 'wants to send you notifications.'],
    media: [
      'Allow camera or microphone access?',
      'wants to use your camera or microphone.',
    ],
    clipboardRead: ['Allow clipboard access?', 'wants to read your clipboard.'],
    fullscreen: ['Enter full screen?', 'wants to enter full screen.'],
  };
  const [message, detail] = descriptions[permission] || [
    'Allow website access?',
    `wants to use ${permission
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/-/g, ' ')
      .toLowerCase()}.`,
  ];
  return {
    type: 'question',
    message,
    detail,
    moreInformation:
      'Allow access only if you trust this website. Choose Deny to continue without granting this permission.',
    siteOrigin: origin,
    icon: permission === 'geolocation' ? 'location' : 'shield',
    buttons: ['Deny', 'Allow'],
    defaultId: 0,
    cancelId: 0,
  };
}
