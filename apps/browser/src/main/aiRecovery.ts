import type { AITool } from '../browser/ai';

const pageActions: readonly AITool[] = [
  'configure_site_hooks',
  'set_page_appearance',
  'navigate',
  'click',
  'click_at',
  'type',
  'select_options',
  'upload_files',
  'upload_chat_attachment',
  'scroll',
  'back',
  'forward',
  'reload',
  'hover',
  'double_click',
  'press_key',
  'drag',
  'drag_at',
  'wheel',
];
const observations: readonly AITool[] = [
  'read_site_hooks',
  'find_hook_personal_data',
  'create_task',
  'hand_off',
  'resume_control',
  'screenshot',
  'list_tabs',
  'read_page',
  'read_options',
  'extract_rows',
  'list_frames',
  'find_element',
  'wait_until',
  'list_downloads',
  'get_download',
];

/** A resumed model must obtain fresh observations before using old targets. */
export class AIRecoveryObservation {
  private listed = false;

  private pages = new Set<string>();

  check(name: AITool, tabId?: string) {
    if (!observations.includes(name) && !this.listed)
      throw new Error('Task resumed: call list_tabs before another action.');
    if (pageActions.includes(name) && (!tabId || !this.pages.has(tabId)))
      throw new Error(
        'Task resumed: read_page for this tab before interacting.'
      );
  }

  completed(name: AITool, tabId?: string) {
    if (name === 'list_tabs') this.listed = true;
    if ((name === 'read_page' || name === 'wait_until') && tabId)
      this.pages.add(tabId);
    // A document-changing action consumes the observation for that tab.
    if (
      tabId &&
      ['navigate', 'back', 'forward', 'reload', 'close_tab'].includes(name)
    )
      this.pages.delete(tabId);
  }
}
