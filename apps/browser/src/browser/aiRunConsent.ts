import type { AITool } from './ai';
import { aiOrigin } from './aiTaint';

/** Action classes a run declares; the consent dialog lists exactly these. */
export const AI_ACTION_CLASSES = [
  'read',
  'interact',
  'type',
  'submit',
  'navigate',
  'navigate-cross-origin',
  'upload',
  'download',
  'close-tab',
  'saved-data',
  'project-read',
  'project-write',
  'shell',
  'scope',
] as const;
export type AIActionClass = (typeof AI_ACTION_CLASSES)[number];

const classes: Partial<Record<AITool, AIActionClass>> = {
  read_page: 'read',
  wait_until: 'read',
  find_element: 'read',
  extract_rows: 'read',
  read_options: 'read',
  screenshot: 'read',
  list_frames: 'read',
  wait_event: 'read',
  list_tabs: 'read',
  list_groups: 'read',
  resolve_reference: 'read',
  get_access: 'read',
  list_downloads: 'read',
  get_download: 'read',
  list_skills: 'read',
  read_skill: 'read',
  click: 'interact',
  double_click: 'interact',
  hover: 'interact',
  click_at: 'interact',
  drag: 'interact',
  drag_at: 'interact',
  wheel: 'interact',
  scroll: 'interact',
  press_key: 'interact',
  select_options: 'interact',
  handle_dialog: 'interact',
  set_page_appearance: 'interact',
  type: 'type',
  navigate: 'navigate',
  back: 'navigate',
  forward: 'navigate',
  reload: 'navigate',
  new_tab: 'navigate',
  select_tab: 'navigate',
  create_group: 'navigate',
  upload_files: 'upload',
  upload_chat_attachment: 'upload',
  control_download: 'download',
  close_tab: 'close-tab',
  fill_saved_login: 'saved-data',
  fill_personal_data: 'saved-data',
  search_personal_data: 'saved-data',
  read_personal_data: 'saved-data',
  list_saved_logins: 'saved-data',
  list_autofill_data: 'saved-data',
  create_email_alias: 'saved-data',
  create_todo: 'saved-data',
  list_email_aliases: 'saved-data',
  wait_for_email: 'read',
  get_email_context: 'read',
  get_project: 'project-read',
  project_files: 'project-write',
  project_scripts: 'shell',
  project_terminal: 'shell',
  set_scope: 'scope',
  request_access: 'scope',
};

export function aiActionClass(tool: string): AIActionClass | undefined {
  return classes[tool as AITool];
}

/**
 * Reviewed in Ask first and Standard even inside a consented run; automatic in
 * Full access. These spend credentials, files or user tabs.
 */
export function aiSensitiveAction(
  tool: string,
  context: { userTab?: boolean; crossOriginPost?: boolean } = {}
): boolean {
  if (['fill_saved_login', 'upload_files', 'upload_chat_attachment'].includes(tool))
    return true;
  if (tool === 'close_tab') return context.userTab !== false;
  if (tool === 'project_terminal' || tool === 'project_scripts') return true;
  if (tool === 'navigate' && context.crossOriginPost) return true;
  return false;
}

/**
 * Reviewed in every mode unless the group is trusted: money, credentials and
 * the sandbox boundary. One table, one test file.
 */
export function aiHardFloor(
  tool: string,
  context: { payment?: boolean; outsideProject?: boolean } = {}
): boolean {
  if (tool === 'request_access' || tool === 'set_scope') return true;
  if (tool === 'fill_personal_data' && context.payment) return true;
  if (tool === 'upload_files' && context.outsideProject) return true;
  return false;
}

export interface AIRunScope {
  classes: AIActionClass[];
  origins: string[];
  /** Groups the run may switch to (spec 4.13); the single consent lists them. */
  groups?: string[];
}

/** Static scope of an act step list: its tool classes and literal destinations. */
export function inferActScope(
  steps: { tool: string; args: Record<string, unknown> }[],
  currentOrigin?: string
): AIRunScope {
  const classSet = new Set<AIActionClass>();
  const origins = new Set<string>();
  if (currentOrigin) origins.add(currentOrigin);
  steps.forEach((step) => {
    const actionClass = aiActionClass(step.tool);
    if (actionClass) classSet.add(actionClass);
    const origin = aiOrigin(step.args.url);
    if (origin) origins.add(origin);
  });
  if (classSet.has('navigate') && origins.size > 1) classSet.add('navigate-cross-origin');
  return { classes: [...classSet], origins: [...origins] };
}

const scriptMethods: [RegExp, AIActionClass][] = [
  [/\.(?:snapshot|waitFor|find|extract|screenshot)\s*\(/, 'read'],
  [/\.(?:click|doubleClick|hover|press|select|scroll|dialog)\s*\(/, 'interact'],
  [/\.fill\s*\(/, 'type'],
  [/\.(?:goto|back|forward|reload)\s*\(|\.newPage\s*\(|\.selectTab\s*\(/, 'navigate'],
  [/\.upload\s*\(/, 'upload'],
  [/\.close\s*\(/, 'close-tab'],
  [/savedLogin/, 'saved-data'],
];

/** Static scope of a script: Page API methods used and literal URLs. */
export function inferScriptScope(source: string, currentOrigin?: string): AIRunScope {
  const classSet = new Set<AIActionClass>();
  const origins = new Set<string>();
  if (currentOrigin) origins.add(currentOrigin);
  scriptMethods.forEach(([pattern, actionClass]) => {
    if (pattern.test(source)) classSet.add(actionClass);
  });
  const urls = source.match(/https?:\/\/[^\s'"`)]+/g) || [];
  urls.forEach((url) => {
    const origin = aiOrigin(url);
    if (origin) origins.add(origin);
  });
  if (classSet.has('navigate') && origins.size > 1) classSet.add('navigate-cross-origin');
  // A script that reads and acts was written to submit forms more often than not.
  if (classSet.has('type') && classSet.has('interact')) classSet.add('submit');
  return { classes: [...classSet], origins: [...origins] };
}

/** One consent per run: what the human approved, plus answers remembered mid-run. */
/** Action classes Standard mode already performs without a prompt. */
export const AI_RUN_SILENT_CLASSES: readonly AIActionClass[] = ['read', 'navigate', 'project-read'];

/**
 * Does a run need the single up-front consent? Only in Standard mode, and
 * only when it declares something Standard would review on its own: a run
 * that reads, navigates within the site and reads project files adds no
 * dialog, because none of its steps would have asked individually.
 */
export function aiRunNeedsConsent(mode: 'ask' | 'standard' | 'full', scope: AIRunScope): boolean {
  if (mode !== 'standard') return false;
  return scope.classes.some((actionClass) => !AI_RUN_SILENT_CLASSES.includes(actionClass));
}

export class AIRunConsent {
  private readonly classes = new Set<AIActionClass>();

  private readonly origins = new Set<string>();

  private readonly groups = new Set<string>();

  /** Remembered (class, origin) answers for prompts that happened during the run. */
  private readonly remembered = new Set<string>();

  constructor(
    readonly intent: string,
    scope: AIRunScope,
    readonly mode: 'ask' | 'standard' | 'full'
  ) {
    scope.classes.forEach((actionClass) => this.classes.add(actionClass));
    scope.origins.forEach((origin) => this.origins.add(origin.toLowerCase()));
    (scope.groups || []).forEach((group) => this.groups.add(group));
  }

  /** A scope switch inside the declared groups needs no second dialog. */
  allowsGroup(groupId: string): boolean {
    return this.groups.has(groupId);
  }

  get declaredGroups(): string[] {
    return [...this.groups];
  }

  get scope(): AIRunScope {
    return {
      classes: [...this.classes],
      origins: [...this.origins],
      ...(this.groups.size ? { groups: [...this.groups] } : {}),
    };
  }

  /** Did the single run consent (or a remembered answer) already cover this? */
  covers(actionClass: AIActionClass | undefined, origin: string | undefined): boolean {
    if (this.mode !== 'standard') return false;
    if (!actionClass) return false;
    const key = `${actionClass}@${(origin || '').toLowerCase()}`;
    if (this.remembered.has(key)) return true;
    if (!this.classes.has(actionClass)) return false;
    return !origin || this.origins.has(origin.toLowerCase());
  }

  remember(actionClass: AIActionClass | undefined, origin: string | undefined) {
    if (!actionClass) return;
    this.remembered.add(`${actionClass}@${(origin || '').toLowerCase()}`);
  }

  /** Dialog text listing exactly what the run declared. */
  describe(): string {
    const classes = [...this.classes].join(', ') || 'read only';
    const origins = [...this.origins].join('\n') || 'the current page';
    const groups = this.groups.size ? `\nGroups: ${[...this.groups].join(', ')}` : '';
    return `Actions: ${classes}\nWebsites:\n${origins}${groups}`;
  }
}
