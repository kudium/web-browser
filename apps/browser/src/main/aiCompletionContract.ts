import {
  capabilityContracts,
  AICapabilityOutcome,
} from '../browser/aiCapabilityContracts';

/** A bounded recovery check for explicit requests; general operations stay optional. */
export class AICompletionContract {
  private contract;
  private outcome?: AICapabilityOutcome;
  private blocked = false;
  private recovered = false;

  constructor(prompt: string, messages: any[] = []) {
    // Requests for source code alone must not become installation requests.
    this.contract =
      /^\s*(?:how\b|why\b|what\b|explain\b)|\b(?:do not|don't) (?:create|build|add|make|update|edit)\b|\b(?:code only|only (?:show|provide|write)|do not (?:install|save)|don't (?:install|save)|devtools|console snippet)\b/i.test(
        prompt,
      )
        ? undefined
        : capabilityContracts.find((item) => item.intent.test(prompt));
    if (!this.contract) return;
    this.outcome = {
      capability: this.contract.id,
      status: 'not_attempted',
      configurationVerified: false,
      runtimeVerified: false,
    };
    this.recovered = messages.some(
      (message) =>
        message.role === 'system' &&
        message.content === this.contract?.recovery,
    );
    const calls = new Map<string, string>();
    messages.forEach((message) => {
      message.tool_calls?.forEach((call: any) =>
        calls.set(call.id, call.function?.name),
      );
      if (message.role !== 'tool') return;
      try {
        this.record(
          calls.get(message.tool_call_id) || '',
          JSON.parse(message.content),
        );
      } catch {
        /* No usable receipt. */
      }
    });
  }

  record(name: string, output: any) {
    if (!this.contract) return;
    if (output?.error || output?.ok === false) this.blocked = true;
    if (!(this.contract.tools as readonly string[]).includes(name)) return;
    const verified =
      output?.saved === true &&
      output?.verified === true &&
      !output?.error &&
      output?.ok !== false;
    this.outcome = {
      capability: this.contract.id,
      status: verified
        ? 'saved'
        : output?.status === 'denied'
          ? 'denied'
          : output?.error || output?.ok === false
            ? 'failed'
            : 'unverified',
      configurationVerified: verified,
      runtimeVerified: false,
      ...(typeof output?.needsReload === 'boolean'
        ? { needsReload: output.needsReload }
        : {}),
    };
  }

  recovery() {
    if (
      !this.contract ||
      this.outcome?.status !== 'not_attempted' ||
      this.blocked ||
      this.recovered
    )
      return '';
    this.recovered = true;
    return this.contract.recovery;
  }

  incomplete() {
    return !!this.outcome && this.outcome.status !== 'saved';
  }
  snapshot() {
    return this.outcome ? [this.outcome] : [];
  }
  notice() {
    return this.incomplete()
      ? 'Hook installation is incomplete: no verified save receipt was returned.'
      : '';
  }
}
