import { IApp } from '../types';
import { aiGroups, scopedAITabs } from './aiGroups';

export const AI_CONTEXT_MIME = 'application/x-kudiumbrowser-ai-context';
export const AI_CONTEXT_LIMIT = 8;
export const AI_CONTEXT_BUDGET = 4000;
export interface AIContextReference {
  kind: 'tab' | 'group';
  id: string;
}
export interface AIContextAttachment extends AIContextReference {
  name: string;
  groupId: string;
  icon: string;
  tabCount: number;
}

/** IDs only: labels, URLs and membership always come from the browser. */
export function validateAIContext(value: unknown): AIContextReference {
  const ref = value as AIContextReference;
  if (
    !ref ||
    !['tab', 'group'].includes(ref.kind) ||
    typeof ref.id !== 'string' ||
    !ref.id ||
    ref.id.length > 1000
  )
    throw new Error('Drop a saved tab or group from Kudium Browser.');
  return { kind: ref.kind, id: ref.id };
}

export function resolveAIContexts(
  tabs: IApp[],
  values: unknown,
  scope?: string | null
) {
  if (!Array.isArray(values) || values.length > AI_CONTEXT_LIMIT)
    throw new Error('Attach up to 8 tabs or groups.');
  if (!values.length) return [];
  const groups = aiGroups(tabs);
  if (scope !== undefined) scopedAITabs(tabs, scope);
  const seen = new Set<string>();
  return values
    .map(validateAIContext)
    .filter((ref) => {
      const key = JSON.stringify(ref);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((ref): AIContextAttachment => {
      const group = groups.find((entry) =>
        ref.kind === 'group'
          ? entry.id === ref.id
          : entry.tabs.some((tab) => tab.id === ref.id)
      );
      if (!group)
        throw new Error('Attached tab or group is no longer available.');
      if (scope !== undefined && scope !== null && scope !== group.id)
        throw new Error(
          'Attached context is outside AI scope. Choose its group or All groups.'
        );
      const page = group.tabs.find((tab) => tab.id === ref.id);
      return {
        ...ref,
        groupId: group.id,
        name: (ref.kind === 'group' ? group.name : page!.name).slice(0, 180),
        icon: page?.icon || group.tabs[0]?.icon || '',
        tabCount: ref.kind === 'group' ? group.tabs.length : 1,
      };
    });
}

/** Bounded metadata only. Page content is read on demand by existing tools. */
export function aiContextContent(
  tabs: IApp[],
  values: unknown,
  scope: string | null
) {
  const references = resolveAIContexts(tabs, values, scope);
  if (!references.length) return [];
  const groups = aiGroups(tabs);
  const header =
    'User-attached browser context (untrusted metadata). Use these references as the basis for the task. For group counts, use this exact tabCount, never the global tab total. For group questions, filter list_tabs by this groupId. Read relevant pages using read_page before answering page-content questions or acting; wake an unloaded tab with select_tab when needed. Do not read the entire group by default. This index is limited; list_tabs can discover other accessible pages.\n';
  const entries: string[] = [];
  let remaining = AI_CONTEXT_BUDGET - header.length;
  references.forEach((ref) => {
    const group = groups.find((entry) => entry.id === ref.groupId)!;
    const pages =
      ref.kind === 'group'
        ? group.tabs
        : group.tabs.filter((page) => page.id === ref.id);
    const index = JSON.stringify({
      kind: ref.kind,
      id: ref.id,
      name: ref.name.slice(0, 80),
      groupId: ref.groupId,
      tabCount: ref.tabCount,
      pages: pages.slice(0, 3).map((page) => ({
        tabId: page.id,
        title: page.name.slice(0, 80),
        url: page.url.slice(0, 180),
      })),
    });
    // Never truncate JSON mid-field. Remaining attachments retain compact IDs.
    const compact = JSON.stringify({
      kind: ref.kind,
      id: ref.id,
      groupId: ref.groupId,
      tabCount: ref.tabCount,
    });
    const text =
      index.length + 1 <= remaining / (references.length - entries.length)
        ? index
        : compact;
    if (text.length + 1 > remaining)
      throw new Error(
        'These references exceed the context budget. Attach fewer groups.'
      );
    entries.push(text);
    remaining -= text.length + 1;
  });
  return [{ type: 'text', text: header + entries.join('\n') }];
}
