export const families = {
  project: [
    'get_project',
    'project_files',
    'project_scripts',
    'project_terminal',
  ],
  skills: ['list_skills', 'read_skill'],
  tasks: ['create_task'],
  personal_data: [
    'request_personal_data',
    'search_personal_data',
    'read_personal_data',
    'fill_personal_data',
    'save_personal_data',
    'capture_personal_form',
    'attach_personal_document',
    'list_saved_logins',
    'fill_saved_login',
  ],
  site_customization: [
    'read_site_hooks',
    'configure_site_hooks',
    'find_hook_personal_data',
    'set_page_appearance',
  ],
  downloads: [
    'list_downloads',
    'get_download',
    'control_download',
    'upload_chat_attachment',
    'upload_files',
  ],
  advanced_interaction: [
    'read_options',
    'select_options',
    'extract_rows',
    'screenshot',
    'click_at',
    'hover',
    'double_click',
    'press_key',
    'drag',
    'drag_at',
    'wheel',
    'list_frames',
    'find_element',
  ],
} as const;

export const hints: Record<string, string> = {
  project: 'linked files scripts terminal repository commands',
  skills: 'enabled workflows skills',
  tasks: 'save schedule task reminder',
  personal_data: 'saved information documents login credentials memory',
  site_customization:
    'developer settings customize JavaScript script CSS hooks monitoring appearance notifications',
  downloads: 'download upload attachment files',
  advanced_interaction:
    'extract screenshot frames options pointer keyboard drag hover',
};
export const hookRuntimeGuide =
  'Hook runtime: sandboxed isolated DOM world; no Node.js or website JavaScript globals. Use the after-load stage for DOM interaction. Setup must return within 10 seconds: register timers, video ended listeners or MutationObservers rather than awaiting an endless loop. Ongoing callbacks can run while the document stays loaded. Inspect the actual scroll container; dynamic feeds may require observing new videos. Path filters match at document load, not SPA route changes. Preserve existing hooks; avoid duplicate listeners and debounce outputs. Saving does not start the hook: reload only when the user requested starting it, then read_site_hooks to check errors. A successful setup does not verify later scrolling.';
export const intentBundles = [
  {
    pattern:
      /\b(auto[ -]?scroll|scroll automatically|developer settings|javascript hook|css hook|create.{0,20}hook|watch.{0,30}price|monitor.{0,30}(page|changes))\b/i,
    tools: ['read_site_hooks', 'configure_site_hooks'],
  },
  {
    pattern: /\b(schedule|remind me|save.{0,15}task)\b/i,
    tools: ['create_task'],
  },
  {
    pattern: /\b(record|save).{0,30}(research|findings|note)\b/i,
    tools: ['manage_note'],
  },
];
