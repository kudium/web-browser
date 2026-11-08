import { useAppUpdates } from '../../utils/useAppUpdates';

export function AppUpdateBanner({ compact = false }: { compact?: boolean }) {
  const { state, busy, error, run } = useAppUpdates();
  if (!['available', 'downloading', 'ready'].includes(state.status))
    return null;
  const ready = state.status === 'ready';
  const downloading = state.status === 'downloading';
  const action = ready
    ? 'Restart to update'
    : downloading
    ? `Downloading${
        state.progress === undefined ? '…' : ` ${Math.round(state.progress)}%`
      }`
    : 'Download update';
  const title = ready ? 'Update ready' : 'Update available';
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
        disabled={busy || downloading}
        onClick={() => void run(ready ? 'install' : 'download')}
      >
        <span className="app-update-copy">
          {compact
            ? downloading
              ? state.progress === undefined
                ? '…'
                : `${Math.round(state.progress)}%`
              : 'New'
            : ready || downloading
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
