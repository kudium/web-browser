import { BrowserWindow, MessageBoxOptions, dialog } from 'electron';
import { browserDialogStyles } from './browserDialogStyles';

export interface BrowserDialogOptions extends MessageBoxOptions {
  destructive?: boolean;
  importReview?: {
    pages: { name: string; url: string; hooks: boolean }[];
    hooks: { origin: string; source: string }[];
  };
  scope?: { label: string; response: number }[];
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

export function dialogDocument(options: BrowserDialogOptions) {
  const buttons = options.buttons || ['OK'];
  const cancel = options.cancelId ?? 0;
  const primary = options.scope
    ? 'Install extension'
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>
  ${browserDialogStyles}
  ${
    review
      ? `.import-review h2{font-size:13px;margin:0 0 10px;font-weight:600}.import-pages{list-style:none;margin:0 0 16px;padding:0}.import-pages li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid light-dark(#e5e5e7,#414144)}.import-pages li>div{min-width:0;flex:1}.import-pages strong{display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere}.import-pages small{display:block;font-size:12px;line-height:1.5;color:light-dark(#666,#bbb);overflow-wrap:anywhere;margin-top:3px}.hook-badge{font-size:11px;color:light-dark(#666,#bbb);flex-shrink:0}.import-note{font-size:12px;line-height:1.6}.hook-review summary{font-size:13px;font-weight:600;color:inherit}.hook-sources{display:flex;flex-direction:column;gap:16px;padding:12px 0}.hook-sources pre{padding:12px;border:1px solid light-dark(#ddd,#48484a);border-radius:8px;background:light-dark(#f0f0f2,#1d1d1f);max-height:260px;margin:0;line-height:1.6;color:inherit}p{color:light-dark(#666,#bbb)}`
      : ''
  }
  </style></head><body><header><div class="icon" aria-hidden="true"${
    options.icon ? '' : ' hidden'
  }><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${
    options.icon === 'location'
      ? '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'
      : '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>'
  }</svg></div><div class="heading"><div class="eyebrow"${
    options.siteOrigin ? '' : ' hidden'
  }>${
    options.siteOrigin ? escapeHtml(siteLabel) : 'Kudium Browser'
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
      ? `<label for="scope">Available in</label><select id="scope">${options.scope
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
  }${importReview}</div><footer>${
    buttons.length > 1
      ? `<button id="cancel">${escapeHtml(buttons[cancel])}</button>`
      : ''
  }<button class="primary${
    options.destructive ? ' destructive' : ''
  }" id="confirm">${escapeHtml(primary)}</button></footer><script>
  window.dialogResult=new Promise(resolve=>{window.finish=resolve});
  document.getElementById('confirm').onclick=()=>window.finish(Number(document.getElementById('scope')?.value??${primaryResponse}));
  document.getElementById('cancel')?.addEventListener('click',()=>window.finish(${cancel}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')window.finish(${cancel});if(event.key==='Enter'&&event.target===document.body)document.getElementById('confirm').click()});
  document.getElementById('${initialFocus}')?.focus();
  document.querySelectorAll('details').forEach(section=>section.addEventListener('toggle',()=>{if(section.open)(section.classList.contains('hook-review') ? section.querySelector('summary') : section).scrollIntoView({block:section.classList.contains('hook-review')?'start':'nearest'})}));
  </script></body></html>`;
}

export async function showBrowserDialog(
  owner: BrowserWindow,
  options: BrowserDialogOptions
) {
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
  const modal = new BrowserWindow({
    parent: owner,
    modal: true,
    width: options.importReview ? 540 : 440,
    useContentSize: true,
    height: options.importReview || options.scope ? 510 : 340,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: options.title || 'Kudium Browser',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#242426',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  modal.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  modal.webContents.on('will-navigate', (event) => event.preventDefault());
  return new Promise<{ response: number; checkboxChecked: boolean }>(
    (resolve) => {
      let finished = false;
      let cancelReview: (() => void) | undefined;
      const finish = (response: number) => {
        if (finished) return;
        finished = true;
        if (cancelReview)
          options.signal?.removeEventListener('abort', cancelReview);
        resolve({ response, checkboxChecked: false });
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
            dialogDocument(options)
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
            (options.importReview ? 540 : 440) + frame.width - content.width,
            Math.min(
              640,
              Math.max(options.moreInformation ? 260 : 180, contentHeight)
            ) +
              frame.height -
              content.height
          );
          modal.setOpacity(1);
          const response = await modal.webContents.executeJavaScript(
            'window.dialogResult'
          );
          finish(
            Number.isInteger(response) &&
              response >= 0 &&
              response < (options.buttons?.length || 1)
              ? response
              : cancel
          );
          return null;
        })
        .catch(() => finish(cancel));
    }
  );
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
