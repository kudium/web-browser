import { Switch } from '@radix-ui/themes';
import {
  FolderOpen,
  PanelsTopLeft,
  SlidersHorizontal,
  KeyRound,
  NotebookPen,
} from 'lucide-react';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { AccountSyncSettings } from './AccountSyncSettings';
import {
  SyncSettings as SyncConfiguration,
  syncCategories,
} from '../../../browser/cloudSync';

const categoryDescriptions = {
  notes: 'Encrypted notes; unlock to back up',
  workspace: 'Spaces, groups, and folders',
  openTabs: 'Continue on another device',
  preferences: 'Search, fonts, and shortcuts',
};
const categoryIcons = {
  notes: NotebookPen,
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
      <div className="sync-section-heading">
        <h2>Syncing options</h2>
      </div>
      <div className="preference-card sync-options-card">
        <div className="sync-account-option">
          <div className="preference-row">
            <div>
              <strong>Kudium Browser Account</strong>
              <p className="preference-note">
                Sync across devices after signing in. Older encrypted backups
                may need a recovery key once.
              </p>
            </div>
            <Switch
              aria-label="Sync with Kudium Browser Account"
              checked={
                settings.enabled && settings.provider === 'kudiumbrowser'
              }
              disabled={busy}
              onCheckedChange={(enabled) =>
                save({ ...settings, provider: 'kudiumbrowser', enabled })
              }
            />
          </div>
          {settings.enabled && settings.provider === 'kudiumbrowser' && (
            <AccountSyncSettings
              enabled
              passwordsEnabled={Boolean(settings.categories.passwords)}
              notesEnabled={Boolean(settings.categories.notes)}
              onEnabled={() => {}}
            />
          )}
        </div>
        <div className="preference-row">
          <div>
            <strong>iCloud</strong>
            <p className="preference-note">
              Not available in this build. Your choice is saved for when iCloud
              sync is available.
            </p>
          </div>
          <Switch
            aria-label="Sync with iCloud"
            checked={Boolean(
              settings.icloud ||
                (settings.provider === 'icloud' && settings.enabled)
            )}
            disabled={busy}
            onCheckedChange={(icloud) => save({ ...settings, icloud })}
          />
        </div>
      </div>
      <div className="sync-section-heading">
        <h2>Included in sync</h2>
        <PreferenceHint label="sync privacy">
          Account sync encrypts data with an account-managed key, so signing in can unlock it on another device. This is not end-to-end encryption. Older backups may still require their recovery key. Password sync requires unlocking Personal Data. Group-only credentials, passkeys, cookies, AI
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
                  checked={Boolean(settings.categories[category.id])}
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
          <p>Saved logins sync when Personal Data is unlocked.</p>
        </div>
      </div>
    </div>
  );
}
