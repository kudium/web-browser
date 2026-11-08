import { Button } from '@radix-ui/themes';
import { RotateCw, ArrowLeft } from 'lucide-react';
import { BrowserState } from '../../browser/contracts';
import { TerminalStatus, TerminalDestination } from './TerminalStatus';
import { ConnectionSequence } from './ConnectionSequence';
import { pageFailure } from '../../browser/pageStatus';

export function PageStatus({
  state,
  url,
  retry,
  back,
}: {
  state: BrowserState | undefined;
  url: string;
  retry: () => void;
  back: () => void;
}) {
  if (!state?.error && !state?.initialLoading) return null;
  const loading = !state.error;
  const message = pageFailure(state.errorCode);
  let host = '';
  try {
    host = new URL(state.failedURL || url).host;
  } catch {
    host = '';
  }
  if (loading)
    return (
      <ConnectionSequence
        key={url}
        host={host}
        secure={url.startsWith('https:')}
      />
    );
  return (
    <TerminalStatus
      tone="error"
      label={message.title}
    >
      <TerminalDestination>
        <h1>{message.title}</h1>
      </TerminalDestination>
      {host && <p className="terminal-error-host">{host}</p>}
      <p className="terminal-error-description">{message.description}</p>
      <div className="terminal-status-actions">
        <Button onClick={retry}>
          <RotateCw size={16} />
          Try again
        </Button>
        {state.canGoBack && (
          <Button variant="soft" onClick={back}>
            <ArrowLeft size={16} />
            Go back
          </Button>
        )}
      </div>
      <details className="terminal-status-details">
        <summary>Details</summary>
        <p>{state.error}</p>
        {state.errorCode !== undefined && <p>Error code: {state.errorCode}</p>}
      </details>
    </TerminalStatus>
  );
}
