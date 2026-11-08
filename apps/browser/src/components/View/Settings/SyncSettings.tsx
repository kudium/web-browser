import { Button, Switch } from '@radix-ui/themes';
import {
  FolderOpen,
  PanelsTopLeft,
  SlidersHorizontal,
  KeyRound,
} from 'lucide-react';
import { PreferenceHint } from '../../UI/PreferenceHint';
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
      <AccountSyncSettings
        enabled={settings.enabled && settings.provider === 'kudiumbrowser'}
        passwordsEnabled={Boolean(settings.categories.passwords)}
        onEnabled={() => {}}
      />
      <div className="sync-control-card">
        <div className="preference-row">
          <div>
            <strong>Sync across devices</strong>
            <p className="preference-note">
              Keep your selected data up to date with your Kudium account.
            </p>
          </div>
          <Switch
            aria-label="Enable sync"
            checked={settings.enabled && settings.provider === 'kudiumbrowser'}
            disabled={busy || !Object.values(settings.categories).some(Boolean)}
            onCheckedChange={(enabled) =>
              save({ ...settings, provider: 'kudiumbrowser', enabled })
            }
          />
        </div>
      </div>
      <div className="sync-section-heading">
        <h2>What to sync</h2>
        <PreferenceHint label="sync privacy">
          Data is encrypted with your recovery key. Password sync requires
          unlocking Personal Data. Group-only credentials, passkeys, cookies, AI
          keys and AI history stay local.
        </PreferenceHint>
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
        </div>
      </div>
      <div className="preference-card">
        <div className="preference-row">
          <div className="preference-label">
            <strong>iCloud Passwords</strong>
            <PreferenceHint label="iCloud Passwords">
              Apple’s browser approval is required before its Passwords
              extension can connect to Kudium. This is separate from Kudium
              account sync.
            </PreferenceHint>
          </div>
          <span className="preference-note">Requires Apple approval</span>
        </div>
        <div className="preference-row">
          <strong>Personal Data</strong>
          <Button
            type="button"
            variant="soft"
            size="1"
            onClick={() =>
              browser.preferences('open', { section: 'passwords' })
            }
          >
            Open Personal Data
          </Button>
        </div>
      </div>
    </div>
  );
}
