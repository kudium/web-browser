import { Component, type ReactNode } from 'react';
import { FileWarning, RotateCcw } from 'lucide-react';
import { safeErrorFrames } from '../../browser/telemetry';

export function renderFailureMessage(error: Error): string {
  if (/ENOSPC|no space left on device|disk (?:is )?full/i.test(error.message))
    return 'Your disk is full. Free some space, then try again.';
  if (
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
      `${error.name} ${error.message}`
    )
  )
    return 'Part of the browser could not load. Quit and reopen Kudium, then try again.';
  return 'Something went wrong while displaying this view. Try again, or quit and reopen Kudium if it keeps happening.';
}

export class RenderErrorBoundary extends Component<
  { children: ReactNode; label: string; recovery?: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    try {
      window.electron?.telemetry?.error(
        error.name,
        safeErrorFrames(error.stack)
      );
    } catch {
      // Diagnostics must never prevent the recovery screen from rendering.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="render-error-boundary">
        <div className="render-error-content">
          <span className="render-error-icon" aria-hidden="true">
            <FileWarning size={22} strokeWidth={1.6} />
          </span>
          <h2>{this.props.label} could not be displayed</h2>
          <p>{renderFailureMessage(this.state.error)}</p>
          <div className="render-error-actions">
            <button
              type="button"
              className="render-error-retry"
              onClick={() => this.setState({ error: null })}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Try again
            </button>
            {this.props.recovery}
          </div>
        </div>
      </div>
    );
  }
}
