import { Button } from '@radix-ui/themes';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useAppUpdates } from '../../../utils/useAppUpdates';

export function AppUpdateSettings() {
  const { state, busy, error, run } = useAppUpdates();
  const restarting = state.status === 'restarting';
  const ready = state.status === 'ready';
  const available = state.status === 'available';
  const working =
    busy || restarting || state.status === 'checking' || state.status === 'downloading';
  const label =
    restarting ? 'Applying the update and restarting Kudium…' : state.status === 'checking'
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
      </div>
      <div className="app-update-actions">
        <Button
          size="2"
          variant="solid"
          disabled={working || state.status === 'unavailable'}
          onClick={() =>
            void run(ready ? 'install' : available ? 'download' : 'check')
          }
        >
          <RefreshCw size={16} className={restarting ? "app-update-spinner" : undefined} aria-hidden="true" />
          {restarting ? 'Restarting…' : ready
            ? 'Restart to update'
            : available
              ? 'Download update'
              : state.status === 'downloading'
                ? 'Downloading…'
                : 'Check for updates'}
        </Button>
        <Button
          size="2"
          variant={state.status === 'unavailable' ? 'solid' : 'soft'}
          color="gray"
          asChild
        >
          <a
            href="https://browser.kudium.com/download"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={16} aria-hidden="true" />
            Download manually
          </a>
        </Button>
        <Button size="2" variant="soft" color="gray" asChild>
          <a
            href="https://browser.kudium.com/whats-new"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} aria-hidden="true" />
            What’s new
          </a>
        </Button>
      </div>
    </div>
  );
}
