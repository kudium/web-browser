/** Stop repeated inference rounds before re-running the same no-progress tools. */
export class AILoopGuard {
  private signature = '';
  private repeats = 0;
  check(message: any) {
    if (!message.tool_calls?.length) {
      this.signature = '';
      this.repeats = 0;
      return;
    }
    const repeatedReads = new Set([
      'read_page',
      'list_tabs',
      'list_groups',
      'get_access',
      'discover_tools',
      'request_user_feedback',
    ]);
    if (
      !message.tool_calls.every((call: any) =>
        repeatedReads.has(call.function?.name)
      )
    ) {
      this.signature = '';
      this.repeats = 0;
      return;
    }
    const signature = JSON.stringify(
      message.tool_calls.map((call: any) => ({
        name: call.function?.name,
        // Rephrasing a clarification is not new work.
        arguments:
          call.function?.name === 'request_user_feedback'
            ? ''
            : call.function?.arguments,
      }))
    );
    this.repeats = signature === this.signature ? this.repeats + 1 : 1;
    this.signature = signature;
    if (this.repeats >= 3)
      throw new Error(
        'Apple local AI repeated the same step without progressing. The run was stopped before repeating it again. Try a more capable model for this task.'
      );
  }
}
