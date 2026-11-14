import type { VaultField } from './passwordManager';

/** Runs only in the isolated page preload; no bridge is exposed to the website. */
export function installPersonalDataAutofill(
  bridge: { invoke: (channel: string, input?: any) => Promise<any>; on: (channel: string, callback: (_event: unknown, enabled: boolean) => void) => void },
  match: (name: string, aliases: string[], target: any) => number
) {
  let enabled = false;
  let paused = false;
  let disposed = false;
  let target: HTMLInputElement | HTMLTextAreaElement | null = null;
  let host: HTMLDivElement | null = null;
  let root: ShadowRoot | null = null;
  let generation = 0;
  let placement: { side: 'left' | 'right'; x: number; y: number } = { side: 'right', x: -30, y: -13 };
  let movedPlacement = false;
  let dragging = false;
  let suppressClick = false;
  let loginPrompt = false;
  let authenticating = false;
  const usable = (element: Element | null): element is HTMLInputElement | HTMLTextAreaElement =>
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    !element.disabled && !element.readOnly && element.getClientRects().length > 0 &&
    !['hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'search'].includes(element.type);
  const descriptor = (input: HTMLInputElement | HTMLTextAreaElement) => ({
    name: input.name, id: input.id, type: input.type, autocomplete: input.autocomplete,
    placeholder: input.placeholder,
    label: input.getAttribute('aria-label') || (input.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ') || Array.from(input.labels || []).map((label) => label.textContent || '').join(' '),
  });
  const recognized = (input: HTMLInputElement | HTMLTextAreaElement) =>
    input.type === 'password' || match('username', [], descriptor(input)) > 0 || ['name', 'given-name', 'family-name', 'email', 'tel', 'street-address', 'address-line1', 'address-line2', 'address-level1', 'address-level2', 'postal-code', 'country', 'organization'].some((name) => match(name, [], descriptor(input)) > 0);
  const close = () => { loginPrompt = false; dragging = false; generation++; host?.remove(); host = null; root = null; };
  const position = () => {
    if (!host || !target) return;
    const rect = target.getBoundingClientRect();
    host.style.left = `${Math.max(8, Math.min((placement.side === 'left' ? rect.left : rect.right) + placement.x, innerWidth - 68))}px`;
    host.style.top = `${Math.max(8, Math.min(rect.top + rect.height / 2 + placement.y, innerHeight - 34))}px`;
  };
  const write = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    if (!usable(input) || !input.isConnected) return;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const button = (label: string, run: () => void) => {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = label;
    element.addEventListener('click', (event) => { if (event.isTrusted) run(); });
    return element;
  };
  const notice = (text: string, tone: 'neutral' | 'success' | 'error' = 'neutral') => {
    const element = document.createElement('div'); element.className = `message message-${tone}`;
    element.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    element.textContent = text;
    return element;
  };
  const confirmUpdate = (panel: HTMLElement) => new Promise<boolean>((resolve) => {
    const prompt = document.createElement('div'); prompt.className = 'update-confirmation';
    prompt.append(notice('Matching fields already exist for this website. Update them with the new values?'));
    const finish = (answer: boolean) => { prompt.remove(); resolve(answer); };
    const update = button('Update existing data', () => finish(true));
    prompt.append(update, button('Cancel', () => finish(false))); panel.append(prompt); update.focus();
  });
  const panelStyles = `:host{color-scheme:light dark;font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:light-dark(#202124,#eee)}button{font:inherit;color:inherit;cursor:pointer;border:0;border-radius:7px;background:transparent;padding:8px;text-align:left}button:hover,button:focus-visible{background:light-dark(#0000000c,#ffffff15)}.autofill-control{display:inline-flex;align-items:center;padding:1px;border-radius:8px;background:light-dark(#f0f1f3f2,#34363af2);backdrop-filter:blur(16px);box-shadow:0 1px 4px #0002;outline:1px solid light-dark(#00000012,#ffffff12)}.autofill-control button{display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:6px;flex-shrink:0}.autofill-control svg{display:block;width:15px;height:15px}.trigger{touch-action:none;user-select:none;cursor:grab}.panel{position:fixed;box-sizing:border-box;width:min(290px,calc(100vw - 16px));max-height:min(320px,calc(100dvh - 16px));overflow:auto;overflow-x:hidden;padding:6px;border:1px solid light-dark(#0002,#fff2);border-radius:12px;background:light-dark(#fffffff0,#25262af2);backdrop-filter:blur(20px);box-shadow:0 8px 30px #0003}.panel button{box-sizing:border-box;line-height:1.45;white-space:normal;display:block;width:100%;overflow-wrap:anywhere}.panel .header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 2px 6px 8px;font-weight:600}.panel .header>span{min-width:0;overflow-wrap:anywhere;line-height:1.4}.panel .header-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}.panel .close{display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;flex-shrink:0}.panel .header-actions svg{display:block;width:16px;height:16px;flex:0 0 16px;stroke-width:1.8}.loading{display:flex;align-items:center;gap:8px;padding:12px 8px;min-height:24px;line-height:1.45;color:light-dark(#666,#bbb);overflow-wrap:anywhere}.loading span{min-width:0}.spinner{box-sizing:border-box;width:14px;height:14px;flex:0 0 14px;border:1.5px solid light-dark(#0002,#fff3);border-top-color:currentColor;border-radius:50%;animation:autofill-spin .8s linear infinite}@keyframes autofill-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}.saved-confirmation{display:flex;align-items:flex-start;gap:8px;padding:10px 8px 8px;line-height:1.45;overflow-wrap:anywhere}.saved-confirmation svg{flex:0 0 16px;margin-top:1px;color:light-dark(#268344,#75cf94)}.saved-confirmation span{min-width:0}.confirmation-actions{display:flex;justify-content:flex-end;padding:0 4px 4px}.panel .confirmation-actions button{width:auto;padding:6px 10px}.message{box-sizing:border-box;padding:10px 8px;line-height:1.5;white-space:normal;overflow-wrap:anywhere;min-width:0;color:light-dark(#666,#bbb)}.message-success{color:light-dark(#268344,#75cf94)}.message-error{color:light-dark(#b42318,#ffb4ab)}.heading{padding:6px 8px;line-height:1.4;overflow-wrap:anywhere;color:light-dark(#666,#bbb)}.quick-fill{position:relative;margin-left:1px}.quick-fill::before{content:"";position:absolute;left:-1px;top:6px;bottom:6px;width:1px;background:light-dark(#00000018,#ffffff20)}.heading{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.heading>span{min-width:0;flex:1;overflow-wrap:anywhere}.panel .heading .fill-form{width:auto;flex-shrink:0;padding:4px 6px;font-size:11px;color:light-dark(#202124,#eee)}.saved-search{box-sizing:border-box;width:100%;margin:4px 0;padding:8px;border:1px solid light-dark(#0002,#fff2);border-radius:7px;background:transparent;color:inherit;font:inherit}.value{display:block;font-size:11px;opacity:.7;margin-top:2px}`;
  const show = (input: HTMLInputElement | HTMLTextAreaElement) => {
    close(); suppressClick = false; target = input;
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:2147483647;width:56px;height:26px';
    // The picker lives outside the site's modal. Keep its interactions from
    // reaching bubbling outside-click handlers on the page or document.
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchend']) {
      host.addEventListener(type, (event) => { event.stopPropagation(); if (type === 'mousedown' && !(event.composedPath()[0] instanceof HTMLInputElement)) event.preventDefault(); });
    }

    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = panelStyles;
    root.append(style);
    const openPicker = async (quick = false) => {
      if (!enabled || paused || disposed || !input.isConnected) return;
      if (root?.querySelector('.panel')) { root.querySelector<HTMLButtonElement>('.panel button')?.focus(); return; }
      const current = generation;
      const panel = document.createElement('div'); panel.className = 'panel';
      const rect = input.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 298))}px`;
      panel.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - 328))}px`;
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Personal Data');
      const content = document.createElement('div');
      const loading = document.createElement('div'); loading.className = 'loading';
      loading.setAttribute('role', 'status');
      const spinner = document.createElement('div'); spinner.className = 'spinner'; spinner.setAttribute('aria-hidden', 'true');
      const loadingLabel = document.createElement('span'); loadingLabel.textContent = 'Loading Personal Data…';
      loading.append(spinner, loadingLabel); content.append(loading);
      const header = document.createElement('div'); header.className = 'header';
      const title = document.createElement('span'); title.textContent = 'Personal Data';
      const dismiss = button('Close', () => {
        if (panel.querySelector('.dismissal')) { paused = true; close(); return; }
        panel.querySelector('.save-feedback')?.remove();
        content.hidden = true;
        const choices = document.createElement('div'); choices.className = 'dismissal';
        const message = notice('Hide autofill until this page reloads, or disable it for this website?');
        choices.append(message, button('Hide for now', () => { paused = true; close(); }), button('Disable for this website', async () => {
          try { await bridge.invoke('personal-data-autofill-disable-site'); paused = true; close(); }
          catch { if (generation === current) { message.textContent = 'Unable to update website preference. Try again.'; message.className = 'message message-error'; message.setAttribute('role', 'alert'); } }
        }), button('Cancel', () => { choices.remove(); content.hidden = false; dismiss.focus(); }));
        panel.append(choices); choices.querySelector('button')?.focus();
      });
      dismiss.className = 'close'; dismiss.setAttribute('aria-label', 'Close Personal Data'); dismiss.title = 'Close';
      dismiss.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20"/></svg>';
      const save = button('Save input for this website', async () => {
        if (!input.value || save.disabled) return;
        const info = descriptor(input);
        const name = (input.autocomplete && !['off', 'on', 'new-password', 'current-password'].includes(input.autocomplete) ? input.autocomplete : info.label || info.name || info.id || (input.type === 'password' ? 'Password' : input.type)).slice(0, 200);
        const aliases = Array.from(new Set([info.name, info.id, info.label].filter(Boolean))).map((alias) => alias.slice(0, 200));
        save.disabled = true;
        save.setAttribute('aria-busy', 'true');
        try {
          const payload = { name, aliases, value: input.value, secret: input.type === 'password' };
          let result = await bridge.invoke('personal-data-autofill-save-field', payload);
          if (generation !== current) return;
          if (result?.needsUpdate) {
            content.hidden = true;
            const confirmed = await confirmUpdate(panel);
            if (generation !== current) return;
            content.hidden = false;
            if (!confirmed) return;
            result = await bridge.invoke('personal-data-autofill-save-field', { ...payload, confirmUpdate: true });
          }
          if (generation !== current) return;
          panel.querySelector('.dismissal')?.remove();
          panel.querySelector('.save-feedback')?.remove();
          content.hidden = true;
          const feedback = document.createElement('div'); feedback.className = 'save-feedback';
          const confirmation = document.createElement('div'); confirmation.className = 'saved-confirmation';
          confirmation.setAttribute('role', 'status');
          confirmation.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';
          const message = document.createElement('span'); message.textContent = result?.updated ? 'Website data updated.' : 'Input saved for this website.'; confirmation.append(message);
          const actions = document.createElement('div'); actions.className = 'confirmation-actions';
          const back = button('Back', () => { feedback.remove(); content.hidden = false; save.focus(); });
          actions.append(back); feedback.append(confirmation, actions); panel.append(feedback); back.focus();
        } catch { if (generation === current) { content.hidden = false; content.append(notice('Unable to save. Unlock Personal Data and try again.', 'error')); } }
        finally { save.disabled = !input.value; save.removeAttribute('aria-busy'); }
      });
      save.className = 'close'; save.setAttribute('aria-label', 'Save input for this website'); save.title = 'Save input for this website'; save.disabled = !input.value;
      save.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8V3"/></svg>';
      const manage = button('Manage Personal Data', async () => {
        try { await bridge.invoke('personal-data-autofill-manage'); if (generation === current) close(); }
        catch { if (generation === current) { content.hidden = false; content.append(notice('Unable to open Personal Data.', 'error')); } }
      });
      manage.className = 'close'; manage.setAttribute('aria-label', 'Manage Personal Data'); manage.title = 'Manage Personal Data';
      manage.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h3m6 0h9M3 17h9m6 0h3"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg>';
      const headerActions = document.createElement('div'); headerActions.className = 'header-actions'; headerActions.append(save, manage, dismiss);
      header.append(title, headerActions); panel.append(header, content); root?.append(panel);
      const addActions = () => {
        if (input.type === 'password') content.append(button('Generate strong password', () => {
          const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
          const random = new Uint32Array(1);
          const limit = Math.floor(0x100000000 / alphabet.length) * alphabet.length;
          const length = Math.min(input.maxLength > 0 ? input.maxLength : 128, Math.max(20, input.minLength));
          if (length < 12 || length > 128) { content.append(notice('This field’s password length requirements need a custom password.', 'error')); return; }
          let password = '';
          do {
            password = '';
            while (password.length < length) {
              crypto.getRandomValues(random);
              if (random[0] < limit) password += alphabet[random[0] % alphabet.length];
            }
          } while (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%*_-]/.test(password));
          write(input, password); save.disabled = !input.value;
          if (input.autocomplete === 'new-password' && input.form) {
            const confirmations = Array.from(input.form.querySelectorAll<HTMLInputElement>('input[type=password]')).filter((field) => field !== input && usable(field) &&
              (field.autocomplete === 'new-password' || /confirm|repeat/i.test(field.name + field.id + descriptor(field).label)));
            for (const field of confirmations) write(field, password);
          }
          content.replaceChildren(notice('Strong password filled. Save it to Personal Data?', 'neutral'));
          content.append(button('Save password', async () => {
            const users = input.form ? Array.from(input.form.querySelectorAll<HTMLInputElement>('input')).filter((field) =>
              usable(field) && (field.type === 'email' || field.autocomplete === 'username' || field.autocomplete === 'email')) : [];
            try {
              const payload = { password, username: users.length === 1 ? users[0].value : '' };
              let result = await bridge.invoke('personal-data-autofill-save-password', payload);
              if (generation !== current) return;
              if (result?.needsUpdate) {
                if (!await confirmUpdate(panel) || generation !== current) return;
                result = await bridge.invoke('personal-data-autofill-save-password', { ...payload, confirmUpdate: true });
              }
              password = '';
              if (generation !== current) return;
              content.replaceChildren(notice(result?.updated ? 'Website data updated.' : 'Password saved.', 'success'));
            } catch { if (generation === current) content.append(notice('Unable to save. Unlock Personal Data and try again.', 'error')); }
          }));
        }));
      };

      type FillRecord = { id: string; kind: string; website?: boolean; selected?: boolean; username?: string; title: string; fields: (VaultField & { fieldIndex?: number })[] };
      const fillForm = async (record: FillRecord) => {
        if (!input.form) return;
        if (record.kind === 'login') {
          try {
            const result = await bridge.invoke('personal-data-autofill-login', record.id);
            if (generation !== current) return;
            if (result.filled) { close(); input.focus(); }
            else content.append(notice('No matching login fields.', 'error'));
          } catch { if (generation === current) content.append(notice('Unlock Personal Data to fill this login.', 'error')); }
          return;
        }
      const form = input.form!;
      const controls = Array.from(form.elements).filter(usable);
      const values: { control: HTMLInputElement | HTMLTextAreaElement; value: string }[] = [];
      const secrets = new Map<number, string>();
      try {
        for (const control of controls) {
          const info = descriptor(control);
          const candidates = record.fields.map((field) => ({ field, score:
            match(field.name, field.aliases || [], info) || (control.type === 'password'
              ? match(field.name, field.aliases || [], { ...info, autocomplete: 'current-password' }) : 0) }));
          const best = Math.max(0, ...candidates.map((entry) => entry.score));
          const winners = candidates.filter((entry) => entry.score === best && best > 0);
          if (winners.length !== 1) continue;
          const field = winners[0].field;
          let value = field.value;
          if (field.secret) {
            if (field.fieldIndex === undefined) continue;
            if (!secrets.has(field.fieldIndex)) secrets.set(field.fieldIndex,
              await bridge.invoke('personal-data-autofill-secret', { id: record.id, fieldIndex: field.fieldIndex }));
            value = secrets.get(field.fieldIndex)!;
          }
          values.push({ control, value });
        }
        if (!enabled || generation !== current || !input.isConnected || input.form !== form) return;
        for (const { control, value } of values) {
          if (usable(control) && control.form === form) write(control, value);
        }
        void bridge.invoke('personal-data-login-identity', { id: record.id }).catch(() => {});
        close(); input.focus();
      } catch { if (generation === current) content.append(notice('Unable to fill this form. Unlock Personal Data and try again.', 'error')); }
      };
      let watchdog: ReturnType<typeof setInterval> | undefined;
      try {
        const started = Date.now();
        let last = started;
        let loadingTime = 0;
        const timeout = new Promise<never>((_resolve, reject) => {
          watchdog = setInterval(() => {
            const now = Date.now();
            if (!authenticating) loadingTime += now - last;
            last = now;
            if (generation !== current || !input.isConnected) {
              if (generation === current) close();
              reject(new Error('Autofill target changed.'));
            } else if (loadingTime >= 15000 || now - started >= 130000) {
              reject(new Error('Personal Data request timed out.'));
            }
          }, 250);
        });
        const records: FillRecord[] = await Promise.race([bridge.invoke('personal-data-autofill-records'), timeout]);
        if (!enabled || generation !== current) return;
        if (!input.isConnected) { close(); return; }
        content.textContent = '';
        const browse = () => {
          const previousTitle = title.textContent;
          const previousContent = Array.from(content.childNodes);
          title.textContent = 'Saved data';
          const back = button('Back to suggestions', () => {
            title.textContent = previousTitle; content.replaceChildren(...previousContent);
            content.querySelector<HTMLButtonElement>('button')?.focus();
          });
          const search = document.createElement('input'); search.type = 'search'; search.className = 'saved-search';
          search.placeholder = 'Search saved data'; search.setAttribute('aria-label', 'Search saved data');
          const results = document.createElement('div');
          const render = () => {
            results.replaceChildren();
            const query = search.value.trim().toLocaleLowerCase();
            for (const record of records) {
              const fields = record.fields.filter((field) => !field.secret && field.value &&
                [record.title, field.name, ...(field.aliases || []), field.value].join(' ').toLocaleLowerCase().includes(query));
              if (!fields.length) continue;
              const heading = document.createElement('div'); heading.className = 'heading'; heading.textContent = record.title; results.append(heading);
              for (const field of fields) {
                const entry = button(field.name, () => {
                  if (!enabled || generation !== current || !input.isConnected) return;
                  write(input, field.value); close(); input.focus();
                });
                const value = document.createElement('span'); value.className = 'value'; value.textContent = field.value; entry.append(value);
                entry.setAttribute('aria-label', `Fill ${field.name}: ${field.value}`); results.append(entry);
              }
            }
            if (!results.childNodes.length) results.append(notice(query ? 'No saved data matches your search.' : 'No saved values available for this website.'));
          };
          search.addEventListener('input', render);
          content.replaceChildren(back, search, results); render(); search.focus();
        };
        const addBrowse = () => { if (input.type !== 'password') content.append(button('Browse saved data', browse)); };
        if (quick && input.form) {
          const controls = Array.from(input.form.elements).filter(usable);
          const matching = records.filter((record) => (record.kind === 'login' && controls.some((control) => control.type === 'password' && control.autocomplete !== 'new-password')) || record.fields.some((field) =>
            controls.some((control) => match(field.name, field.aliases || [], descriptor(control)) > 0)));
          const website = matching.filter((record) => record.website);
          const selected = matching.filter((record) => record.selected);
          const choices = selected.length ? selected : website.length ? website : matching;
          if (choices.length === 1) { await fillForm(choices[0]); return; }
          title.textContent = 'Fill form';
          if (!choices.length) content.append(notice('No suggested matches for this field.'));
          for (const record of choices) content.append(button(record.title, () => { void fillForm(record); }));
          addBrowse();
          (content.querySelector('button') || dismiss).focus();
          return;
        }
        addActions();
        for (const record of records) {
          if (input.type === 'password') {
            const secrets = record.fields.filter((field) => field.secret && field.fieldIndex !== undefined);
            if (secrets.length) {
              const heading = document.createElement('div'); heading.className = 'heading'; const name = document.createElement('span'); name.textContent = record.title; heading.append(name); content.append(heading);
              for (const field of secrets) content.append(button(`Fill ${field.name}`, async () => {
                try {
                  const value = await bridge.invoke('personal-data-autofill-secret', { id: record.id, fieldIndex: field.fieldIndex });
                  if (!enabled || generation !== current || !input.isConnected) return;
                  write(input, value); close(); input.focus();
                } catch { if (generation === current) content.append(notice('Unable to fill this secret. Unlock Personal Data and try again.', 'error')); }
              }));
            }
          }
          if (record.kind === 'login') {
            if (input.type !== 'password' && record.username && (match('username', [], descriptor(input)) > 0 || match('email', [], descriptor(input)) > 0)) {
              content.append(button(`${record.title} · ${record.username}`, () => {
                void bridge.invoke('personal-data-login-identity', { id: record.id }).catch(() => {});
                write(input, record.username!); close(); input.focus();
              }));
            }
            if (input.type === 'password' && input.autocomplete !== 'new-password') {
              content.append(button(`${record.title} · ${record.username || 'Saved login'}`, async () => {
                try {
                  const result = await bridge.invoke('personal-data-autofill-login', record.id);
                  if (generation !== current) return;
                  if (result.filled) { close(); input.focus(); }
                  else content.append(notice('No matching login fields.', 'error'));
                } catch { if (generation === current) content.append(notice('Unlock Personal Data to fill this login.', 'error')); }
              }));
            }
            continue;
          }
          if (input.type === 'password') continue;
          const matches = record.fields.filter((field) => !field.secret).map((field) => ({ field, score: match(field.name, field.aliases || [], descriptor(input)) })).filter((entry) => entry.score > 0);
          if (!matches.length) continue;
          const heading = document.createElement('div'); heading.className = 'heading'; const name = document.createElement('span'); name.textContent = record.title; heading.append(name); content.append(heading);
          for (const { field } of matches) {
            const entry = button(field.value, () => {
              if (match('username', [], descriptor(input)) > 0 || match('email', [], descriptor(input)) > 0)
                void bridge.invoke('personal-data-login-identity', { id: record.id }).catch(() => {});
              write(input, field.value); close(); input.focus();
            });
            entry.setAttribute('aria-label', `Fill ${field.name}: ${field.value}`); content.append(entry);
          }
          if (input.form) {
            const fill = button('Fill this form', () => { void fillForm(record); });
            fill.className = 'fill-form'; heading.append(fill);
          }
        }
        if (!content.childNodes.length && input.type !== 'password') content.replaceChildren(notice('No suggested matches for this field.', 'neutral'));
        addBrowse();
        if (!content.hidden) (content.querySelector('button') || dismiss).focus();
      } catch (error) {
        if (generation !== current) return;
        const retry = button('Retry', () => {
          panel.remove(); generation++; void openPicker(quick);
        });
        content.replaceChildren(notice(error instanceof Error && error.message === 'Personal Data request timed out.'
          ? 'Personal Data took too long to respond. Try again.'
          : 'Personal Data is unavailable. Enable or unlock it in Preferences.', 'error'), retry);
        addActions();
        if (!content.hidden) retry.focus();
      } finally { if (watchdog !== undefined) clearInterval(watchdog); }
    };
    const trigger = button('▤', () => { if (suppressClick) { suppressClick = false; return; } void openPicker(); });
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
    trigger.addEventListener('pointerdown', (event) => {
      if (!event.isTrusted || event.button !== 0 || !host) return;
      event.preventDefault(); suppressClick = false;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: parseFloat(host.style.left), top: parseFloat(host.style.top) };
      trigger.setPointerCapture(event.pointerId);
    });
    trigger.addEventListener('pointermove', (event) => {
      if (!event.isTrusted || !drag || event.pointerId !== drag.id || !host) return;
      const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
      if (!dragging && Math.hypot(dx, dy) < 4) return;
      if (!dragging) generation++;
      dragging = true; suppressClick = true; trigger.style.cursor = 'grabbing';
      root?.querySelector('.panel')?.remove();
      const rect = input.getBoundingClientRect();
      const left = Math.max(8, Math.min(innerWidth - 34, Math.max(rect.left - 64, Math.min(rect.right + 38, drag.left + dx))));
      const top = Math.max(8, Math.min(innerHeight - 34, Math.max(rect.top - 64, Math.min(rect.bottom + 38, drag.top + dy))));
      const side = left + 13 < rect.left + rect.width / 2 ? 'left' : 'right';
      placement = { side, x: Math.max(-128, Math.min(128, left - (side === 'left' ? rect.left : rect.right))), y: Math.max(-128, Math.min(128, top - (rect.top + rect.height / 2))) };
      movedPlacement = true; position();
    });
    const finishDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = dragging; drag = null; dragging = false; trigger.style.cursor = '';
      if (trigger.hasPointerCapture(event.pointerId)) trigger.releasePointerCapture(event.pointerId);
      if (moved) void bridge.invoke('personal-data-autofill-position', placement).catch(() => {});
    };
    trigger.addEventListener('pointerup', finishDrag);
    trigger.addEventListener('pointercancel', finishDrag);
    trigger.addEventListener('lostpointercapture', finishDrag);
    trigger.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="10" r="2"/><path d="M5 16c0-3 6-3 6 0M14 9h4m-4 4h4m-4 4h3"/></svg>';
    trigger.className = 'trigger'; trigger.setAttribute('aria-label', 'Fill from Personal Data'); trigger.title = 'Fill from Personal Data · Drag to reposition';
    const control = document.createElement('div'); control.className = 'autofill-control';
    control.setAttribute('role', 'group'); control.setAttribute('aria-label', 'Personal Data autofill');
    control.append(trigger); root.append(control);
    if (input.form) {
      const quick = button('Fill this form', () => { void openPicker(true); });
      quick.className = 'quick-fill'; quick.title = 'Fill this form'; quick.setAttribute('aria-label', 'Fill this form');
      quick.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z"/></svg>';
      control.append(quick);
    }
    (input.closest('dialog,[role=dialog],[aria-modal=true]') || document.documentElement).append(host); position();
  };
  let checkingLogin = false;
  let loginSuggested = false;
  let submittedHere = false;
  let loginGoneSince = 0;
  let loginAttempt = 0;
  const checkLogin = async () => {
    if (!enabled || paused || disposed || checkingLogin || loginSuggested) return;
    const blocked = () => {
      const visible = (element: Element) => element.getClientRects().length > 0;
      return document.readyState === 'loading' ||
        Array.from(document.querySelectorAll('input[type=password]')).some(usable) ||
        Array.from(document.querySelectorAll('input')).some((element) => usable(element) &&
          /one-time-code|otp|verification|security.?code|two.?factor/i.test([element.autocomplete, element.name, element.id, element.getAttribute('aria-label')].join(' '))) ||
        Array.from(document.querySelectorAll('[aria-busy=true],[role=progressbar]')).some(visible) ||
        Array.from(document.querySelectorAll('[role=alert],[aria-live=assertive]')).some((element) =>
          visible(element) && /invalid|incorrect|failed|error|try again|verify|verification|authenticate/i.test(element.textContent || ''));
    };
    const signedIn = Array.from(document.querySelectorAll('a,button,[role=button]')).some((element) =>
      element.getClientRects().length > 0 && /\b(sign[ -]?out|log[ -]?out)\b/i.test([element.textContent, element.getAttribute('aria-label'), element.getAttribute('title')].filter(Boolean).join(' ')));
    if (blocked()) { loginGoneSince = 0; return; }
    if (!loginGoneSince) loginGoneSince = Date.now();
    // Explicit signed-in UI can respond quickly; disappearance alone needs more settling.
    const settled = Date.now() - loginGoneSince >= (signedIn ? 250 : 1000);
    const attempt = loginAttempt;
    checkingLogin = true;
    try {
      const pending = await bridge.invoke('personal-data-login-pending');
      if (!(pending === true || pending?.pending) || !enabled || paused || disposed || attempt !== loginAttempt) return;
      if (!settled || (!signedIn && !submittedHere && !pending?.navigated)) return;
      // Recheck after IPC: the page may have rendered a failed-login form.
      if (blocked()) { loginGoneSince = 0; return; }
      loginSuggested = true; close(); loginPrompt = true; target = null;
      host = document.createElement('div'); host.style.cssText = 'position:fixed;z-index:2147483647';
      root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style'); style.textContent = panelStyles; root.append(style);
      const panel = document.createElement('div'); panel.className = 'panel';
      panel.style.top = '12px'; panel.style.right = '12px';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Save website login');
      const header = document.createElement('div'); header.className = 'header';
      const title = document.createElement('span'); title.textContent = 'Save login?';
      const dismiss = async () => { close(); await bridge.invoke('personal-data-login-dismiss').catch(() => {}); };
      const x = button('Close', dismiss); x.className = 'close'; x.title = 'Close'; x.setAttribute('aria-label', 'Close save login');
      x.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20"/></svg>';
      header.append(title, x); panel.append(header, notice('Save your username and password to Personal Data for this website?'));
      const save = button('Save login', async () => {
        save.disabled = true;
        try {
          let result = await bridge.invoke('personal-data-login-save');
          if (!panel.isConnected) return;
          if (result?.needsUpdate) {
            title.textContent = 'Update login?';
            if (!await confirmUpdate(panel) || !panel.isConnected) { save.disabled = false; return; }
            result = await bridge.invoke('personal-data-login-save', { confirmUpdate: true });
          }
          if (!panel.isConnected) return;
          panel.replaceChildren(header, notice(result?.updated ? 'Website login updated.' : 'Login saved for this website.', 'success'), button('Done', () => close()));
        } catch { if (panel.isConnected) { save.disabled = false; panel.append(notice('Unable to save. Unlock Personal Data and try again.', 'error')); } }
      });
      panel.append(save, button('Not now', dismiss)); root.append(panel); document.documentElement.append(host);
    } catch { /* A disabled, private or changed page cannot offer login saving. */ }
    finally { checkingLogin = false; }
  };
  const captureLogin = (container: ParentNode) => {
    if (!enabled || paused || disposed) return;
    const inputs = Array.from(container.querySelectorAll('input'));
    const passwords = inputs.filter((input) => usable(input) && input.type === 'password' && input.value);
    const users = inputs.filter((input) => input.value && !input.disabled && input.type !== 'password' &&
      (input.type === 'email' || input.autocomplete === 'username' ||
        match('username', [], descriptor(input)) > 0 || match('email', [], descriptor(input)) > 0));
    if (passwords.length === 0 && users.length === 1) {
      void bridge.invoke('personal-data-login-identity', { username: users[0].value }).catch(() => {});
      return;
    }
    if (passwords.length !== 1 || passwords[0].autocomplete === 'new-password' || users.length > 1) return;
    loginAttempt++; close(); submittedHere = true; loginSuggested = false; loginGoneSince = 0;
    void bridge.invoke('personal-data-login-candidate', { username: users[0]?.value || '', password: passwords[0].value }).then(checkLogin).catch(() => {});

  };
  const onSubmit = (event: SubmitEvent) => {
    if (event.isTrusted && event.target instanceof HTMLFormElement) captureLogin(event.target);
  };
  const onLoginClick = (event: MouseEvent) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const control = event.target.closest('button,input[type=submit],input[type=button],[role=button]');
    if (!control) return;
    const label = [control.textContent, control.getAttribute('aria-label'), control.getAttribute('value')].filter(Boolean).join(' ');
    if (control.getAttribute('type') !== 'submit' && !/\b(sign[ -]?in|log[ -]?in|continue|submit)\b/i.test(label)) return;
    captureLogin(control.closest('form') || document);
  };
  const onLoginEnter = (event: KeyboardEvent) => {
    if (event.isTrusted && event.key === 'Enter' && event.target instanceof HTMLInputElement &&
        ['password', 'email', 'text'].includes(event.target.type)) captureLogin(event.target.form || document);
  };
  document.addEventListener('click', onLoginClick, true);
  document.addEventListener('keydown', onLoginEnter, true);
  const loginTimer = setInterval(() => { void checkLogin(); }, 250);
  document.addEventListener('submit', onSubmit, true);
  const onFocus = (event: FocusEvent) => {
    if (event.target === host || loginPrompt) return;
    if (enabled && !paused && usable(event.target as Element) && recognized(event.target as HTMLInputElement)) show(event.target as HTMLInputElement);
    else close();
  };
  const onPointer = (event: Event) => { if (!loginPrompt && event.target !== host && event.target !== target) close(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
  document.addEventListener('focusin', onFocus);
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey);
  const closeField = () => { if (!loginPrompt) close(); };
  addEventListener('scroll', closeField, true); addEventListener('resize', closeField); addEventListener('pagehide', close);
  bridge.on('personal-data-autofill-enabled', (_event, next) => {
    if (disposed) return;
    const wasEnabled = enabled;
    enabled = next === true;
    if (!enabled) close();
    else if (!wasEnabled && !paused && usable(document.activeElement) && recognized(document.activeElement)) show(document.activeElement);
  });
  bridge.on('personal-data-autofill-authenticating', (_event, waiting) => {
    authenticating = waiting === true;
    if (disposed || !root) return;
    const label = root.querySelector('.loading span');
    if (label) label.textContent = waiting ? 'Waiting for authentication…' : 'Loading Personal Data…';
    root.querySelector('.auth-status')?.remove();
    if (waiting && !label) {
      const status = notice('Waiting for authentication…'); status.classList.add('auth-status');
      root.querySelector('.panel')?.append(status);
    }
  });
  bridge.on('password-manager-locked', () => close());
  void bridge.invoke('personal-data-autofill-position').then((saved) => {
    if (disposed || movedPlacement || !saved || !['left', 'right'].includes(saved.side) || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return;
    placement = saved; position();
  }).catch(() => {});
  void bridge.invoke('personal-data-autofill-enabled').then((next) => {
    if (disposed) return;
    enabled = next === true;
    if (enabled && !paused && usable(document.activeElement) && recognized(document.activeElement)) show(document.activeElement);
  }).catch(() => {});
  return () => {
    disposed = true; enabled = false; close();
    clearInterval(loginTimer); document.removeEventListener('submit', onSubmit, true);
    document.removeEventListener('click', onLoginClick, true); document.removeEventListener('keydown', onLoginEnter, true);
    document.removeEventListener('focusin', onFocus);
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey);
    removeEventListener('scroll', closeField, true); removeEventListener('resize', closeField); removeEventListener('pagehide', close);
  };
}
