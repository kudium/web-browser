/** Portable panel payloads; runtime functions stay in the originating hook. */
export type HookPanelContent =
  | { type: 'text' | 'markdown'; text: string }
  | { type: 'json'; value: unknown }
  | {
      type: 'table';
      columns: string[];
      rows: Array<Array<string | number | boolean | null>>;
    }
  | { type: 'status'; state: 'loading' | 'success' | 'error'; text: string }
  | {
      type: 'html';
      html: string;
      css?: string;
      script?: string;
      data?: unknown;
      /** Explicit HTTP(S) image URLs; loaded without cookies or referrer. */
      images?: string[];
    };
export interface HookPanelOutput {
  id: string;
  title: string;
  content: HookPanelContent;
  actions?: Array<{ id: string; label: string }>;
  reveal?: boolean;
}
export function panelJSON(value: unknown, limit = 32000): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined || encoded.length > limit)
    throw new Error('Panel data must be JSON and within the size limit.');
  return encoded;
}
export function validateHookPanel(value: unknown): HookPanelOutput {
  panelJSON(value, 100000);
  const p = value as HookPanelOutput;
  const key = (v: unknown) =>
    typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
  if (
    !p ||
    !key(p.id) ||
    typeof p.title !== 'string' ||
    !p.title.trim() ||
    p.title.length > 120 ||
    !p.content ||
    (p.reveal !== undefined && typeof p.reveal !== 'boolean')
  )
    throw new Error('Provide a panel id, title and content.');
  if (
    Object.keys(p).some(
      (k) => !['id', 'title', 'content', 'actions', 'reveal'].includes(k),
    )
  )
    throw new Error('Unknown panel option.');
  const c = p.content;
  const string = (v: unknown) => typeof v === 'string';
  const fields: Record<string, string[]> = {
    text: ['type', 'text'],
    markdown: ['type', 'text'],
    json: ['type', 'value'],
    table: ['type', 'columns', 'rows'],
    status: ['type', 'state', 'text'],
    html: ['type', 'html', 'css', 'script', 'data', 'images'],
  };
  if (
    !fields[c.type] ||
    Object.keys(c).some((k) => !fields[c.type].includes(k))
  )
    throw new Error('Unknown panel content type or field.');
  if ((c.type === 'text' || c.type === 'markdown') && !string(c.text))
    throw new Error('Panel text must be a string.');
  if (c.type === 'json') panelJSON(c.value);
  if (
    c.type === 'status' &&
    (!['loading', 'success', 'error'].includes(c.state) || !string(c.text))
  )
    throw new Error('Invalid panel status.');
  if (
    c.type === 'table' &&
    (!Array.isArray(c.columns) ||
      !c.columns.length ||
      c.columns.length > 20 ||
      !c.columns.every(string) ||
      !Array.isArray(c.rows) ||
      c.rows.length > 200 ||
      !c.rows.every(
        (row) =>
          Array.isArray(row) &&
          row.length === c.columns.length &&
          row.every(
            (v) =>
              v === null || ['string', 'number', 'boolean'].includes(typeof v),
          ),
      ))
  )
    throw new Error('Provide up to 20 columns and 200 matching rows.');
  if (
    c.type === 'html' &&
    (!string(c.html) ||
      (c.css !== undefined && !string(c.css)) ||
      (c.script !== undefined && !string(c.script)))
  )
    throw new Error('HTML, CSS and script must be strings.');
  let normalizedImages: string[] | undefined;
  if (c.type === 'html' && c.images !== undefined) {
    if (!Array.isArray(c.images) || c.images.length > 24)
      throw new Error('Provide up to 24 explicit panel image URLs.');
    normalizedImages = c.images.map((image) => {
      if (typeof image !== 'string' || image.length > 2000)
        throw new Error('Invalid panel image URL.');
      const destination = new URL(image);
      if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password)
        throw new Error('Panel images require HTTP(S) URLs without credentials.');
      return destination.href;
    });
  }
  if (
    p.actions &&
    (!Array.isArray(p.actions) ||
      p.actions.length > 10 ||
      new Set(p.actions.map((a) => a?.id)).size !== p.actions.length ||
      !p.actions.every(
        (a) =>
          a &&
          key(a.id) &&
          typeof a.label === 'string' &&
          !!a.label.trim() &&
          a.label.length <= 80 &&
          Object.keys(a).every((k) => ['id', 'label'].includes(k)),
      ))
  )
    throw new Error('Provide up to ten unique declared actions.');
  const result = JSON.parse(JSON.stringify(p)) as HookPanelOutput;
  if (result.content.type === 'html' && normalizedImages) result.content.images = normalizedImages;
  return result;
}

/** Only declared images gain network access; fetch, frames and scripts do not. */
export function hookPanelImageAllowed(content: HookPanelContent, url: string) {
  return content.type === 'html' && !!content.images?.includes(url);
}
