import type { AIThinking } from './aiThinking';
export interface AISettings {
  endpoint: string;
  model: string;
  hasKey: boolean;
  remembered: boolean;
  thinking?: AIThinking;
}
export interface AIUsage {
  /** Local schema characters, not provider-reported tokens. */
  toolSchemaCharacters?: number;
  toolDiscoveryCalls?: number;
  toolDiscoveryMisses?: number;
  requestAttempts?: number;
  streamingFallbacks?: number;
  requestsWithUsage?: number;
  firstTextMs?: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  durationMs: number;
  toolCalls: number;
  usageReported: boolean;
}
export interface AIExecution {
  incomplete: boolean;
  pendingActions: number;
  observations: number;
  applied: number;
  verifiedWrites: number;
  startedCommands: number;
  reviewedCommands: number;
  successfulCommands?: number;
  failedCommands?: number;
  unfinishedCommands?: number;
  errors: number;
}
export interface AIEvent {
  feedbackId?: string;
  suggestions?: string[];
  execution?: AIExecution;
  usage?: AIUsage;
  workingTabIds?: string[];
  source?: 'external';
  tabId?: string;
  active?: boolean;
  resumable?: boolean;
  type:
    | 'status'
    | 'partial'
    | 'message'
    | 'error'
    | 'handoff'
    | 'done'
    | 'activity'
    | 'feedback';
  contextNotice?: string;
  text: string;
}

export interface AITaskStatus {
  workingTabIds?: string[];
  activeTabId?: string;
  feedbackId?: string;
  busy: boolean;
  resumable: boolean;
  reason?: string;
  history?: Array<AIEvent | { type: 'user'; text: string }>;
}
export const AI_DEFAULTS = {
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4.1',
};
export const AI_PROJECT_TOOLS = [
  'get_project',
  'project_files',
  'project_scripts',
  'project_terminal',
] as const;
export type AIProjectTool = (typeof AI_PROJECT_TOOLS)[number];
export const AI_TOOLS = [
  'list_skills',
  'read_skill',
  ...AI_PROJECT_TOOLS,
  'request_user_feedback',
  'request_personal_data',
  'read_site_hooks',
  'configure_site_hooks',
  'find_hook_personal_data',
  'search_personal_data',
  'read_personal_data',
  'fill_personal_data',
  'save_personal_data',
  'manage_note',
  'create_activity',
  'capture_personal_form',
  'attach_personal_document',
  'upload_chat_attachment',

  'list_saved_logins',
  'fill_saved_login',
  'get_access',
  'request_access',
  'list_groups',
  'set_scope',
  'resolve_reference',
  'create_task',
  'hand_off',
  'resume_control',
  'set_page_appearance',
  'read_page',
  'read_options',
  'extract_rows',
  'screenshot',
  'handle_dialog',
  'list_tabs',
  'create_group',
  'new_tab',
  'select_tab',
  'navigate',
  'click',
  'click_at',
  'type',
  'select_options',
  'upload_files',
  'list_downloads',
  'get_download',
  'control_download',
  'scroll',
  'back',
  'forward',
  'reload',
  'hover',
  'double_click',
  'press_key',
  'wait_until',
  'drag',
  'drag_at',
  'wheel',
  'list_frames',
  'find_element',
  'close_tab',
] as const;
export type AITool = (typeof AI_TOOLS)[number];
export function aiURL(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A URL is required.');
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      'Only HTTP and HTTPS URLs without credentials are supported.'
    );
  return url.href;
}

/** Provider credentials and conversations require TLS outside local models. */
export function aiProviderURL(value: unknown): string {
  const url = new URL(aiURL(value));
  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error(
      'AI providers require HTTPS. HTTP is supported only on localhost, 127.0.0.1, or ::1 for local models.'
    );
  return url.href;
}
