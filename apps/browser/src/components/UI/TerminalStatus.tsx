import { ReactNode } from 'react';
import { Globe2, WifiOff } from 'lucide-react';

/** Shared browser status surface; persistent errors keep the backdrop still. */
export function TerminalStatus({
  children,
  label,
  tone,
}: {
  children: ReactNode;
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
      <div className="connection-terminal">
        <div className="connection-status-icon" aria-hidden="true">
          {tone === 'error' ? <WifiOff size={28} /> : <Globe2 size={28} />}
        </div>
        {children}
      </div>
    </div>
  );
}

export function TerminalDestination({ children }: { children: ReactNode }) {
  return <div className="connection-destination">{children}</div>;
}
