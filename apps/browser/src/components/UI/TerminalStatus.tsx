import { CSSProperties, ReactNode } from 'react';
import { Terminal } from 'lucide-react';

/** Shared browser status surface; persistent errors keep the backdrop still. */
export function TerminalStatus({
  children,
  title,
  badge,
  label,
  tone,
}: {
  children: ReactNode;
  title: string;
  badge: string;
  label: string;
  tone: 'loading' | 'error';
}) {
  return (
    <div
      className={`connection-scene terminal-status-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      aria-label={label}
    >
      <div className="connection-matrix" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => (
          <span key={index} style={{ '--stream': index } as CSSProperties}>
            {'01 7F 10 A3 00 11 9C 01 B8 10 00 2D 11 01 6E 00'
              .split(' ')
              .join('\n')}
          </span>
        ))}
      </div>
      <div className="connection-terminal">
        <header>
          <Terminal size={15} />
          <span>KUDIUM BROWSER / {title}</span>
          <span className="connection-live">{badge}</span>
        </header>
        {children}
      </div>
    </div>
  );
}

export function TerminalDestination({ children }: { children: ReactNode }) {
  return (
    <div className="connection-destination">
      <span className="connection-prompt" aria-hidden="true">
        ❯
      </span>
      {children}
    </div>
  );
}
