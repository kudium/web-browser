import { AITool } from './ai';

export const AI_ACCESS_MODES = [
  { id: 'ask', name: 'Ask first', detail: 'Approve each browser action.' },
  {
    id: 'standard',
    name: 'Standard',
    detail:
      'Browse and read automatically; review page interactions, data entry and new website destinations.',
  },
  {
    id: 'full',
    name: 'Full access',
    detail:
      'Automatically approve supported actions in scope. Actions after saved-data disclosure still need review.',
  },
] as const;
export type AIAccessMode = (typeof AI_ACCESS_MODES)[number]['id'];
export interface AIAccessStatus {
  mode: AIAccessMode;
  effectiveMode: AIAccessMode;
  taskOnly: boolean;
}
export function aiAccessMode(value: unknown): AIAccessMode {
  if (value !== 'ask' && value !== 'standard' && value !== 'full')
    throw new Error('Choose Ask first, Standard or Full access.');
  return value;
}

/** Read only the leading direct user instruction, never page/tool/model text. */
export function userTaskAccess(prompt: string): AIAccessMode | undefined {
  const match =
    /^(?:please\s+)?(?:use|enable|grant(?: you)?|i grant you|i give you|you have)\s+(full access|full control|standard(?: access)?|ask first)(?:\s+for (?:this|the) task)?(?:[.!:,;]|$)/i.exec(
      prompt.trim()
    );
  if (match) {
    if (/^full/i.test(match[1])) return 'full';
    return /^standard/i.test(match[1]) ? 'standard' : 'ask';
  }
  if (
    /^(?:please\s+)?you (?:can|may) do anything(?:\s+for (?:this|the) task)?(?:[.!:,;]|$)/i.test(
      prompt.trim()
    )
  )
    return 'full';
  return undefined;
}

export function requiresAIApproval(
  mode: AIAccessMode,
  tool: AITool,
  safeInteraction = false
) {
  if (mode === 'full') return false;
  if (mode === 'ask') return true;
  if (
    [
      'new_tab',
      'select_tab',
      'navigate',
      'back',
      'forward',
      'reload',
      'scroll',
      'hover',
      'wheel',
      'set_page_appearance',
    ].includes(tool)
  )
    return false;
  // Page labels and native control types cannot prove that their handlers are
  // harmless. Heuristic safeInteraction hints never grant action authority.
  return true;
}

export function requiresAINavigationApproval(
  mode: AIAccessMode,
  source: string,
  destination: string
) {
  if (mode === 'full') return false;
  if (mode === 'ask') return true;
  try {
    const from = new URL(source);
    const to = new URL(destination);
    return (
      !['http:', 'https:'].includes(from.protocol) || from.origin !== to.origin
    );
  } catch {
    return true;
  }
}

/** Local view changes do not send saved context to a website. */
export function requiresAIPrivateReview(tool: AITool): boolean {
  return !['select_tab', 'scroll', 'wheel', 'set_page_appearance'].includes(
    tool
  );
}
