import { BrowserWindow, clipboard } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { IApp } from '../types';
import type { AIAccessMode } from '../browser/aiPermissions';
import { aiGroups, scopedAITabs } from '../browser/aiGroups';
import { loginProfileKey } from '../utils/groups';
import {
  AISessionIdentity,
  aiTabSearchQuery,
  findAITabs,
} from '../browser/aiTabSearch';
import {
  AIFlowTraceStep,
  aiFlowName,
  aiFlowSlug,
  renderAIFlowScript,
  renderAIFlowSkill,
} from '../browser/aiFlowRecorder';
import type { AIRunConsent } from '../browser/aiRunConsent';
import type { AISkillsStore } from './aiSkills';
import { tabOrigins } from './aiSessionIdentity';
import { getBrowserPreferences } from './preferences';
import { readWorkspaceManifest, writeWorkspaceManifest } from './workspaceManifest';
import { WORKSPACE_MANIFEST_VERSION } from '../browser/workspaceManifest';

export const AI_CLIPBOARD_MAX_CHARS = 20000;

export interface AISessionToolsContext {
  host: BrowserWindow;
  signal: AbortSignal;
  name: 'find_tabs' | 'switch_group' | 'save_flow' | 'read_clipboard';
  args: Record<string, unknown>;
  tabs: () => IApp[];
  focused: () => string | undefined;
  groupId: string | null;
  mode: AIAccessMode;
  check: () => void;
  /** Signed-in origins for one partition (names only); cached by the caller. */
  sessionsFor: (member: IApp, origins: string[]) => Promise<AISessionIdentity[]>;
  activeRun?: { consent: AIRunConsent };
  setScope: (groupId: string) => void;
  /** The last completed run's steps, for save_flow from "last-run". */
  lastRunTrace?: AIFlowTraceStep[];
  skills?: AISkillsStore;
  /** The scope group's linked project folder, if any. */
  folder?: string;
  /** Native review; `privateData` routes through the saved-data review path. */
  review: (
    message: string,
    detail: string,
    options: { privateData?: boolean; technicalDetail?: string; button: string }
  ) => Promise<boolean>;
}

/** Signed-in identities for every partition among the given tabs. */
export async function sessionsByProfile(
  tabs: IApp[],
  sessionsFor: AISessionToolsContext['sessionsFor']
): Promise<(tab: IApp) => AISessionIdentity[]> {
  const byProfile = new Map<string, IApp[]>();
  tabs.forEach((tab) => {
    if (tab.archived) return;
    const profile = loginProfileKey(tab);
    byProfile.set(profile, [...(byProfile.get(profile) || []), tab]);
  });
  const identities = new Map<string, AISessionIdentity[]>();
  await Promise.all(
    [...byProfile.entries()].map(async ([profile, members]) => {
      try {
        identities.set(profile, await sessionsFor(members[0], tabOrigins(members)));
      } catch {
        identities.set(profile, []);
      }
    })
  );
  return (tab) => identities.get(loginProfileKey(tab)) || [];
}

function traceFromArgs(value: unknown): AIFlowTraceStep[] {
  if (!Array.isArray(value) || !value.length || value.length > 200)
    throw new Error('receipts must list 1–200 steps.');
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`Step ${index + 1} must be an object.`);
    const step = entry as Record<string, unknown>;
    if (typeof step.tool !== 'string' || !/^[a-z_]{1,40}$/.test(step.tool))
      throw new Error(`Step ${index + 1} needs a tool name.`);
    const args = step.args && typeof step.args === 'object' && !Array.isArray(step.args) ? (step.args as Record<string, unknown>) : {};
    return {
      tool: step.tool,
      args,
      ...(typeof step.label === 'string' ? { label: step.label.slice(0, 200) } : {}),
      ...(typeof step.role === 'string' ? { role: step.role.slice(0, 40) } : {}),
      ...(typeof step.tabId === 'string' ? { tabId: step.tabId } : {}),
    };
  });
}

function writeAtomic(file: string, contents: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

export async function aiSessionTool(context: AISessionToolsContext): Promise<unknown> {
  const { name, args } = context;
  context.check();
  if (name === 'find_tabs') {
    const query = aiTabSearchQuery(args);
    const tabs = scopedAITabs(context.tabs(), context.groupId);
    const sessions = await sessionsByProfile(tabs, context.sessionsFor);
    context.check();
    return findAITabs(tabs, query, { focused: context.focused(), sessions });
  }
  if (name === 'switch_group') {
    if (typeof args.groupId !== 'string' || !args.groupId) throw new Error('groupId is required.');
    const target = aiGroups(context.tabs()).find((group) => group.id === args.groupId);
    if (!target) throw new Error('Group is unavailable.');
    const declared = context.activeRun?.consent.allowsGroup(target.id) === true;
    if (!declared && context.mode !== 'full')
      throw new Error(
        context.activeRun
          ? `This run did not declare group “${target.name}”. Declare it in groups or use set_scope outside the run.`
          : 'switch_group works inside a run that declared groups; use set_scope otherwise.'
      );
    context.setScope(target.id);
    return { groupId: target.id, name: target.name, changed: true };
  }
  if (name === 'read_clipboard') {
    const approved = await context.review(
      'Let AI read the clipboard?',
      'The clipboard may hold passwords or private text. The content goes to the AI only if you allow it.',
      { privateData: true, button: 'Read clipboard' }
    );
    if (!approved) throw new Error('User declined clipboard access. Do not retry this action.');
    const text = await clipboard.readText();
    return {
      text: text.slice(0, AI_CLIPBOARD_MAX_CHARS),
      truncated: text.length > AI_CLIPBOARD_MAX_CHARS,
      length: text.length,
    };
  }
  // save_flow
  const flowName = aiFlowName(args.name);
  const from = args.from === undefined ? 'last-run' : args.from;
  if (from !== 'last-run' && from !== 'receipts') throw new Error('from must be last-run or receipts.');
  const steps = from === 'receipts' ? traceFromArgs(args.receipts) : context.lastRunTrace;
  if (!steps?.length) throw new Error('No completed run to save yet. Run act or run_script first, or pass receipts.');
  const destination = args.flowDestination === undefined ? 'skill' : args.flowDestination;
  if (destination !== 'skill' && destination !== 'project') throw new Error('flowDestination must be skill or project.');
  const description =
    typeof args.description === 'string' ? args.description.trim().slice(0, 300) : '';
  const script = renderAIFlowScript(steps, { name: flowName });
  if (destination === 'project' && !context.folder)
    throw new Error('No project folder is linked to this group; save the flow as a skill instead.');
  if (destination === 'skill' && !context.skills) throw new Error('Skills are unavailable.');
  const where =
    destination === 'skill'
      ? 'Saved as a group skill (list_skills).'
      : `Saved under ${path.join(context.folder!, '.kudium', 'flows', aiFlowSlug(flowName))} and listed in kudium.workspace.json.`;
  const approved = await context.review(
    `Save flow “${flowName}”?`,
    `${steps.length} recorded step${steps.length === 1 ? '' : 's'} become a replayable script. Review it before saving; it runs only when an agent calls run_script with it later, with the usual approvals.\n\n${where}`,
    { technicalDetail: script, button: 'Save flow' }
  );
  if (!approved) throw new Error('User declined saving the flow. Do not retry this action.');
  const instructions = renderAIFlowSkill(flowName, description, script);
  if (destination === 'skill') {
    const id = randomUUID();
    context.skills!.add({
      id,
      name: flowName,
      description: description || `Replay the recorded flow "${flowName}" with run_script.`,
      enabled: true,
      instructions,
      resources: { 'flow.js': script },
    });
    return { saved: true, destination, skillId: id, steps: steps.length, script };
  }
  const slug = aiFlowSlug(flowName);
  const folder = context.folder!;
  const file = path.join(folder, '.kudium', 'flows', slug, 'SKILL.md');
  writeAtomic(file, instructions);
  const relative = path.posix.join('.kudium', 'flows', slug);
  const notes: string[] = [];
  if (getBrowserPreferences().writeBrowserInstructions) {
    try {
      const manifest = readWorkspaceManifest(folder) || { version: WORKSPACE_MANIFEST_VERSION };
      const skills = manifest.skills || [];
      if (!skills.includes(relative)) writeWorkspaceManifest(folder, { ...manifest, skills: [...skills, relative] });
    } catch (error) {
      notes.push(`kudium.workspace.json was not updated: ${(error as Error).message}`);
    }
  } else notes.push('kudium.workspace.json was not updated: "Keep browser context in linked projects" is off.');
  return { saved: true, destination, path: file, skillId: `project:${relative}`, steps: steps.length, script, notes };
}
