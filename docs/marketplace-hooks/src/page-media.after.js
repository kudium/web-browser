// Extracts DOM media and direct media links; explicitly listed pictures load in the panel.
// Pictures use their source URLs if a page snapshot is unavailable; protected images may fail.
let mediaPage = 0, mediaKind = 'all';
const mediaPageSize = 12;
const mediaDesign = panelDesign;

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
  const score = item => item.element instanceof HTMLImageElement ? item.element.naturalWidth * item.element.naturalHeight : item.element instanceof HTMLVideoElement ? item.element.videoWidth * item.element.videoHeight : 0;
  const results = Array.from(found.values()).filter(item => mediaKind === 'all' || item.kind === mediaKind).sort((a,b) => score(b)-score(a));
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
    content: { type: 'html', ...mediaDesign, images: items.filter(item => item.kind === 'image').map(item => item.url), data: { items, total: results.length, page: mediaPage, pages, kind: mediaKind } },
    actions: [{ id: 'media-filter', label: 'Filter media' }, { id: 'media-refresh', label: 'Refresh media' }, { id: 'media-previous', label: 'Previous page' }, { id: 'media-next', label: 'Next page' }]
  });
};
context.panel.onAction('media-filter', payload => {
  if (!['all','image','video','audio'].includes(payload?.kind)) throw new Error('Unknown media type.');
  mediaKind = payload.kind; mediaPage = 0; return publishMedia();
});
context.panel.onAction('media-refresh', () => publishMedia());
context.panel.onAction('media-previous', () => { mediaPage = Math.max(0, mediaPage - 1); return publishMedia(); });
context.panel.onAction('media-next', () => { mediaPage += 1; return publishMedia(); });
await publishMedia(true);