/**
 * "Save as flow" (spec 4.11): turn a run's receipts into a `run_script` body
 * that targets controls by selector (text=/role=/css=) instead of element
 * ids, so the flow replays without the agent in the loop. Pure.
 */
export interface AIFlowTraceStep {
  tool: string;
  args: Record<string, unknown>;
  /** Label and role of the element the step targeted, resolved at run time. */
  label?: string;
  role?: string;
  /** Tab the step returned (new_tab) or acted on. */
  tabId?: string;
  openedTabId?: string;
}

const quote = (value: unknown) => JSON.stringify(String(value ?? ''));

function target(step: AIFlowTraceStep): string | undefined {
  const { args } = step;
  if (typeof args.selector === 'string' && args.selector.trim()) return quote(args.selector.trim());
  if (step.label) {
    if (step.role) return quote(`role=${step.role}[name=${JSON.stringify(step.label)}]`);
    return quote(`text=${step.label}`);
  }
  return undefined;
}

export function aiFlowName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60 || /[\u0000-\u001f/\\]/.test(value))
    throw new Error('name must be 1–60 characters without slashes.');
  return value.trim();
}

export function aiFlowSlug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'flow'
  );
}

/** Render the trace as a script. Values typed into private inputs are never present in a trace. */
export function renderAIFlowScript(steps: AIFlowTraceStep[], options: { name?: string } = {}): string {
  const lines: string[] = [];
  if (options.name) lines.push(`// Flow: ${options.name}`);
  lines.push('const s = await session();', 'let page = s.page();');
  const pages = new Map<string, string>();
  let pageCount = 1;
  const pageFor = (tabId: string | undefined) => (tabId && pages.get(tabId)) || 'page';
  steps.forEach((step) => {
    const { tool, args } = step;
    const page = pageFor(step.tabId);
    const at = target(step);
    const missing = (what: string) => lines.push(`// ${what}: target unavailable in the receipt; add a selector.`);
    switch (tool) {
      case 'navigate':
        lines.push(`await ${page}.goto(${quote(args.url)}${args.waitUntil ? `, { waitUntil: ${quote(args.waitUntil)} }` : ''});`);
        break;
      case 'read_page':
        lines.push(`await ${page}.snapshot();`);
        break;
      case 'click':
      case 'hover':
      case 'double_click': {
        const method = tool === 'click' ? 'click' : tool === 'hover' ? 'hover' : 'doubleClick';
        if (at) lines.push(`await ${page}.${method}(${at});`);
        else missing(method);
        break;
      }
      case 'type':
        if (at) lines.push(`await ${page}.fill(${at}, ${quote(args.text)});`);
        else missing('fill');
        break;
      case 'press_key':
        if (at) lines.push(`await ${page}.press(${at}, ${quote(args.key)});`);
        else lines.push(`await ${page}.press(undefined, ${quote(args.key)});`);
        break;
      case 'select_options':
        if (at) lines.push(`await ${page}.select(${at}, ${JSON.stringify(args.values ?? [])});`);
        else missing('select');
        break;
      case 'scroll':
        lines.push(`await ${page}.scroll(${Number(args.amount) || 600});`);
        break;
      case 'wait_until': {
        const condition = Object.fromEntries(
          Object.entries(args).filter(([key]) => ['url', 'label', 'selector', 'text', 'fn', 'state', 'loadState', 'timeoutMs'].includes(key))
        );
        lines.push(`await ${page}.waitFor(${JSON.stringify(condition)});`);
        break;
      }
      case 'wait_event':
        lines.push(`await ${page}.waitForEvent(${quote(args.event)});`);
        break;
      case 'back':
      case 'forward':
      case 'reload':
        lines.push(`await ${page}.${tool}();`);
        break;
      case 'screenshot':
        lines.push(`await ${page}.screenshot();`);
        break;
      case 'extract_rows':
        lines.push(`await ${page}.extract(${JSON.stringify({ selector: args.selector, columns: args.columns, limit: args.limit })});`);
        break;
      case 'new_tab': {
        pageCount += 1;
        const name = `page${pageCount}`;
        if (step.openedTabId) pages.set(step.openedTabId, name);
        lines.push(`const ${name} = await s.newPage(${quote(args.url)}${args.disposable ? ', { disposable: true }' : ''});`);
        break;
      }
      case 'select_tab':
        lines.push(`page = ${page};`);
        break;
      case 'close_tab':
        lines.push(`await ${page}.close();`);
        break;
      case 'find_element':
        if (at) lines.push(`await ${page}.find(${at});`);
        break;
      case 'list_tabs':
      case 'list_groups':
      case 'get_project':
        break;
      default:
        lines.push(`// ${tool}: not replayable as a script step.`);
    }
  });
  lines.push('return { done: true };');
  return `${lines.join('\n')}\n`;
}

/** A SKILL.md wrapper so a saved flow is discoverable through list_skills. */
export function renderAIFlowSkill(name: string, description: string, script: string) {
  return `---\nname: ${name}\ndescription: ${description || `Replay the recorded flow "${name}" with run_script.`}\n---\nRun this flow with \`run_script\`, passing the script below as \`source\`. Treat it as a starting point: selectors may need updating when the page changes.\n\n\`\`\`js\n${script}\`\`\`\n`;
}
