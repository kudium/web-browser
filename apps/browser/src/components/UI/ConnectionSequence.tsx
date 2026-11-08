import { CSSProperties } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { TerminalStatus, TerminalDestination } from './TerminalStatus';

const stages = [
  ['01', 'DNS', 'Resolving destination'],
  ['02', 'NET', 'Opening connection'],
  ['03', 'TLS', 'Negotiating secure transport'],
  ['04', 'HTTP', 'Requesting document'],
  ['05', 'DOM', 'Preparing page'],
];

export function ConnectionSequence({
  host,
  secure,
}: {
  host: string;
  secure: boolean;
}) {
  return (
    <TerminalStatus
      tone="loading"
      title="CONNECT"
      badge="LIVE"
      label={`Loading website ${host}`}
    >
      <TerminalDestination>
        <h1>{host || 'Opening website'}</h1>
        <ArrowUpRight size={18} />
      </TerminalDestination>
      <p className="connection-caption">
        Loading website
        <span className="connection-cursor" aria-hidden="true">
          _
        </span>
      </p>
      <div className="connection-stages" aria-hidden="true">
        {stages
          .filter((stage) => secure || stage[1] !== 'TLS')
          .map(([number, protocol, label], index) => (
            <div
              className="connection-stage"
              key={protocol}
              style={{ '--stage': index } as CSSProperties}
            >
              <span className="connection-stage-number">{number}</span>
              <span className="connection-protocol">{protocol}</span>
              <span>
                {label}
                <span className="connection-dots">…</span>
              </span>
            </div>
          ))}
      </div>
      <footer>
        <span className="connection-pulse" aria-hidden="true" />
        Waiting for the page
        <span className="connection-simulation">
          Visual sequence · simulated steps
        </span>
      </footer>
    </TerminalStatus>
  );
}
