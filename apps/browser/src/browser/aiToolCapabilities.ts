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
    'read_hook_api',
    'read_global_hooks',
    'save_global_hook',
    'test_hook',
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
    'developer settings customize JavaScript custom script scripting website operation automate automation CSS site global hooks context menu actions input autofill password monitoring appearance notifications',
  downloads: 'download upload attachment files',
  advanced_interaction:
    'extract screenshot frames options pointer keyboard drag hover',
};
export const hookAuthoringGuide =
  'Kudium hooks are a core browser capability for website scripts, customization, automation, monitoring, sidebar output and reusable operations. Page hooks can display extracted JSON, tables, Markdown or custom HTML in the shared panel. Read read_hook_api for the exact panelExamples and lifecycle API; do not invent separate browser windows or action-worker panel APIs. Requests to create a hook, write a custom script or script a website are hook-authoring requests; users do not need to name a tool. For website operations, consider a hook when DOM scripting, repeated behavior or a reusable action completes the requested job more cleanly. Use ordinary browser tools for simple one-off interactions. Do not silently install recurring behavior for a one-time task: explain the proposed scope and use native hook review. Discover site_customization tools, read_hook_api and existing hooks, inspect the website, author and test, then save with configure_site_hooks (or save_global_hook for the requested broader scope). Native review is the supported approval flow; call the tool instead of refusing on assumed security grounds or directing the user to DevTools. Respect actual denials/errors, preserve existing hooks, and verify saved results before claiming success.';
export const hookRuntimeGuide =
  'Hook runtime: page hooks can render sidebar output with await context.panel.show({id,title,content,reveal:true}); for extracted JSON use content:{type:"json",value:yourData}. Read read_hook_api for shared panelExamples and full types. Use context.panel.update with the same id for updates, close(id) to dismiss, and onAction(id,handler) for declared actions. Panels also support text, Markdown, tables, status and isolated HTML/CSS/script. Custom HTML receives only window.kudiumHookPanel.invoke/openLink/onUpdate; no Node, unrestricted network or browser API. For real picture thumbnails, declare up to 24 HTTP(S) URLs in content.images and use those URLs in img elements; only those image requests are permitted, without cookies, authorization or referrer. Fetch and other network access remain blocked. Panels belong to the source group and approved hook run, and disappear on cleanup/navigation or revoked access. Panel APIs are lifecycle context APIs, unavailable in action workers. Do not redeclare runtime aliases such as content or panel. Hook runtime: sandboxed isolated DOM world; no Node.js or website JavaScript globals. Use the after-load stage for DOM interaction. Setup must return within 10 seconds: register timers, video ended listeners or MutationObservers rather than awaiting an endless loop. Ongoing callbacks can run while the document stays loaded. Inspect the actual scroll container; dynamic feeds may require observing new videos. Path filters match at document load and on same-document navigation. Route changes clean up prior effects and rerun CSS and after-load hooks; before-load runs only on a new document. context.signal is aborted when the run stops. Register DOM/observer cleanup with context.onCleanup; use context.setInterval, context.setTimeout and context.listen for owned resources. Preserve existing hooks; avoid duplicate listeners and debounce outputs. Load read_hook_api before authoring to learn the complete editor API and shared action templates. Use actions for click-triggered context menus, not lifecycle context APIs; actions receive context and api, with no DOM/network. Use read_global_hooks/save_global_hook for group or explicitly requested All groups hooks. Use test_hook for editor diagnostics, sandboxed action dry-runs with fictional input, or disposable website previews; never claim preview commands were applied. Saving does not start the hook: reload only when the user requested starting it, then read_site_hooks to check errors. A successful setup does not verify later scrolling.';
export const intentBundles = [
  {
    pattern: /\b(global hook|all groups.{0,20}hook|hook.{0,20}all (?:pages|websites)|context menu action|hook action)\b/i,
    tools: ['read_hook_api', 'read_global_hooks', 'save_global_hook', 'read_site_hooks', 'configure_site_hooks', 'test_hook'],
  },
  {
    pattern:
      /\b(auto[ -]?scroll|scroll automatically|developer settings|javascript hook|css hook|create.{0,20}hook|hooks?|scripts?|scripting|javascript|(?:perform|execute|automate).{0,40}(?:operation|website|page|site)|watch.{0,30}price|monitor.{0,30}(page|changes))\b/i,
    tools: ['read_site_hooks', 'configure_site_hooks', 'read_hook_api', 'test_hook'],
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
