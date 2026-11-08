import type { AIUsage } from '../../browser/ai';

export function AIUsageDetails({ usage }: { usage: AIUsage }) {
  return (
    <details className="ai-usage-details">
      <summary>AI usage</summary>
      <dl>
        <dt>Reported input tokens</dt>
        <dd>
          {usage.usageReported
            ? usage.inputTokens.toLocaleString()
            : 'Unavailable'}
        </dd>
        <dt>Reported output tokens</dt>
        <dd>
          {usage.usageReported
            ? usage.outputTokens.toLocaleString()
            : 'Unavailable'}
        </dd>
        {usage.cachedInputTokens !== undefined && (
          <>
            <dt>Cached input tokens</dt>
            <dd>{usage.cachedInputTokens.toLocaleString()}</dd>
          </>
        )}
        {usage.cacheWriteTokens !== undefined && (
          <>
            <dt>Cache write tokens</dt>
            <dd>{usage.cacheWriteTokens.toLocaleString()}</dd>
          </>
        )}
        <dt>Completed model requests</dt>
        <dd>{usage.requests}</dd>
        {usage.requestAttempts !== undefined && (
          <>
            <dt>Provider request attempts</dt>
            <dd>{usage.requestAttempts}</dd>
            <dt>Streaming fallbacks</dt>
            <dd>{usage.streamingFallbacks || 0}</dd>
            <dt>Requests reporting usage</dt>
            <dd>
              {usage.requestsWithUsage || 0} / {usage.requests}
            </dd>
          </>
        )}
        {usage.firstTextMs !== undefined && (
          <>
            <dt>First text</dt>
            <dd>{(usage.firstTextMs / 1000).toFixed(1)}s</dd>
          </>
        )}
        <dt>Tool calls</dt>
        <dd>{usage.toolCalls}</dd>
        <dt>Time</dt>
        <dd>{Math.round(usage.durationMs / 1000)}s</dd>
      </dl>
      <p>
        Provider-reported counts for this agent run. Chat naming, failed retries
        and streaming fallback attempts are excluded from token counts. Counts
        may be incomplete if the provider omits usage. Earlier paused segments
        are excluded. These counts are not the full provider bill.
      </p>
    </details>
  );
}
