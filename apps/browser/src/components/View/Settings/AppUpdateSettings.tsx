import { Button, Link } from '@radix-ui/themes';
import { useAppUpdates } from '../../../utils/useAppUpdates';

export function AppUpdateSettings() {
  const { state, busy, error, run } = useAppUpdates();
  const ready = state.status === 'ready';
  const available = state.status === 'available';
  const working =
    busy || state.status === 'checking' || state.status === 'downloading';
  const label =
    state.status === 'checking'
      ? 'Checking for updates…'
      : state.status === 'downloading'
        ? `Downloading update${
            state.progress === undefined
              ? '…'
              : ` · ${Math.round(state.progress)}%`
          }`
        : ready
          ? `Version ${state.version} is ready to install.`
          : available
            ? `Version ${state.version} is available.`
            : state.status === 'unavailable'
              ? 'Automatic updates aren’t available in this build. Download the latest version manually.'
              : state.status === 'error'
                ? 'Could not check for updates.'
                : state.checkedAt
                  ? 'You’re up to date.'
                  : 'Check for a newer version of Kudium Browser.';
  return (
    <div className="app-update-settings">
      <div>
        <strong>
          Kudium Browser{state.currentVersion ? ` ${state.currentVersion}` : ''}
        </strong>
        <p role="status" aria-live="polite">
          {label}
        </p>
        {(error || state.message) && state.status !== 'unavailable' && (
          <p role="alert">{error || state.message}</p>
        )}
        <p>
          <Link
            href="https://browser.kudium.com/download"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download manually
          </Link>
          {' · '}
          <Link
            href="https://browser.kudium.com/whats-new"
            target="_blank"
            rel="noopener noreferrer"
          >
            What’s new
          </Link>
        </p>
      </div>
      <Button
        size="1"
        variant="soft"
        disabled={working || state.status === 'unavailable'}
        onClick={() =>
          void run(ready ? 'install' : available ? 'download' : 'check')
        }
      >
        {ready
          ? 'Restart to update'
          : available
            ? 'Download update'
            : state.status === 'downloading'
              ? 'Downloading…'
              : 'Check for updates'}
      </Button>
    </div>
  );
}
