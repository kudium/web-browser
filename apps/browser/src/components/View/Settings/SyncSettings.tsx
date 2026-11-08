import { useEffect, useState } from 'react';
import { Switch, Select, Callout } from '@radix-ui/themes';
import { Cloud } from 'lucide-react';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { browser } from '../../../browser/client';
import {
  SyncSettings as SyncConfiguration,
  SyncProvider,
  CloudSyncStatus,
  syncCategories,
} from '../../../browser/cloudSync';

export function SyncSettings({
  settings,
  busy,
  save,
}: {
  settings: SyncConfiguration;
  busy: boolean;
  save: (next: SyncConfiguration) => Promise<boolean>;
}) {
  const mac =
    window.electron?.platform === 'darwin' ||
    navigator.platform.toLowerCase().includes('mac');
  const [status, setStatus] = useState<CloudSyncStatus>();
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    browser
      .preferenceAction('sync-status')
      .then((result) => {
        if (!result || !('connected' in result))
          throw new Error('Invalid sync status');
        if (alive) {
          setStatus(result);
          setError('');
        }
        return null;
      })
      .catch(() => {
        if (alive) {
          setStatus(undefined);
          setError('Sync status is unavailable. Nothing is being uploaded.');
        }
      });
    return () => {
      alive = false;
    };
  }, [settings]);
  return (
    <div className="cloud-sync-settings">
      <div className="preference-card">
        <div className="preference-row">
          <div>
            <div className="preference-label">
              <strong>Enable sync</strong>
              <PreferenceHint label="Enable sync">
                Use your chosen account to sync selected browsing data.
              </PreferenceHint>
            </div>
          </div>
          <Switch
            aria-label="Enable sync"
            checked={settings.enabled}
            disabled={busy}
            onCheckedChange={(enabled) => save({ ...settings, enabled })}
          />
        </div>
        <div className="preference-row">
          <div>
            <div className="preference-label">
              <strong>Sync account</strong>
              <PreferenceHint label="Sync account">
                {mac
                  ? 'iCloud is the default on Mac.'
                  : 'Kudium Browser is the default on this device.'}
              </PreferenceHint>
            </div>
          </div>
          <Select.Root
            value={settings.provider}
            disabled={busy}
            onValueChange={(provider) =>
              save({ ...settings, provider: provider as SyncProvider })
            }
          >
            <Select.Trigger aria-label="Sync provider" />
            <Select.Content>
              <Select.Item value="icloud" disabled={!mac}>
                iCloud
              </Select.Item>
              <Select.Item value="touchbox">Kudium Browser account</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <Callout.Root
        className="preference-status"
        role="status"
        color={settings.enabled ? 'amber' : 'gray'}
      >
        <Callout.Icon>
          <Cloud size={18} />
        </Callout.Icon>
        <Callout.Text>
          <strong>{settings.enabled ? 'Setup required' : 'Sync is off'}</strong>
          <br />
          {error ||
            (!settings.enabled && status
              ? 'Your sync choices are saved.'
              : status?.message) ||
            'Checking connection…'}
        </Callout.Text>
      </Callout.Root>
      <h2 className="preference-group-heading">Choose what to sync</h2>
      <div className="preference-card">
        {syncCategories.map((category) => (
          <div className="preference-row" key={category.id}>
            <div>
              <div className="preference-label">
                <strong>{category.title}</strong>
                <PreferenceHint label={category.title}>
                  {category.description}
                </PreferenceHint>
              </div>
            </div>
            <Switch
              aria-label={`Sync ${category.title.toLowerCase()}`}
              checked={settings.categories[category.id]}
              disabled={busy}
              onCheckedChange={(enabled) =>
                save({
                  ...settings,
                  categories: {
                    ...settings.categories,
                    [category.id]: enabled,
                  },
                })
              }
            />
          </div>
        ))}
      </div>
      <p className="preference-note">
        Passwords and passkeys use iCloud Keychain separately. Cookies and login
        tokens stay on this {mac ? 'Mac' : 'device'}; websites may ask you to
        sign in again.
      </p>
    </div>
  );
}
