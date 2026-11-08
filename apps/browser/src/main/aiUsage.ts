import type { AIUsage } from '../browser/ai';

/** Numeric provider counters only; prompts, responses and keys are never logged. */
export function providerUsage(payload: any): Partial<AIUsage> | undefined {
  const usage = payload?.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined;
  const input = count(usage.prompt_tokens ?? usage.input_tokens);
  const output = count(usage.completion_tokens ?? usage.output_tokens);
  if (input === undefined || output === undefined) return undefined;
  const cached = count(
    usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens
  );
  const writes = count(usage.cache_creation_input_tokens);
  return {
    // Claude input_tokens excludes cache reads and writes; OpenAI includes reads.
    inputTokens:
      input +
      (usage.prompt_tokens === undefined ? (cached ?? 0) + (writes ?? 0) : 0),
    outputTokens: output,
    ...(cached !== undefined ? { cachedInputTokens: cached } : {}),
    ...(writes !== undefined ? { cacheWriteTokens: writes } : {}),
  };
}

export class AIUsageTracker {
  private started = Date.now();

  private value: AIUsage = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    toolCalls: 0,
    usageReported: false,
    requestAttempts: 0,
    streamingFallbacks: 0,
    requestsWithUsage: 0,
  };

  record(payload: any) {
    this.value.requests += 1;
    const usage = providerUsage(payload);
    if (usage) {
      this.value.usageReported = true;
      this.value.requestsWithUsage! += 1;
      this.value.inputTokens += usage.inputTokens!;
      this.value.outputTokens += usage.outputTokens!;
      if (usage.cachedInputTokens !== undefined)
        this.value.cachedInputTokens =
          (this.value.cachedInputTokens ?? 0) + usage.cachedInputTokens;
      if (usage.cacheWriteTokens !== undefined)
        this.value.cacheWriteTokens =
          (this.value.cacheWriteTokens ?? 0) + usage.cacheWriteTokens;
    }
  }

  tool() {
    this.value.toolCalls += 1;
  }

  attempt() {
    this.value.requestAttempts! += 1;
  }

  fallback() {
    this.value.streamingFallbacks! += 1;
  }

  text(text: string) {
    if (text.trim() && this.value.firstTextMs === undefined)
      this.value.firstTextMs = Date.now() - this.started;
  }

  snapshot(): AIUsage {
    return { ...this.value, durationMs: Date.now() - this.started };
  }
}
