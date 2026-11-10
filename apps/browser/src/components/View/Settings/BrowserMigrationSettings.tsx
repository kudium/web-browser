/* eslint-disable jsx-a11y/label-has-associated-control -- Radix Checkbox renders the control referenced by each htmlFor. */
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Select } from '@radix-ui/themes';
import type {
  MigrationProfile,
  MigrationPreview,
  MigrationResult,
  MigrationProgress,
  MigrationRecovery,
} from '../../../browser/browserMigration';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { ImportOrganizationChoices } from './ImportOrganizationChoices';
import { buildImportedWorkspace } from '../../../browser/importWorkspace';
import { AppManager } from '../../../utils/AppManager';
import { SpaceManager } from '../../../utils/SpaceManager';

export function BrowserMigrationSettings() {
  const [recoveries, setRecoveries] = useState<MigrationRecovery[]>([]);
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [profiles, setProfiles] = useState<MigrationProfile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [bookmarks, setBookmarks] = useState(true);
  const [history, setHistory] = useState(true);
  const [cookies, setCookies] = useState(false);
  const [preview, setPreview] = useState<MigrationPreview>();
  const [savedToken, setSavedToken] = useState('');
  const [progress, setProgress] = useState<MigrationProgress>();
  const [busy, setBusy] = useState(false);
  const [organization, setOrganization] = useState({
    foldersAsGroups: true,
    spacesAsFolders: true,
  });
  const [message, setMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message)
      feedback.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
  }, [message]);
  const [space, setSpace] = useState(
    () => SpaceManager.getAll()[0]?.id || 'default'
  );
  const profile = profiles.find((item) => item.id === profileId);
  const savedGroups = !!preview && savedToken === preview.token;
  let scanLabel = scanned ? 'Scan again' : 'Scan for browser data';
  if (scanning) scanLabel = 'Scanning…';
  useEffect(() => {
    if (!busy || !preview) return undefined;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = (await window.electron.browserMigration('status', {
          token: preview.token,
        })) as MigrationProgress;
        if (!disposed) setProgress(value);
      } catch {
        /* The completion call reports errors. */
      }
      if (!disposed) timer = setTimeout(poll, 300);
    };
    poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [busy, preview]);

  const scan = async () => {
    setBusy(true);
    setScanning(true);
    setMessage('');
    setSavedToken('');
    setProgress(undefined);
    setPreview(undefined);
    try {
      const result = (await window.electron.browserMigration(
        'profiles'
      )) as MigrationProfile[];
      setScanned(true);
      setProfiles(result);
      setProfileId(result[0]?.id || '');
      setCookies(!!result[0]?.cookies);
      const recovery = (await window.electron.browserMigration(
        'recover'
      )) as MigrationRecovery[];
      setRecoveries(Array.isArray(recovery) ? recovery : []);
      if (!result.length)
        setMessage(
          'No supported browser profiles found. You can import an export below.'
        );
    } catch {
      setMessage(
        'Browser profiles could not be detected. Try again or use an export below.'
      );
    } finally {
      setBusy(false);
      setScanning(false);
    }
  };
  const review = async () => {
    setProgress({
      stage: 'Preparing tabs, history and website logins',
      completed: 0,
      total: 0,
    });
    setBusy(true);
    setMessage('');
    try {
      setPreview(
        (await window.electron.browserMigration('prepare', {
          profileId,
          destinationSpace: space,
          bookmarks: bookmarks && !!profile?.bookmarks,
          history: history && !!profile?.history,
          cookies,
        })) as MigrationPreview
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const migrate = async () => {
    if (!preview || !profile) return;
    setBusy(true);
    setMessage('');
    try {
      await window.electron.browserMigration('start', {
        token: preview.token,
        destinationSpace: space,
        organization,
      });
      const previousSpaces = SpaceManager.getAll();
      const existing = AppManager.getStored();
      if (!existing.some((tab) => tab.sessionProfileId === preview.profileId)) {
        const links = preview.links.length
          ? preview.links
          : [{ name: 'Kudium Browser', url: 'https://browser.kudium.com/' }];
        const plan = buildImportedWorkspace(
          links,
          previousSpaces,
          space,
          profile.browser,
          organization,
          preview.profileId,
          {
            id: preview.token,
            name: `Imported from ${profile.browser} · ${profile.name}`,
          }
        );
        const apps = plan.apps.map((tab, index) => ({
          ...tab,
          position: existing.length + index + 1,
        }));
        // Save the destination before transferring data, so successful transfers remain reachable.
        SpaceManager.set(plan.spaces);
        try {
          AppManager.set([...existing, ...apps]);
          const saved = new Set(AppManager.getStored().map((tab) => tab.id));
          if (apps.some((tab) => !saved.has(tab.id)))
            throw new Error(
              'The imported groups could not be saved. Try again.'
            );
        } catch (error) {
          try {
            AppManager.set(existing);
          } finally {
            SpaceManager.set(previousSpaces);
          }
          throw error;
        }
      }
      setSavedToken(preview.token);
      try {
        const result = (await window.electron.browserMigration('commit', {
          token: preview.token,
        })) as MigrationResult;
        setMessage(
          `Imported ${preview.links.length} ${
            profile.browser === 'Arc' ? 'saved tabs' : 'bookmarks'
          }, ${result.history} history entries and ${result.cookies} cookies.${
            result.warning ? ` ${result.warning}` : ''
          }${
            result.skippedCookies
              ? ` ${result.skippedCookies} cookies could not be transferred.`
              : ''
          }${
            result.omittedCookies
              ? ` ${result.omittedCookies} cookies exceeded the import limit.`
              : ''
          }`
        );
        if (!result.retryable) {
          setRecoveries((current) =>
            current.filter((item) => item.token !== preview.token)
          );
          setPreview(undefined);
        }
      } catch (error) {
        setMessage(
          `Your imported groups were saved. ${(error as Error).message}`
        );
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const importPasswords = async () => {
    setBusy(true);
    setPasswordMessage('');
    try {
      const result = (await window.electron.passwordManager({
        action: 'importPasswords',
      })) as { imported: number; skipped: number; canceled?: boolean };
      if (!result.canceled)
        setPasswordMessage(
          `Imported ${result.imported} passwords.${
            result.skipped
              ? ` ${result.skipped} duplicate or unsupported rows skipped.`
              : ''
          }`
        );
    } catch (error) {
      setPasswordMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="browser-migration-settings">
      {recoveries.length > 0 && !preview && (
        <div className="preference-card">
          <strong>Continue an interrupted import</strong>
          {recoveries.map((item) => (
            <div className="preference-row" key={item.token}>
              <span>
                {item.source.browser} · {item.source.name} · {item.links.length}{' '}
                saved tabs
              </span>
              <Button
                disabled={busy}
                onClick={() => {
                  setProfiles((current) => [
                    ...current.filter((entry) => entry.id !== item.source.id),
                    item.source,
                  ]);
                  setProfileId(item.source.id);
                  setSpace(
                    item.destinationSpace ||
                      SpaceManager.getAll()[0]?.id ||
                      'default'
                  );
                  if (item.organization) setOrganization(item.organization);
                  setPreview(item);
                  if (
                    AppManager.getStored().some(
                      (tab) => tab.sessionProfileId === item.profileId
                    )
                  )
                    setSavedToken(item.token);
                  setMessage(
                    'Your saved groups and login profile will be reused.'
                  );
                }}
              >
                Resume {item.source.browser} import
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="preference-card">
        {!scanned && (
          <p className="preference-note">
            Scan for browser data to find profiles from Chrome, Edge, Brave,
            Chromium and Arc on this Mac. This accesses other browsers’ profile
            folders, and macOS may ask you to allow access. Choose Scan for
            browser data when you’re ready, then review what to import.
          </p>
        )}
        {!scanned && (
          <div className="preference-row">
            <Button
              variant="solid"
              className="migration-scan-primary"
              disabled={busy}
              onClick={scan}
            >
              {scanLabel}
            </Button>
          </div>
        )}
        {scanned && (
          <>
            <div className="preference-row">
              <strong>Browser profile</strong>
              <div className="migration-controls">
                <Select.Root
                  value={profileId || undefined}
                  disabled={busy || savedGroups || !profiles.length}
                  onValueChange={(value) => {
                    setProfileId(value);
                    setCookies(
                      !!profiles.find((item) => item.id === value)?.cookies
                    );
                    setPreview(undefined);
                  }}
                >
                  <Select.Trigger
                    aria-label="Source browser profile"
                    placeholder={
                      scanned ? 'No profiles found' : 'Scan to find profiles'
                    }
                  />
                  <Select.Content>
                    {profiles.map((item) => (
                      <Select.Item key={item.id} value={item.id}>
                        {item.browser} · {item.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Button
                  variant={scanned ? 'soft' : 'solid'}
                  className={scanned ? undefined : 'migration-scan-primary'}
                  disabled={busy || savedGroups}
                  onClick={scan}
                >
                  {scanLabel}
                </Button>
              </div>
            </div>
            <div className="preference-row">
              <strong>Destination space</strong>
              <Select.Root
                value={space}
                disabled={busy || savedGroups}
                onValueChange={(value) => {
                  setSpace(value);
                  setPreview(undefined);
                }}
              >
                <Select.Trigger aria-label="Migration destination space" />
                <Select.Content>
                  {SpaceManager.getAll().map((item) => (
                    <Select.Item key={item.id} value={item.id}>
                      {item.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            <p className="preference-note">
              Import up to 5,000 saved tabs, 10,000 history entries and 10,000
              cookies. History keeps the 10,000 most recent entries across all
              profiles. Your review will show if source data exceeds an import
              limit.
            </p>
            <div className="migration-data-choices">
              <label htmlFor="migration-bookmarks">
                <Checkbox
                  id="migration-bookmarks"
                  checked={bookmarks && !!profile?.bookmarks}
                  disabled={busy || savedGroups || !profile?.bookmarks}
                  onCheckedChange={(value) => {
                    setBookmarks(value === true);
                    setPreview(undefined);
                  }}
                />
                {profile?.browser === 'Arc'
                  ? 'Sidebar tabs and folders'
                  : 'Bookmarks and folders'}
              </label>
              <label htmlFor="migration-history">
                <Checkbox
                  id="migration-history"
                  checked={history && !!profile?.history}
                  disabled={busy || savedGroups || !profile?.history}
                  onCheckedChange={(value) => {
                    setHistory(value === true);
                    setPreview(undefined);
                  }}
                />
                Browsing history
              </label>
              <label htmlFor="migration-cookies">
                <Checkbox
                  id="migration-cookies"
                  checked={cookies}
                  disabled={busy || savedGroups || !profile?.cookies}
                  onCheckedChange={(value) => {
                    setCookies(value === true);
                    setPreview(undefined);
                  }}
                />
                Cookies and website logins
              </label>
              <p className="preference-note">
                {profile?.cookies
                  ? 'Cookie transfer needs macOS Keychain access. Some websites will ask you to sign in again.'
                  : 'Cookie transfer is currently available for supported Chromium browsers on macOS.'}
              </p>
            </div>
            <ImportOrganizationChoices
              singleCollection
              source={profile?.browser || ''}
              options={organization}
              onChange={setOrganization}
              disabled={busy || savedGroups}
            />
            {preview?.warnings?.map((warning) => (
              <p className="preference-note" key={warning}>
                {warning}
              </p>
            ))}
            {busy && progress && (
              <div role="status" aria-live="polite">
                {progress.stage}
                {progress.total > 0
                  ? ` · ${progress.completed} / ${progress.total}`
                  : ''}
                <progress
                  aria-label="Import progress"
                  max={progress.total || undefined}
                  value={progress.total ? progress.completed : undefined}
                />
              </div>
            )}
            <div className="migration-actions">
              {preview ? (
                <>
                  <span>
                    {preview.links.length}{' '}
                    {profile?.browser === 'Arc' ? 'saved tabs' : 'bookmarks'} ·{' '}
                    {preview.history} history entries
                    {preview.cookies ? ' · cookies included' : ''}
                  </span>
                  <Button disabled={busy} onClick={migrate}>
                    {savedGroups
                      ? 'Retry remaining data'
                      : 'Import into collection'}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await window.electron.browserMigration('discard', {
                          token: preview.token,
                        });
                        setRecoveries((current) =>
                          current.filter((item) => item.token !== preview.token)
                        );
                        setPreview(undefined);
                      } catch (error) {
                        setMessage((error as Error).message);
                      }
                    }}
                  >
                    {savedGroups ? 'Finish without remaining data' : 'Cancel'}
                  </Button>
                </>
              ) : (
                <Button
                  disabled={
                    busy ||
                    !profile ||
                    !(
                      (bookmarks && profile.bookmarks) ||
                      (history && profile.history) ||
                      cookies
                    )
                  }
                  onClick={review}
                >
                  {busy ? 'Working…' : 'Review import'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      {message && (
        <p ref={feedback} role="alert" className="migration-feedback">
          {message.replace(
            /^Error invoking remote method '[^']+': (?:Error: )?/,
            ''
          )}
        </p>
      )}
      <div className="preference-card">
        <div className="preference-row">
          <div>
            <div className="preference-label">
              <strong>Import passwords</strong>
              <PreferenceHint label="password import">
                Export a CSV from your browser’s password manager, then choose
                it here. Passwords are saved in your encrypted vault and
                excluded from AI access. Delete the readable CSV after
                importing.
              </PreferenceHint>
            </div>
            <p className="preference-note">From a browser password CSV.</p>
          </div>
          <Button variant="soft" disabled={busy} onClick={importPasswords}>
            Choose CSV
          </Button>
        </div>
      </div>

      {passwordMessage && (
        <p role="status" className="migration-feedback">
          {passwordMessage.replace(
            /^Error invoking remote method '[^']+': (?:Error: )?/,
            ''
          )}
        </p>
      )}
    </div>
  );
}
