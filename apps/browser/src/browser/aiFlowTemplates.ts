/**
 * Flow templates for small models (spec 4.10.3). A small model only has to
 * choose a template and fill its slots; the engine runs the flow through
 * `run_script`, whose Page API resolves "text=" targets without a prior
 * snapshot id. (`act` step lists would need element ids the model does not
 * have yet, so the deterministic plans are scripts.)
 */
export interface AIFlowTemplate {
  id: 'sign_in' | 'open_settings' | 'extract_table' | 'check_phrase';
  name: string;
  slots: { name: string; description: string; required: boolean }[];
  /** Matches the user request and fills slots from it. */
  match: (request: string) => Record<string, string> | undefined;
  render: (slots: Record<string, string>) => string;
}

const clean = (value: string) => value.replace(/["'`\\]/g, '').trim().slice(0, 200);
const literal = (value: string) => JSON.stringify(clean(value));

export const AI_FLOW_TEMPLATES: AIFlowTemplate[] = [
  {
    id: 'sign_in',
    name: 'Sign in with a saved login',
    slots: [
      { name: 'url', description: 'Login page URL (optional; current tab otherwise).', required: false },
      { name: 'accountId', description: 'Saved login account id from list_saved_logins.', required: false },
    ],
    match: (request) => {
      const text = request.trim();
      if (!/^(?:please\s+)?(?:log[ -]?in|sign[ -]?in)\b/i.test(text)) return undefined;
      const url = text.match(/https?:\/\/[^\s)]+/)?.[0];
      return { ...(url ? { url } : {}) };
    },
    render: (slots) => `const s = await session();
const page = s.page();
${slots.url ? `await page.goto(${literal(slots.url)}, { waitUntil: 'load' });\n` : ''}const before = await page.snapshot();
${
  slots.accountId
    ? `await page.fill('@0', { savedLogin: ${literal(slots.accountId)} });`
    : `const logins = await __call('fillSaved', { accountId: '' }).catch(() => undefined);
if (!logins) return { needs: 'accountId', url: before.url, title: before.title };`
}
const submit = await page.find('Sign in', 'button').catch(() => page.find('Log in', 'button'));
await page.click('@' + submit.elementId);
const after = await page.snapshot();
return { url: after.url, title: after.title };`,
  },
  {
    id: 'open_settings',
    name: 'Open a named settings page',
    slots: [{ name: 'label', description: 'The link or button label to open.', required: true }],
    match: (request) => {
      const match =
        /^(?:please\s+)?(?:open|go to|show)\s+(?:the\s+)?(.{2,60}?)\s*(?:page|settings|section|tab)?\.?$/i.exec(
          request.trim()
        );
      if (!match) return undefined;
      const label = match[1].replace(/^(?:my|the)\s+/i, '');
      if (/https?:\/\//i.test(label)) return undefined;
      return { label: /settings?$/i.test(label) ? label : `${label} settings`.replace(/\s+settings settings$/i, ' settings') };
    },
    render: (slots) => `const s = await session();
const page = s.page();
const target = await page.find(${literal(slots.label)}).catch(() => page.find(${literal(slots.label.replace(/\s+settings$/i, ''))}));
await page.click('@' + target.elementId);
const after = await page.waitFor({ text: ${literal(slots.label.replace(/\s+settings$/i, ''))}, timeout: 8000 }).catch(() => page.snapshot());
return { url: after.url, title: after.title };`,
  },
  {
    id: 'extract_table',
    name: 'Extract a table',
    slots: [
      { name: 'selector', description: 'Row selector (default tr).', required: false },
      { name: 'limit', description: 'Maximum rows (default 50).', required: false },
    ],
    match: (request) => {
      if (!/\b(?:extract|export|copy|get|pull)\b.*\b(?:table|rows|list)\b/i.test(request)) return undefined;
      const limit = request.match(/\b(\d{1,3})\s+rows?\b/i)?.[1];
      return { ...(limit ? { limit } : {}) };
    },
    render: (slots) => `const s = await session();
const page = s.page();
const rows = await page.extract({ selector: ${literal(slots.selector || 'tr')}, columns: { cells: 'td, th' }, limit: ${Math.min(500, Math.max(1, Number(slots.limit) || 50))} });
return rows;`,
  },
  {
    id: 'check_phrase',
    name: 'Check a page for a phrase',
    slots: [{ name: 'phrase', description: 'The text to look for.', required: true }],
    match: (request) => {
      const match =
        /^(?:please\s+)?(?:check|see|tell me|verify|confirm)\s+(?:if|whether)\s+(?:this|the)\s+page\s+(?:says|contains|shows|mentions|has)\s+["“']?(.{1,120}?)["”']?\.?$/i.exec(
          request.trim()
        );
      return match ? { phrase: match[1] } : undefined;
    },
    render: (slots) => `const s = await session();
const page = s.page();
const snap = await page.snapshot({ maxText: 20000 });
const haystack = String(snap.text || '').toLowerCase();
const phrase = ${literal(slots.phrase)}.toLowerCase();
return { found: haystack.includes(phrase), url: snap.url, title: snap.title };`,
  },
];

export interface AIFlowSelection {
  template: AIFlowTemplate;
  slots: Record<string, string>;
  missing: string[];
}

/** Pick the one template whose matcher accepts the request, with filled slots. */
export function selectFlowTemplate(request: string): AIFlowSelection | undefined {
  for (const template of AI_FLOW_TEMPLATES) {
    const slots = template.match(request);
    if (!slots) continue;
    const missing = template.slots
      .filter((slot) => slot.required && !slots[slot.name])
      .map((slot) => slot.name);
    return { template, slots, missing };
  }
  return undefined;
}

/** The tool call the engine runs for a selected template. */
export function renderFlowTemplate(selection: AIFlowSelection, intent?: string) {
  if (selection.missing.length)
    throw new Error(`Template ${selection.template.id} needs: ${selection.missing.join(', ')}.`);
  return {
    tool: 'run_script',
    args: {
      source: selection.template.render(selection.slots),
      intent: (intent || selection.template.name).slice(0, 200),
    },
  };
}
