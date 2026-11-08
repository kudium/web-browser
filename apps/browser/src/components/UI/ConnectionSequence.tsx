import { TerminalStatus, TerminalDestination } from './TerminalStatus';

export function ConnectionSequence({ host }: { host: string; secure: boolean }) {
  return (
    <TerminalStatus
      tone="loading"
      label={`Loading website ${host}`}
    >
      <TerminalDestination>
        <h1>Opening website</h1>
      </TerminalDestination>
      {host && <p className="terminal-error-host">{host}</p>}
      <p className="connection-caption">Loading website…</p>
      <div className="connection-progress" aria-hidden="true" />
    </TerminalStatus>
  );
}
