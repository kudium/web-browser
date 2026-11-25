// Paste into After load. Apply navigates this tab to the updated URL.
const panelId = 'url-query-editor';
const applyId = 'url-query-apply';
const currentUrl = new URL(location.href);

context.panel.onAction(applyId, (payload) => {
  if (!payload || payload.baseUrl !== location.href) {
    throw new Error('The page URL changed. Run the hook again before applying.');
  }
  if (!Array.isArray(payload.params) || payload.params.length > 100) {
    throw new Error('Provide at most 100 query parameters.');
  }
  const updated = new URL(location.href);
  updated.search = '';
  for (const row of payload.params) {
    if (!Array.isArray(row) || row.length !== 2 ||
        row.some(value => typeof value !== 'string' || value.length > 4000)) {
      throw new Error('Each parameter needs a name and value, up to 4,000 characters each.');
    }
    updated.searchParams.append(row[0], row[1]);
  }
  if (updated.href.length > 16000) throw new Error('The resulting URL is too long.');
  // Allow the panel action response to arrive before navigation clears this hook.
  if (updated.href !== location.href) {
    context.setTimeout(() => location.assign(updated.href), 100);
  }
  return { updatedUrl: updated.href };
});

await context.panel.show({
  id: panelId,
  title: 'URL breakdown',
  reveal: true,
  actions: [{ id: applyId, label: 'Apply URL' }],
  content: {
    type: 'html',
    data: {
      baseUrl: currentUrl.href,
      params: Array.from(currentUrl.searchParams),
    },
    html: `
      <div class="kudium-form">
        <label class="kudium-field">Updated URL
          <textarea id="url-preview" rows="3" readonly></textarea>
        </label>
        <details class="url-details"><summary>URL details</summary><dl id="url-parts" class="url-parts"></dl></details>
        <div class="query-heading"><div><strong>Query parameters</strong><p class="kudium-hint">Names and values are decoded for editing.</p></div><button id="add-param" type="button" class="kudium-button">Add parameter</button></div>
        <div id="query-rows"></div>
        <div class="query-tools">
          <button id="reset-params" type="button" class="kudium-button">Reset</button>
          <button id="apply-url" type="button" class="kudium-button kudium-button-primary">Apply URL</button>
        </div>
        <p id="query-message" class="kudium-hint" role="status" aria-live="polite"></p>
      </div>`,
    css: `
      *{box-sizing:border-box}
      html{color-scheme:light dark}
      body{margin:0;font:13px/1.45 system-ui;color:CanvasText}
      .kudium-form{display:grid;gap:16px;padding:16px 16px 76px;min-width:0}
      .kudium-field{display:grid;gap:6px;min-width:0;font-size:12px;color:color-mix(in srgb,CanvasText 70%,Canvas)}
      .kudium-form input,.kudium-form textarea{display:block;width:100%;max-width:100%;min-width:0;border:0;border-radius:8px;padding:9px 10px;background:color-mix(in srgb,CanvasText 6%,Canvas);color:CanvasText;font:13px/1.45 system-ui;box-shadow:none}
      .kudium-form input{height:36px}
      .kudium-form :is(input,textarea,button):focus-visible{outline:2px solid var(--kudium-primary,#69aaa7);outline-offset:2px}
      #url-preview{font:12px/1.6 ui-monospace,monospace;min-height:64px;max-height:160px;resize:none;overflow-wrap:anywhere;white-space:pre-wrap}
      .kudium-hint{margin:3px 0 0;font-size:12px;line-height:1.45;color:color-mix(in srgb,CanvasText 60%,Canvas)}
      .url-details{font-size:12px;color:color-mix(in srgb,CanvasText 70%,Canvas)}
      .url-details summary{cursor:pointer;user-select:none}
      .url-parts{display:grid;grid-template-columns:minmax(80px,25%) minmax(0,1fr);gap:7px 12px;margin:12px 0 0;overflow-wrap:anywhere}
      .url-parts dt{opacity:.75}.url-parts dd{margin:0;color:CanvasText}
      .query-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .query-heading strong{font-size:13px;font-weight:600}
      #query-rows{display:grid;gap:12px}
      .query-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) 28px;gap:8px;align-items:end}
      .kudium-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;max-width:100%;border:0;border-radius:8px;padding:7px 10px;font:500 12px/1.4 system-ui;background:color-mix(in srgb,CanvasText 8%,Canvas);color:CanvasText;cursor:pointer}
      .kudium-button:hover:not(:disabled){background:color-mix(in srgb,CanvasText 13%,Canvas)}
      .kudium-button-primary{background:var(--kudium-primary,#69aaa7);color:var(--kudium-primary-contrast,#102d2c);font-weight:600}
      .kudium-button-primary:hover:not(:disabled){background:color-mix(in srgb,var(--kudium-primary,#69aaa7) 88%,CanvasText)}
      .query-remove{width:28px;min-height:28px;margin-bottom:4px;padding:0;border-radius:50%;background:transparent;font-size:20px;font-weight:400;color:color-mix(in srgb,CanvasText 65%,Canvas)}
      .kudium-form :disabled{opacity:.45;cursor:default}
      .query-tools{position:fixed;z-index:2;inset:auto 0 0;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:10px 16px;background:color-mix(in srgb,Canvas 90%,transparent);backdrop-filter:blur(16px)}
      #query-message:empty{display:none}
      @media(max-width:380px){.kudium-form{padding:12px 12px 76px;gap:14px}.query-row{grid-template-columns:minmax(0,1fr) 28px;gap:6px 8px}.query-row .query-value{grid-column:1;grid-row:2}.query-row .query-remove{grid-column:2;grid-row:1 / 3;align-self:center;margin:0}}
    `,
    script: `
      const rows = document.getElementById('query-rows');
      const preview = document.getElementById('url-preview');
      const message = document.getElementById('query-message');
      const apply = document.getElementById('apply-url');
      let baseUrl = '';
      let originalParams = [];
      const reset = document.getElementById('reset-params');
      let busy = false;
      const values = () => Array.from(rows.children, row => [
        row.querySelector('.param-name').value,
        row.querySelector('.param-value').value
      ]);
      const updatePreview = () => {
        if (!baseUrl) return;
        const next = new URL(baseUrl);
        next.search = '';
        for (const [key, value] of values()) next.searchParams.append(key, value);
        preview.value = next.href;
        preview.style.height = 'auto';
        preview.style.height = Math.min(160, Math.max(64, preview.scrollHeight)) + 'px';
        const unchanged = JSON.stringify(values()) === JSON.stringify(originalParams);
        apply.disabled = busy || unchanged;
        reset.disabled = busy || unchanged;
        message.textContent = '';
      };
      const addRow = (name = '', value = '', focus = false) => {
        const row = document.createElement('div');
        row.className = 'query-row';
        const field = (title, className, text) => {
          const label = document.createElement('label');
          label.className = 'kudium-field';
          label.textContent = title;
          const input = document.createElement('input');
          input.className = className;
          input.value = text;
          input.disabled = busy;
          input.addEventListener('input', updatePreview);
          label.append(input);
          row.append(label);
          return label;
        };
        const nameField = field('Name', 'param-name', name);
        field('Value', 'param-value', value).classList.add('query-value');
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'kudium-button query-remove';
        remove.textContent = '×';
        remove.title = 'Remove parameter';
        remove.setAttribute('aria-label', 'Remove query parameter');
        remove.onclick = () => { row.remove(); updatePreview(); document.getElementById('add-param').focus(); };
        row.append(remove);
        rows.append(row);
        if (focus) nameField.querySelector('input').focus();
      };
      document.getElementById('add-param').onclick = () => {
        if (rows.children.length >= 100) { message.textContent = 'Maximum 100 parameters.'; return; }
        addRow('', '', true);
        updatePreview();
      };
      reset.onclick = () => { rows.replaceChildren(); for (const [name, value] of originalParams) addRow(name, value); updatePreview(); };
      kudiumHookPanel.onUpdate(output => {
        baseUrl = output.content.data.baseUrl;
        originalParams = output.content.data.params;
        const parsed = new URL(baseUrl);
        const parts = document.getElementById('url-parts');
        parts.replaceChildren();
        for (const [name, value] of [['Protocol', parsed.protocol], ['Hostname', parsed.hostname], ['Port', parsed.port || '(default)'], ['Path', parsed.pathname], ['Fragment', parsed.hash || '(none)']]) {
          const label = document.createElement('dt');
          const detail = document.createElement('dd');
          label.textContent = name;
          detail.textContent = value;
          parts.append(label, detail);
        }
        rows.replaceChildren();
        for (const [name, value] of output.content.data.params) addRow(name, value);
        updatePreview();
      });
      apply.onclick = async () => {
        if (busy || !baseUrl) return;
        busy = true;
        document.querySelectorAll('#query-rows input, button').forEach(control => control.disabled = true);
        try {
          const result = await kudiumHookPanel.invoke('url-query-apply', {baseUrl, params: values()});
          message.textContent = result.updatedUrl === baseUrl ? 'URL is unchanged.' : 'Opening updated URL…';
        } catch (error) {
          message.textContent = error.message || 'Could not update URL.';
        } finally {
          busy = false;
          document.querySelectorAll('#query-rows input, button').forEach(control => control.disabled = false);
          const unchanged = JSON.stringify(values()) === JSON.stringify(originalParams);
          apply.disabled = unchanged;
          reset.disabled = unchanged;
        }
      };
    `,
  },
});
