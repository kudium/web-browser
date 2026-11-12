/* Function parameters supply optional prop defaults. */
/* eslint-disable react/require-default-props */
import { useEffect, useState } from 'react';
import { Button, Checkbox, TextField } from '@radix-ui/themes';
import {
  Cloud,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  Laptop,
  CircleAlert,
  LockKeyhole,
} from 'lucide-react';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { browser } from '../../../browser/client';
import {
  AccountSyncAction,
  AccountSyncInput,
  AccountSyncStatus,
} from '../../../browser/accountSync';
import { AppManager } from '../../../utils/AppManager';
import { SpaceManager } from '../../../utils/SpaceManager';

export function AccountSyncSettings({
  enabled,
  onEnabled,
  passwordsEnabled = false,
  notesEnabled = false,
}: {
  enabled: boolean;
  onEnabled: () => void;
  passwordsEnabled: boolean;
  notesEnabled?: boolean;
}) {
  const [status, setStatus] = useState<AccountSyncStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      browser
        .accountSync('status')
        .then((result) => {
          if (alive && 'phase' in result) setStatus(result);
          return undefined;
        })
        .catch((reason) => {
          if (alive) setError((reason as Error).message);
        });
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const action = async (name: AccountSyncAction, input?: AccountSyncInput) => {
    setBusy(true);
    setError('');
    try {
      const result = await browser.accountSync(name, input);
      if ('phase' in result) {
        setStatus(result);
        if (name === 'disconnect' || name === 'cancel') {
          setKey('');
          setSaved(false);
        }
        if (name === 'enable') {
          setKey('');
          setSaved(false);
          onEnabled();
        }
      } else {
        const spaces = SpaceManager.getAll();
        SpaceManager.set([...spaces, ...result.spaces]);
        AppManager.set([...AppManager.getAll(), ...result.apps]);
        setError('Restored as new groups. Your existing tabs were kept.');
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  let stateLabel = 'Sync is off';
  if (status?.connected) stateLabel = enabled ? 'Connected' : 'Sync is off';
  if (enabled && status?.phase === 'ready') stateLabel = 'Synced';
  if (status?.phase === 'syncing') stateLabel = 'Syncing…';
  return (
    <div className="account-sync-settings">
      {!status?.connected ? (
        <section
          className="preference-card sync-account-sign-in"
          aria-label="Kudium account"
        >
          <div className="preference-row">
            <div>
              <p>Sign in to start syncing.</p>
            </div>
            <div className="sync-sign-in-actions">
              <Button
                size="2"
                disabled={busy || !status || status.phase === 'connecting'}
                onClick={() => action('connect', { authMode: 'sign-in' })}
              >
                Sign in to Kudium
              </Button>
              <Button
                size="2"
                variant="ghost"
                disabled={busy || !status || status.phase === 'connecting'}
                onClick={() => action('connect', { authMode: 'sign-up' })}
              >
                Create account
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="preference-card sync-account-hero">
          <div className="preference-row">
            <div className="sync-account-identity">
              <span className="sync-account-avatar">
                <Cloud size={20} />
              </span>
              <div>
                <strong>{status.email}</strong>
              </div>
            </div>
            <span
              className="sync-state-pill"
              data-active={enabled && status.phase === 'ready'}
            >
              {stateLabel}
            </span>
            {enabled &&
              status.phase !== 'key-required' &&
              status.phase !== 'recovery-required' && (
                <Button
                  variant="soft"
                  disabled={busy}
                  onClick={() => action('sync')}
                >
                  Sync now
                </Button>
              )}
          </div>
        </div>
      )}
      {(error ||
        status?.phase === 'error' ||
        status?.phase === 'syncing' ||
        (passwordsEnabled && status?.message.includes('saved logins'))) && (
        <p role="status" className="sync-status-line">
          {error ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}
          {error || status?.message || 'Checking account…'}
        </p>
      )}
      {status?.phase === 'connecting' && (
        <div className="sync-key-setup">
          <strong>
            <ShieldCheck size={18} />
            Compare the device code
          </strong>
          <p>
            Finish signing in on the website, then approve this code. This page
            will update automatically when your browser is connected.
          </p>
          <code>{status.userCode}</code>
          <div className="sync-sign-in-actions">
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => action('connect')}
            >
              Continue on website
            </Button>
          </div>
          <Button
            variant="soft"
            disabled={busy}
            onClick={() => action('cancel')}
          >
            Cancel connection
          </Button>
        </div>
      )}
      {status?.phase === 'key-required' && (
        <div className="sync-key-setup">
          <strong>
            <KeyRound size={18} />
            Save your recovery key
          </strong>
          <p>
            This key unlocks your encrypted data on other devices. Store it in
            your password manager. Kudium’s server cannot recover it.
          </p>
          <TextField.Root
            aria-label="New sync recovery key"
            value={status.recoveryKey || ''}
            readOnly
          />
          <label htmlFor="saved-sync-recovery-key">
            <Checkbox
              id="saved-sync-recovery-key"
              checked={saved}
              onCheckedChange={(value) => setSaved(value === true)}
            />{' '}
            I saved my recovery key
          </label>
          <Button
            disabled={busy || !saved}
            onClick={() => action('enable', { savedRecoveryKey: saved })}
          >
            Start encrypted sync
          </Button>
        </div>
      )}
      {status?.phase === 'recovery-required' && (
        <div className="sync-key-setup">
          <strong>
            <LockKeyhole size={18} />
            Unlock your synced data
          </strong>
          <p>Enter the recovery key you saved on your first device.</p>
          <TextField.Root
            type="password"
            autoComplete="off"
            aria-label="Sync recovery key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
          <Button
            disabled={busy || !key.trim()}
            onClick={() => action('enable', { recoveryKey: key })}
          >
            Unlock and start sync
          </Button>
        </div>
      )}
      {status?.connected && (
        <details className="sync-details sync-advanced-actions">
          <summary>Backup, restore and account options</summary>
          <div className="sync-advanced-content">
            <div className="preference-card">
              <div className="preference-row">
                <div>
                  <strong>Personal notes</strong>
                  <p>
                    Select Personal notes under Included in sync to back up
                    encrypted Markdown notes. Restoring keeps existing notes and
                    turns AI access off for restored copies.
                  </p>
                </div>
                <Button
                  size="1"
                  variant="soft"
                  disabled={
                    busy ||
                    !enabled ||
                    !notesEnabled ||
                    status?.phase !== 'ready'
                  }
                  onClick={() => action('sync-notes')}
                >
                  Unlock & back up notes
                </Button>
              </div>
              {status?.noteDevices?.map((device) => (
                <Button
                  key={device.recordId}
                  size="1"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    action('restore-notes', { recordId: device.recordId })
                  }
                >
                  Restore notes from {device.deviceId.slice(0, 8)}
                </Button>
              ))}
            </div>
            {passwordsEnabled && (
              <div className="preference-card">
                <div className="preference-row">
                  <div>
                    <div className="preference-label">
                      <strong>Saved passwords</strong>
                      <PreferenceHint label="password sync">
                        Unlock Personal Data to encrypt and sync saved logins.
                        Restoring keeps your existing passwords.
                      </PreferenceHint>
                    </div>
                    <p>Sync your saved logins.</p>
                  </div>
                  <div className="sync-password-actions">
                    <Button
                      variant="soft"
                      disabled={
                        busy ||
                        !enabled ||
                        !status?.connected ||
                        status.phase === 'key-required' ||
                        status.phase === 'recovery-required'
                      }
                      onClick={() => action('sync-passwords')}
                    >
                      Unlock & sync passwords
                    </Button>
                    {status?.passwordDevices?.map((device) => (
                      <Button
                        key={device.recordId}
                        variant="soft"
                        disabled={busy || !enabled}
                        onClick={() =>
                          action('restore-passwords', {
                            recordId: device.recordId,
                          })
                        }
                      >
                        Restore logins from another device
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {status?.lastSyncedAt && (
              <p className="preference-note">
                Last synced: {new Date(status.lastSyncedAt).toLocaleString()}
              </p>
            )}
            {status?.connected &&
              (status.phase === 'key-required' ||
                status.phase === 'recovery-required') && (
                <Button
                  variant="soft"
                  disabled={busy}
                  onClick={() => action('disconnect')}
                >
                  Set up later
                </Button>
              )}
            {Boolean(status?.remote.length) && (
              <details className="sync-details">
                <summary>
                  <Laptop size={16} /> Other devices · {status?.remote.length}
                </summary>
                {status?.remote.map((item) => (
                  <div className="preference-row" key={item.recordId}>
                    <div>
                      <strong>
                        <Laptop size={20} />
                        Workspace from another device
                      </strong>
                      <p className="preference-note">
                        {item.groups} groups · {item.tabs} tabs ·{' '}
                        {new Date(item.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="soft"
                      disabled={busy}
                      onClick={() =>
                        action('restore', { recordId: item.recordId })
                      }
                    >
                      Restore as new groups
                    </Button>
                    <Button
                      variant="soft"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await browser.confirm({
                            message: 'Use synced browser preferences?',
                            detail:
                              'Replace portable search, font, zoom, language, and shortcut preferences with this device’s synced choices.',
                            confirm: 'Use preferences',
                          })
                        )
                          action('apply-preferences', {
                            recordId: item.recordId,
                          });
                      }}
                    >
                      Use preferences…
                    </Button>
                  </div>
                ))}
              </details>
            )}
            {status?.connected && (
              <details className="sync-details">
                <summary>Account options</summary>
                <Button
                  variant="soft"
                  disabled={busy}
                  onClick={() => action('connect')}
                >
                  Reconnect
                </Button>
                <Button
                  variant="soft"
                  disabled={busy}
                  onClick={() => action('disconnect')}
                >
                  Disconnect
                </Button>
                <Button
                  variant="ghost"
                  color="red"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await browser.confirm({
                        message: 'Delete cloud sync data?',
                        detail:
                          'Remove all encrypted data from your Kudium account and disconnect this device. Local groups stay on your devices.',
                        confirm: 'Delete cloud data',
                      })
                    )
                      action('delete-data');
                  }}
                >
                  Delete cloud data…
                </Button>
              </details>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
