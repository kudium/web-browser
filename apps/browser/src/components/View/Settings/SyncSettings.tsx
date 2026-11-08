import { Switch, Tooltip } from '@radix-ui/themes';
import {
  FolderOpen,
  PanelsTopLeft,
  SlidersHorizontal,
  KeyRound,
  ShieldCheck,
  Cloud,
  LockKeyhole,
  ChevronRight,
} from 'lucide-react';
import { AccountSyncSettings } from './AccountSyncSettings';
import {
  SyncSettings as SyncConfiguration,
  syncCategories,
} from '../../../browser/cloudSync';
import { browser } from '../../../browser/client';

const categoryDescriptions = {
  workspace: 'Spaces, groups, and folders',
  openTabs: 'Continue on another device',
  preferences: 'Search, fonts, and shortcuts',
};
const categoryIcons = {
  workspace: FolderOpen,
  openTabs: PanelsTopLeft,
  preferences: SlidersHorizontal,
};
export function SyncSettings({
  settings,
  busy,
  save,
}: {
  settings: SyncConfiguration;
  busy: boolean;
  save: (next: SyncConfiguration) => Promise<boolean>;
}) {
  return (
    <div className="cloud-sync-settings sync-visual-page">
      <div className="sync-control-card">
        <div className="preference-row">
          <div>
            <strong>Syncing</strong>
            <p className="preference-note">
              {settings.enabled ? 'Sync is on' : 'Sync is off'}
            </p>
          </div>
          <Switch
            aria-label="Enable sync"
            checked={settings.enabled}
            disabled={
              busy ||
              settings.provider !== 'kudiumbrowser' ||
              !Object.values(settings.categories).some(Boolean)
            }
            onCheckedChange={(enabled) => save({ ...settings, enabled })}
          />
        </div>
        <div className="preference-row">
          <span>Sync to</span>
          <select
            id="sync-destination"
            aria-label="Sync to"
            value={settings.provider}
            disabled={busy}
            onChange={(event) =>
              save({
                ...settings,
                provider: event.target.value as SyncConfiguration['provider'],
                enabled: false,
              })
            }
          >
            <option value="kudiumbrowser">Kudium Account</option>
            <option value="icloud" disabled>
              Apple iCloud — unavailable in this build
            </option>
          </select>
        </div>
        {settings.provider === 'icloud' && (
          <p className="preference-note">
            Choose Kudium Account to enable sync. iCloud browser-data sync is
            not connected in this build.
          </p>
        )}
      </div>
      <AccountSyncSettings
        enabled={settings.enabled && settings.provider === 'kudiumbrowser'}
        passwordsEnabled={Boolean(settings.categories.passwords)}
        onEnabled={() => {}}
      />
      <div className="sync-section-heading">
        <h2>Sync across devices</h2>
        <span>
          <ShieldCheck size={14} />
          Encrypted
        </span>
      </div>
      <div className="sync-category-grid">
        {syncCategories.map((category) => {
          const Icon = categoryIcons[category.id];
          return (
            <div
              className="sync-category-tile"
              key={category.id}
              data-selected={settings.categories[category.id]}
            >
              <div className="sync-tile-top">
                <span className={`sync-tile-icon sync-icon-${category.id}`}>
                  <Icon size={22} />
                </span>
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
              <strong>{category.title}</strong>
              <p>{categoryDescriptions[category.id]}</p>
            </div>
          );
        })}
        <div
          className="sync-category-tile"
          data-selected={Boolean(settings.categories.passwords)}
        >
          <div className="sync-tile-top">
            <span className="sync-tile-icon sync-icon-passwords">
              <KeyRound size={22} />
            </span>
            <Switch
              aria-label="Sync saved passwords"
              checked={Boolean(settings.categories.passwords)}
              disabled={busy}
              onCheckedChange={(passwords) =>
                save({
                  ...settings,
                  categories: { ...settings.categories, passwords },
                })
              }
            />
          </div>
          <strong>Saved passwords</strong>
          <p>Kudium logins · unlock to sync</p>
        </div>
      </div>
      <details className="sync-details">
        <summary>
          <Cloud size={15} /> Apple iCloud Passwords{' '}
          <span className="sync-state-pill">Requires Apple approval</span>
        </summary>
        <div className="sync-provider-card">
          <span className="sync-tile-icon">
            <Cloud size={20} />
          </span>
          <div>
            <strong>Apple iCloud Passwords</strong>
            <p>Apple approval required for Kudium</p>
          </div>
          <Tooltip content="macOS requires Apple’s managed browser entitlement before the iCloud Passwords extension can connect to Kudium.">
            <span className="sync-state-pill">Not connected</span>
          </Tooltip>
        </div>
      </details>
      <details className="sync-details">
        <summary>
          <LockKeyhole size={15} />
          Privacy & connection details
          <ChevronRight size={15} />
        </summary>
        <p>
          Browsing data uses your Kudium account and recovery key. Password sync
          is separate and requires unlocking Personal Data; only global saved
          logins are included. Group-only credentials, passkeys, cookies, AI
          keys, and AI history stay local.
        </p>
        <p>
          Apple iCloud Passwords is a separate service. Kudium needs Apple’s
          browser entitlement before its extension can connect. Signing the app
          alone does not grant access.
        </p>
        <button
          type="button"
          onClick={() => browser.preferences('open', { section: 'passwords' })}
        >
          Open Personal Data
        </button>
      </details>
    </div>
  );
}
