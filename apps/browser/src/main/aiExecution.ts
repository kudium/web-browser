import type { AIExecution } from '../browser/ai';

const effects = new Set([
  'create_task',
  'configure_site_hooks',
  'save_global_hook',
  'set_page_appearance',
  'create_group',
  'new_tab',
  'select_tab',
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
  'close_tab',
  'handle_dialog',
  'fill_personal_data',
  'fill_saved_login',
  'save_personal_data',
  'manage_note',
  'create_activity',
  'control_download',
]);

/**
 * These are receipts for tool execution, not a model's claim that a task
 * succeeded.
 */
export class AIExecutionTracker {
  private value: AIExecution = {
    incomplete: false,
    pendingActions: 0,
    observations: 0,
    applied: 0,
    verifiedWrites: 0,
    startedCommands: 0,
    reviewedCommands: 0,
    errors: 0,
  };

  private commands = new Set<string>();

  private reviewed = new Set<string>();

  private commandIds = new Map<string, string>();

  private successful = new Set<string>();

  private failedCommands = new Set<string>();

  private lastFailed = false;

  private pendingDialogs = new Set<string>();

  constructor(messages: any[] = []) {
    const calls = new Map<string, any>();
    messages.forEach((message) => {
      message.tool_calls?.forEach((call: any) => calls.set(call.id, call));
      if (message.role !== 'tool') return;
      const call = calls.get(message.tool_call_id);
      if (!call) return;
      try {
        this.record(
          call.function.name,
          JSON.parse(call.function.arguments),
          JSON.parse(message.content)
        );
      } catch {
        /* Non-JSON observations do not contain command receipts. */
      }
    });
  }

  record(name: string, args: any, output: any) {
    this.lastFailed = !!output?.error || output?.ok === false;
    if (this.lastFailed) {
      this.value.errors += 1;
      return;
    }
    if (name === 'handle_dialog' && typeof args.dialogId === 'string')
      this.pendingDialogs.delete(args.dialogId);
    if (output?.pending && typeof output?.dialog?.id === 'string') {
      this.pendingDialogs.add(output.dialog.id);
      return;
    }
    if (
      (name === 'project_terminal' && args.terminalAction === 'run') ||
      (name === 'project_scripts' && args.scriptRequest?.action === 'run')
    ) {
      const id = output?.terminal?.selected;
      if (typeof id === 'string') {
        this.commands.add(id);
        const receipt = output.terminal.command;
        if (typeof receipt?.id === 'string')
          this.commandIds.set(id, receipt.id);
        this.recordCommand(id, receipt);
      }
      this.value.startedCommands += 1;
    } else if (name === 'project_terminal' && args.terminalAction === 'read') {
      if (
        typeof output?.data === 'string' &&
        this.commands.has(args.terminalId)
      )
        this.reviewed.add(args.terminalId);
      this.recordCommand(args.terminalId, output?.command);
      this.value.observations += 1;
    } else if (
      name === 'project_files' &&
      args.fileRequest?.action === 'save' &&
      output?.file?.version
    ) {
      this.value.verifiedWrites += 1;
    } else if (
      (name === 'project_files' &&
        !['list', 'preview'].includes(args.fileRequest?.action)) ||
      (name === 'project_scripts' &&
        !['list'].includes(args.scriptRequest?.action)) ||
      (name === 'project_terminal' && args.terminalAction === 'stop') ||
      (name === 'test_hook' && ['page', 'stop'].includes(args.testAction)) ||
      effects.has(name)
    ) {
      if (!output?.pending) this.value.applied += 1;
    } else this.value.observations += 1;
  }

  pendingCommands() {
    return [...this.commands].filter(
      (id) =>
        !this.reviewed.has(id) ||
        (!this.successful.has(id) && !this.failedCommands.has(id))
    );
  }

  private recordCommand(id: string, receipt: any) {
    if (!this.commandIds.has(id) || receipt?.id !== this.commandIds.get(id))
      return;
    if (receipt.status === 'completed' && Number.isInteger(receipt.exitCode)) {
      if (receipt.exitCode === 0) this.successful.add(id);
      else this.failedCommands.add(id);
    } else if (receipt.status === 'interrupted') this.failedCommands.add(id);
  }

  failed() {
    return (
      this.lastFailed ||
      !!this.pendingDialogs.size ||
      !!this.failedCommands.size
    );
  }

  snapshot(): AIExecution {
    return {
      ...this.value,
      reviewedCommands: this.reviewed.size,
      successfulCommands: this.successful.size,
      failedCommands: this.failedCommands.size,
      unfinishedCommands: this.pendingCommands().length,
      pendingActions: this.pendingDialogs.size,
      incomplete: this.failed() || !!this.pendingCommands().length,
    };
  }
}
