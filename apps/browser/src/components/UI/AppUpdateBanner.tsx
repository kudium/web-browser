import { RefreshCw } from 'lucide-react';
import { useAppUpdates } from '../../utils/useAppUpdates';
import { WhatsNewButton } from './WhatsNewButton';

export function AppUpdateBanner({
  compact = false,
  onWhatsNew,
}: {
  compact?: boolean;
  onWhatsNew?: (url: string) => boolean;
}) {
  const { state, busy, error, run } = useAppUpdates();
  if (state.status === 'unavailable') return null;
  if (!['available', 'downloading', 'ready', 'restarting'].includes(state.status))
    return (
      <WhatsNewButton
        version={state.currentVersion}
        compact={compact}
        onOpen={onWhatsNew}
      />
    );
  const restarting = state.status === 'restarting';
  const ready = state.status === 'ready';
  const downloading = state.status === 'downloading';
  const action = restarting ? 'Restarting browser…' : ready
    ? 'Restart to update'
    : downloading
    ? `Downloading${
        state.progress === undefined ? '…' : ` ${Math.round(state.progress)}%`
      }`
    : 'Download update';
  const title = restarting ? 'Applying update' : ready ? 'Update ready' : 'Update available';
  return (
    <div className={`app-update-banner${compact ? ' app-update-compact' : ''}`}>
      <button
        className="app-update-button"
        type="button"
        aria-label={`${title}. ${action}`}
        title={`${title}${
          state.version ? ` · ${state.version}` : ''
        }. ${action}${
          error || state.message ? ` — ${error || state.message}` : ''
        }`}
        disabled={busy || downloading || restarting}
        onClick={() => void run(ready ? 'install' : 'download')}
      >
        <span className="app-update-copy" role={restarting ? 'status' : undefined} aria-live="polite">
          {restarting && <RefreshCw size={14} className="app-update-spinner" aria-hidden="true" />}
          {compact
            ? restarting ? <span className="app-update-sr">Restarting browser…</span> : downloading
              ? state.progress === undefined
                ? '…'
                : `${Math.round(state.progress)}%`
              : 'New'
            : ready || downloading || restarting
            ? action
            : title}
        </span>
      </button>
      {!compact && (error || state.message) && (
        <span className="app-update-error" role="status">
          {error || state.message}
        </span>
      )}
    </div>
  );
}
