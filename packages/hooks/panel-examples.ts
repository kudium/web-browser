export type HookStage = "before" | "after" | "css";
export interface HookExample {
  id: string;
  name: string;
  stage: HookStage;
  source: string;
}
/** Shared with the website tutorial so copied examples match the app runtime. */
export const hookPanelExamples: HookExample[] = [
  {
    id: "panel-navigator",
    name: "Panel: page navigator with saved progress",
    stage: "after",
    source: `// Page access stays in this hook; the panel receives labels and indices only.
/** @type {{query?:string, heading?:string}} */
let savedNavigator = {};
let stateNotice = '';
try { savedNavigator = (await context.panel.loadState('navigator')) || {}; }
catch (_) { stateNotice = 'Progress is kept for this session; saved state is unavailable.'; }
let searchTerm = typeof savedNavigator.query === 'string' ? savedNavigator.query.slice(0, 120) : '';
let chosenHeading = typeof savedNavigator.heading === 'string' ? savedNavigator.heading : '';
/** @type {HTMLElement[]} */
let headingTargets = [];
/** @type {HTMLElement | undefined} */
let highlightedHeading;
let originalOutline = { outline: "", offset: "" };
const clearHighlight = () => {
  if (highlightedHeading) {
    highlightedHeading.style.outline = originalOutline.outline;
    highlightedHeading.style.outlineOffset = originalOutline.offset;
    highlightedHeading = undefined;
  }
};
/** @param {number} index */
const highlightHeading = index => {
  clearHighlight();
  const target = headingTargets[index];
  if (!target || !target.isConnected) return;
  highlightedHeading = target;
  originalOutline = { outline: target.style.outline, offset: target.style.outlineOffset };
  target.style.outline = '2px solid ' + context.theme.primary;
  target.style.outlineOffset = '5px';
};
context.onCleanup(clearHighlight);
const navigatorDesign = {
  html: '<main class="kudium-form"><header><h1>Page navigator</h1><button id="refresh" class="kudium-button" title="Refresh sections" aria-label="Refresh sections"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 12M4 12l2.3 6A7 7 0 0 0 18 17"/></svg></button></header><form id="search-form"><label class="kudium-field">Find a section<input id="query" type="search" maxlength="120" placeholder="Search page headings"></label><button class="kudium-button kudium-button-primary" type="submit">Find</button></form><p id="summary" class="kudium-hint" role="status"></p><div id="sections"></div><p id="selection" class="kudium-hint"></p><p id="notice" class="kudium-hint"></p><p id="error" role="alert"></p><button id="forget" class="kudium-button">Reset saved progress</button></main>',
  css: 'main{padding:16px}header{display:flex;align-items:center;justify-content:space-between;gap:12px}h1{font-size:18px;font-weight:600;margin:0}form{display:flex;align-items:end;gap:8px;margin-top:16px}.kudium-field{flex:1;min-width:0}#sections{display:flex;flex-direction:column;gap:4px;margin:12px 0}.section{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:transparent;color:inherit;border:0;border-radius:8px;padding:10px;cursor:pointer}.section:hover,.section[aria-current=true]{background:color-mix(in srgb,CanvasText 8%,Canvas)}.section span{min-width:0;overflow-wrap:anywhere;flex:1}.section small{opacity:.55;font-size:11px}.section:focus-visible{outline:2px solid var(--kudium-primary);outline-offset:1px}#error{font-size:12px;color:light-dark(#b91c1c,#fca5a5)}#selection{overflow-wrap:anywhere}button svg{display:block}#forget{font-size:11px;opacity:.7}@media(max-width:260px){form{flex-wrap:wrap}form button{width:100%}}',
  script: String.raw\`let activeNavigatorData;
const errorBox = document.getElementById('error');
const call = async (action, payload) => {
  errorBox.textContent = '';
  try { return await kudiumHookPanel.invoke(action, payload); }
  catch (error) { errorBox.textContent = error.message || 'Try again.'; }
};
kudiumHookPanel.onUpdate(output => {
  const data = output.content.data;
  activeNavigatorData = data;
  const queryInput = document.getElementById('query');
  if (document.activeElement !== queryInput) queryInput.value = data.query;
  document.getElementById('summary').textContent = data.items.length ? data.items.length + ' sections · hover to highlight, click to jump' : data.total ? 'No sections match. Try another word.' : 'No headings found on this page.';
  document.getElementById('selection').textContent = data.selection ? 'Selected on page: ' + data.selection : '';
  document.getElementById('notice').textContent = data.notice;
  const list = document.getElementById('sections');
  list.replaceChildren();
  for (const item of data.items) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'section';
    button.setAttribute('aria-current', String(item.label === data.heading));
    const label = document.createElement('span'); label.textContent = item.label;
    const level = document.createElement('small'); level.textContent = item.level;
    button.append(label, level);
    button.onmouseenter = () => { void call('navigator-highlight', { index: item.index }); };
    button.onfocus = button.onmouseenter;
    button.onmouseleave = () => { void call('navigator-highlight', { index: -1 }); };
    button.onblur = button.onmouseleave;
    button.onclick = () => { void call('navigator-jump', { index: item.index }); };
    list.append(button);
  }
});
document.getElementById('search-form').onsubmit = async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button');
  button.disabled = true; try { await call('navigator-search', { query: document.getElementById('query').value }); } finally { button.disabled = false; }
};
document.getElementById('refresh').onclick = () => { void call('navigator-search', { query: document.getElementById('query').value }); };
document.getElementById('forget').onclick = () => { void call('navigator-reset', {}); };\`
};
const rememberNavigator = async () => {
  try { await context.panel.saveState('navigator', { query: searchTerm, heading: chosenHeading }); stateNotice = ''; }
  catch (_) { stateNotice = 'Progress is kept for this session; saved state is unavailable.'; }
};
const publishNavigator = async (reveal = false) => {
  clearHighlight();
  headingTargets = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(element => element instanceof HTMLElement).filter(element => element.textContent.trim()).slice(0, 100);
  const items = headingTargets.map((element, index) => ({ index, label: element.textContent.trim().slice(0, 180), level: element.tagName })).filter(item => item.label.toLowerCase().includes(searchTerm.toLowerCase()));
  return context.panel.update({ id: 'navigator', title: 'Page navigator', reveal,
    content: { type: 'html', ...navigatorDesign, data: { items, total: headingTargets.length, query: searchTerm, heading: chosenHeading, selection: String(document.getSelection() || '').trim().slice(0, 160), notice: stateNotice } },
    actions: [{ id: 'navigator-search', label: 'Find sections' }, { id: 'navigator-highlight', label: 'Highlight section' }, { id: 'navigator-jump', label: 'Jump to section' }, { id: 'navigator-reset', label: 'Reset progress' }]
  });
};
context.panel.onAction('navigator-search', async raw => {
  const input = /** @type {{query?:unknown}} */ (raw);
  if (!input || typeof input.query !== 'string') throw new Error('Enter a search term.');
  searchTerm = input.query.slice(0, 120); await rememberNavigator(); return publishNavigator();
});
context.panel.onAction('navigator-highlight', raw => {
  const input = /** @type {{index:number}} */ (raw);
  if (!Number.isInteger(input?.index)) throw new Error('Choose a section.');
  highlightHeading(input.index);
});
context.panel.onAction('navigator-jump', async raw => {
  const input = /** @type {{index:number}} */ (raw);
  const target = Number.isInteger(input?.index) ? headingTargets[input.index] : undefined;
  if (!target?.isConnected) throw new Error('The page changed. Refresh sections and try again.');
  target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  chosenHeading = target.textContent.trim().slice(0, 180);
  await rememberNavigator(); await publishNavigator(); highlightHeading(input.index);
});
context.panel.onAction('navigator-reset', async () => {
  try { await context.panel.clearState('navigator'); stateNotice = ''; } catch (_) { stateNotice = 'Saved state could not be cleared. Try again.'; }
  searchTerm = ''; chosenHeading = ''; return publishNavigator();
});
/** @type {ReturnType<typeof setTimeout> | undefined} */
let selectionTimer;
context.listen(document, 'selectionchange', () => {
  if (selectionTimer) return;
  selectionTimer = context.setTimeout(() => { selectionTimer = undefined; void publishNavigator().catch(() => {}); }, 250);
});
await publishNavigator(true);
`
  },
  {
    id: "panel-markdown",
    name: "Panel: Markdown output",
    stage: "after",
    source: `await context.panel.show({
  id: 'summary', title: 'Page summary', reveal: true,
  content: { type: 'markdown', text: '# ' + document.title + '\\n\\n[Open this page](' + url + ')' }
});`,
  },
  {
    id: "panel-table",
    name: "Panel: link table",
    stage: "after",
    source: `const links = Array.from(document.links).slice(0, 30);
await context.panel.show({
  id: 'links', title: 'Page links', reveal: true,
  content: { type: 'table', columns: ['Label', 'URL'], rows: links.map(a => [a.textContent.trim(), a.href]) }
});`,
  },
  {
    id: "panel-json",
    name: "Panel: JSON inspector",
    stage: "after",
    source: `await context.panel.show({
  id: 'inspector', title: 'Page inspector', reveal: true,
  content: { type: 'json', value: { title: document.title, url, headings: document.querySelectorAll('h1,h2,h3').length } }
});`,
  },
  {
    id: "panel-status",
    name: "Panel: status and refresh action",
    stage: "after",
    source: `const publish = async (reveal = false) => context.panel.update({
  id: 'monitor', title: 'Page status', reveal,
  content: { type: 'status', state: 'success', text: 'Page has ' + document.querySelectorAll('a[href]').length + ' links.' },
  actions: [{ id: 'refresh', label: 'Refresh' }]
});
context.panel.onAction('refresh', () => publish());
await context.panel.show({ id: 'monitor', title: 'Page status', reveal: true, content: { type: 'status', state: 'loading', text: 'Reading page…' } });
await publish();`,
  },
  {
    id: "panel-html",
    name: "Panel: custom HTML dashboard",
    stage: "after",
    source: `// The page hook owns DOM access; the custom panel receives JSON only.
const panelDesign = {
  html: '<main><h1>Page dashboard</h1><p id="count"></p><input placeholder="Your scratch note"><button id="refresh">Refresh</button><p id="error" role="alert"></p></main>',
  css: 'main{padding:16px}h1{font-size:18px}input{display:block;width:100%;padding:8px;margin:12px 0}button{width:100%}',
  script: "kudiumHookPanel.onUpdate(output => { document.getElementById('count').textContent = output.content.data.links + ' links on this page'; }); document.getElementById('refresh').onclick = async () => { const button = document.getElementById('refresh'); button.disabled = true; try { await kudiumHookPanel.invoke('refresh'); } catch (error) { document.getElementById('error').textContent = error.message; } finally { button.disabled = false; } };"
};
const publish = async (reveal = false) => context.panel.update({
  id: 'dashboard', title: 'Page dashboard', reveal,
  content: { type: 'html', ...panelDesign, data: { links: document.querySelectorAll('a[href]').length } },
  actions: [{ id: 'refresh', label: 'Refresh page counts' }]
});
context.panel.onAction('refresh', () => publish());
await publish(true);
// Updating data retains the scratch note. Changing HTML/CSS/script replaces the view.`,
  },
  {
    id: "panel-media",
    name: "Panel: page media gallery",
    stage: "after",
    source: String.raw`// Extracts DOM media and direct media links; explicitly listed pictures load in the panel.
// Pictures use their source URLs if a page snapshot is unavailable; protected images may fail.
let mediaPage = 0;
const mediaPageSize = 12;
const mediaDesign = {
  html: '<main><header><h1>Page media</h1><button id="refresh">Refresh</button></header><p id="summary" role="status"></p><div id="gallery"></div><nav><button id="previous">Previous</button><button id="next">Next</button></nav><p id="error" role="alert"></p><small>Click a card to open its source in this tab group. Transient blob/data URLs and protected streams are not downloadable links.</small></main>',
  css: 'main{padding:12px}header,nav{display:flex;align-items:center;justify-content:space-between;gap:8px}h1{font-size:18px;margin:0}#gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr));gap:10px;margin:12px 0}#gallery a{display:flex;flex-direction:column;min-width:0;padding:8px;border-radius:8px;background:color-mix(in srgb,CanvasText 6%,Canvas);text-decoration:none}img,.placeholder{width:100%;height:96px;object-fit:contain;background:color-mix(in srgb,CanvasText 4%,Canvas);border-radius:4px}.placeholder{display:grid;place-items:center;font-size:32px}strong{margin-top:8px;font-size:12px;overflow-wrap:anywhere}small{opacity:.7;font-size:11px}nav{margin-bottom:12px}button:disabled{opacity:.5}#error{color:light-dark(#b91c1c,#fca5a5)}',
  script: "kudiumHookPanel.onUpdate(output => {\n  const state = output.content.data;\n  document.getElementById('summary').textContent = state.total ? state.total + ' media links \u00b7 page ' + (state.page + 1) + ' of ' + state.pages : 'No image, video or audio links found on this page.';\n  const grid = document.getElementById('gallery');\n  grid.replaceChildren();\n  for (const item of state.items) {\n    const card = document.createElement('a');\n    card.href = item.url;\n    card.title = item.url;\n    if (item.thumbnail || item.kind === 'image') {\n      const image = document.createElement('img');\n      image.src = item.thumbnail || item.url;\n      image.loading = 'lazy';\n      image.referrerPolicy = 'no-referrer';\n      image.onerror = () => { const fallback = document.createElement('div'); fallback.className = 'placeholder'; fallback.textContent = 'Image unavailable'; image.replaceWith(fallback); };\n      image.alt = item.label;\n      card.append(image);\n    } else {\n      const placeholder = document.createElement('div');\n      placeholder.className = 'placeholder';\n      placeholder.textContent = item.kind === 'image' ? '\u25a7' : item.kind === 'video' ? '\u25b6' : '\u266b';\n      card.append(placeholder);\n    }\n    const label = document.createElement('strong');\n    label.textContent = item.label;\n    const detail = document.createElement('small');\n    detail.textContent = item.kind + (item.thumbnail ? ' \u00b7 page preview' : item.kind === 'image' ? ' \u00b7 source image' : ' \u00b7 preview unavailable');\n    card.append(label, detail);\n    grid.append(card);\n  }\n  document.getElementById('previous').disabled = state.page === 0;\n  document.getElementById('next').disabled = state.page + 1 >= state.pages;\n});\nfor (const id of ['refresh', 'previous', 'next']) {\n  document.getElementById(id).onclick = async () => {\n    const button = document.getElementById(id);\n    button.disabled = true;\n    document.getElementById('error').textContent = '';\n    try { await kudiumHookPanel.invoke('media-' + id); }\n    catch (error) { document.getElementById('error').textContent = String(error.message || error); }\n    finally { if (id === 'refresh') button.disabled = false; }\n  };\n}"
};
const publishMedia = async (reveal = false) => {
  const found = new Map();
  /**
   * @param {string | null} raw
   * @param {string} kind
   * @param {string | null} label
   * @param {HTMLImageElement | HTMLMediaElement | null} element
   */
  const addMedia = (raw, kind, label, element = null) => {
    try {
      if (!raw) return;
      const destination = new URL(raw, document.baseURI);
      if (!/^https?:$/.test(destination.protocol) || destination.href.length > 1500 || destination.username || destination.password) return;
      const key = kind + ':' + destination.href;
      const previous = found.get(key);
      if (!previous || (!previous.element && element)) found.set(key, { url: destination.href, kind, label: (label || destination.pathname.split('/').pop() || kind).slice(0, 100), element });
    } catch { /* Ignore invalid and transient URLs. */ }
  };
  for (const image of Array.from(document.images)) {
    for (const src of [image.currentSrc, image.src]) if (src) addMedia(src, 'image', image.alt, src === image.currentSrc ? image : null);
    for (const entry of image.srcset.split(',')) {
      const src = entry.trim().split(/\s+/)[0];
      if (src) addMedia(src, 'image', image.alt);
    }
  }
  for (const source of Array.from(document.querySelectorAll('picture source'))) {
    if (!(source instanceof HTMLSourceElement)) continue;
    for (const entry of source.srcset.split(',')) {
      const src = entry.trim().split(/\s+/)[0];
      if (src) addMedia(src, 'image', 'Picture source');
    }
  }
  for (const element of Array.from(document.querySelectorAll('video,audio'))) {
    const kind = element.tagName === 'VIDEO' ? 'video' : 'audio';
    if (!(element instanceof HTMLMediaElement)) continue;
    for (const src of [element.currentSrc, element.src]) if (src) addMedia(src, kind, element.getAttribute('title'), src === element.currentSrc ? element : null);
    for (const child of Array.from(element.querySelectorAll('source[src]'))) addMedia(child.getAttribute('src'), kind, element.getAttribute('title'));
    if (element instanceof HTMLVideoElement && element.poster) addMedia(element.poster, 'image', 'Video poster');
  }
  for (const link of Array.from(document.links)) {
    try {
      const path = new URL(link.href).pathname;
      const kind = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i.test(path) ? 'image' : /\.(mp4|webm|mov|m4v|ogv|m3u8|mpd)$/i.test(path) ? 'video' : /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i.test(path) ? 'audio' : '';
      if (kind) addMedia(link.href, kind, link.textContent.trim());
    } catch { /* Ignore malformed URLs. */ }
  }
  const results = Array.from(found.values());
  const pages = Math.max(1, Math.ceil(results.length / mediaPageSize));
  mediaPage = Math.min(mediaPage, pages - 1);
  const items = results.slice(mediaPage * mediaPageSize, (mediaPage + 1) * mediaPageSize).map(item => {
    let thumbnail = '';
    const element = item.element;
    try {
      const width = element instanceof HTMLImageElement ? element.naturalWidth : element instanceof HTMLVideoElement ? element.videoWidth : 0;
      const height = element instanceof HTMLImageElement ? element.naturalHeight : element instanceof HTMLVideoElement ? element.videoHeight : 0;
      if (width && height) {
        const canvas = document.createElement('canvas');
        canvas.width = 96; canvas.height = 64;
        const paint = canvas.getContext('2d');
        const scale = Math.min(96 / width, 64 / height);
        if (paint) paint.drawImage(element, (96 - width * scale) / 2, (64 - height * scale) / 2, width * scale, height * scale);
        const preview = canvas.toDataURL('image/jpeg', 0.35);
        if (preview.length <= 3500) thumbnail = preview;
      }
    } catch { /* Cross-origin and protected canvas previews are unavailable. */ }
    return { url: item.url, kind: item.kind, label: item.label, thumbnail };
  });
  await context.panel.update({ id: 'page-media', title: 'Page media', reveal,
    content: { type: 'html', ...mediaDesign, images: items.filter(item => item.kind === 'image' && !item.thumbnail).map(item => item.url), data: { items, total: results.length, page: mediaPage, pages } },
    actions: [{ id: 'media-refresh', label: 'Refresh media' }, { id: 'media-previous', label: 'Previous page' }, { id: 'media-next', label: 'Next page' }]
  });
};
context.panel.onAction('media-refresh', () => publishMedia());
context.panel.onAction('media-previous', () => { mediaPage = Math.max(0, mediaPage - 1); return publishMedia(); });
context.panel.onAction('media-next', () => { mediaPage += 1; return publishMedia(); });
await publishMedia(true);`,
  },
];
