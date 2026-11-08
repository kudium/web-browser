import { aiProviderTools } from '../browser/aiToolSchemas';
import { AI_TASK_MEMORY_TOOL } from '../browser/aiTaskMemory';

const families = {
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

const discovery = {
  type: 'function',
  function: {
    name: 'discover_tools',
    description:
      'Load tools on demand. project: linked files/scripts/terminal; skills: enabled workflows; tasks: saved/scheduled tasks; personal_data: saved data, documents and login; site_customization: appearance and persistent hooks; downloads: downloads/uploads; advanced_interaction: extraction, screenshots, frames, options, pointer/keyboard/drag. Loading tools grants no access or approval.',
    parameters: {
      type: 'object',
      properties: { family: { type: 'string', enum: Object.keys(families) } },
      required: ['family'],
      additionalProperties: false,
    },
  },
};

/** A provider-neutral alternative to provider-specific deferred tool schemas. */
export class AIToolCatalog {
  private all = aiProviderTools();

  private loaded = new Set<string>(
    this.all
      .filter(
        (tool) =>
          !Object.values(families).some((names) =>
            (names as readonly string[]).includes(tool.function.name)
          )
      )
      .map((tool) => tool.function.name)
  );

  constructor(messages: any[] = []) {
    // Restore discovery and previously used definitions after pause/restart.
    messages.forEach((message) =>
      message.tool_calls?.forEach((call: any) => {
        if (call.function?.name === 'discover_tools') {
          try {
            this.load(JSON.parse(call.function.arguments).family);
          } catch {
            /* Invalid calls remain recoverable tool errors. */
          }
        } else if (
          this.all.some((tool) => tool.function.name === call.function?.name)
        ) {
          this.loaded.add(call.function.name);
        }
      })
    );
  }

  tools() {
    return [
      discovery,
      AI_TASK_MEMORY_TOOL,
      ...this.all.filter((tool) => this.loaded.has(tool.function.name)),
    ];
  }

  has(name: string) {
    return (
      name === 'discover_tools' ||
      name === 'update_task_memory' ||
      this.loaded.has(name)
    );
  }

  load(family: unknown) {
    if (
      typeof family !== 'string' ||
      !Object.prototype.hasOwnProperty.call(families, family)
    )
      throw new Error('Choose a supported tool family.');
    const names = families[family as keyof typeof families];
    names.forEach((name) => this.loaded.add(name));
    return {
      family,
      loaded: names,
      instruction:
        'These tools are now callable. Existing access scope and review rules still apply.',
    };
  }
}
