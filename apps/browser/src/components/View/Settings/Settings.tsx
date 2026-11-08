import { useEffect, useState } from 'react';
import {
  Button,
  Switch,
  Select,
  Tabs,
  TextField,
  TextArea,
  Callout,
} from '@radix-ui/themes';
import {
  Search,
  Sparkles,
  Cloud,
  Keyboard,
  Settings2,
  Palette,
  Shield,
  Globe,
  Languages,
  Download,
  Layers,
  Blocks,
  Code2,
  Info,
  ArrowDownToLine,
} from 'lucide-react';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { PasswordManager } from './PasswordManager';
import { AISettingsPage } from './AISettingsPage';
import { GroupPicker } from '../../UI/GroupPicker';
import { BrowserImportSettings } from './BrowserImportSettings';
import { SyncSettings } from './SyncSettings';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { AdvancedSettings } from './AdvancedSettings';
import { SearchEngineManager } from './SearchEngineManager';
import { browser } from '../../../browser/client';
import {
  BrowserPreferences,
  defaultPreferences,
  preferenceControls,
  PreferenceAction,
  PreferenceInfo,
} from '../../../browser/preferences';
import { AppUpdateSettings } from './AppUpdateSettings';
import { Workspace } from './tabs/Workspace';
import { TabOption } from './tabs/TabOption';

// Add a navigation entry here and preference controls in browser/preferences.ts.
const sections = [
  {
    id: 'updates',
    title: 'Updates',
    icon: Download,
    description:
      'Check for new versions, download updates and choose when to restart and install.',
  },
  {
    id: 'import',
    title: 'Browser migration',
    icon: ArrowDownToLine,
    description:
      'Import bookmarks or links from your default browser, Arc, Chrome, Dia, Edge, Safari, Firefox, and other browsers.',
  },
  {
    id: 'network',
    title: 'Network',
    icon: Globe,
    description:
      'Secure DNS, DNS-over-HTTPS, proxy, SOCKS, PAC and connection diagnostics.',
  },
  {
    id: 'compatibility',
    title: 'Compatibility',
    icon: Code2,
    description: 'Automatic or custom user agent per session and website.',
  },
  {
    id: 'websites',
    title: 'Website behavior',
    icon: Settings2,
    description:
      'JavaScript, images, autoplay, popup exceptions and persistent site zoom.',
  },
  {
    id: 'startup',
    title: 'Startup',
    icon: Globe,
    description: 'Restore your workspace, startup pages and default browser.',
  },
  {
    id: 'passwords',
    title: 'Personal Data',
    icon: Shield,
    description:
      'Logins, profiles, payment methods and personal knowledge, encrypted on this device.',
  },
  {
    id: 'ai',
    title: 'AI assistant',
    icon: Sparkles,
    description: 'Models and connections.',
  },
  {
    id: 'sync',
    title: 'Sync',
    icon: Cloud,
    description:
      'Choose iCloud or Kudium Browser and the browsing data you want to sync.',
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    icon: Keyboard,
    description: 'Customize navigation and browser controls.',
  },
  {
    id: 'performance',
    title: 'Performance',
    icon: Layers,
    description: 'Reduce memory use while keeping your tabs saved.',
  },
  {
    id: 'search',
    title: 'Search engine',
    icon: Globe,
    description: 'Choose how you search the web.',
  },
  {
    id: 'appearance',
    title: 'Appearance',
    icon: Palette,
    description: 'Make your workspace and websites comfortable.',
  },
  {
    id: 'privacy',
    title: 'Privacy & security',
    icon: Shield,
    description: 'Manage website access and data within each isolated profile.',
  },
  {
    id: 'languages',
    title: 'Languages',
    icon: Languages,
    description: 'Customize spelling assistance for websites.',
  },
  {
    id: 'downloads',
    title: 'Downloads',
    icon: Download,
    description: 'Choose where your files go.',
  },
  {
    id: 'apps',
    title: 'Workspace',
    icon: Layers,
    description: 'Manage groups, spaces and archived tabs in one place.',
  },
  {
    id: 'extensions',
    title: 'Extensions',
    icon: Blocks,
    description:
      'Use extensions in selected groups or all current and future groups.',
  },
  {
    id: 'developer',
    title: 'Developer',
    icon: Code2,
    description:
      'Inspect websites and customize Kudium Browser’s configuration.',
  },
  {
    id: 'about',
    title: 'About Kudium Browser',
    icon: Info,
    description: 'Browser and engine information.',
  },
];
const sectionOrder = [
  'search',
  'sync',
  'import',
  'appearance',
  'startup',
  'ai',
  'passwords',
  'apps',
  'shortcuts',
  'downloads',
  'privacy',
  'extensions',
  'languages',
  'performance',
  'websites',
  'network',
  'compatibility',
  'developer',
  'updates',
  'about',
];
export const preferenceSections = sectionOrder.map(
  (id) => sections.find((item) => item.id === id)!
);
export function Settings() {
  const [section, setSection] = useState(() => {
    const requested = window.location.hash.slice(1);
    if (['spaces', 'archive'].includes(requested)) return 'apps';
    return preferenceSections.some((item) => item.id === requested)
      ? requested
      : 'search';
  });
  const [query, setQuery] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState(() => {
    const requested = window.location.hash.slice(1);
    return ['apps', 'spaces', 'archive'].includes(requested)
      ? requested
      : 'apps';
  });
  useEffect(
    () =>
      window.electron?.browser?.onPreferenceSection?.((next) => {
        if (['apps', 'spaces', 'archive'].includes(next)) {
          setWorkspaceTab(next);
          setSection('apps');
          setQuery('');
        } else if (preferenceSections.some((item) => item.id === next)) {
          setSection(next);
          setQuery('');
        }
      }),
    []
  );
  const [preferences, setPreferences] =
    useState<BrowserPreferences>(defaultPreferences);
  const [info, setInfo] = useState<PreferenceInfo>();
  const [profileId, setProfileId] = useState('');
  const [extensionScope, setExtensionScope] = useState('all');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [defaultBrowserBusy, setDefaultBrowserBusy] = useState(false);
  const [defaultBrowserMessage, setDefaultBrowserMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sleepSites, setSleepSites] = useState('');
  useEffect(
    () => setSleepSites((preferences.discardExcludedSites || []).join('\n')),
    [preferences.discardExcludedSites]
  );
  useEffect(() => {
    let alive = true;
    Promise.all([browser.preferences('get'), browser.preferenceAction('info')])
      .then(([saved, metadata]) => {
        if (!alive) return null;
        setPreferences(saved);
        setInfo(metadata as PreferenceInfo);
        setProfileId((metadata as PreferenceInfo).profiles[0]?.id || '');
        setReady(true);
        return null;
      })
      .catch((reason) => {
        if (alive) setError(String(reason));
      });
    const unsubscribe = browser.onPreferences(setPreferences);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const refresh = () =>
      browser
        .preferenceAction('info')
        .then((metadata) => {
          setInfo(metadata as PreferenceInfo);
          return null;
        })
        .catch((reason) => setError(String(reason)));
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const save = async (patch: Partial<BrowserPreferences>) => {
    setBusy(true);
    setError('');
    try {
      setPreferences(await browser.preferences('update', patch));
      return true;
    } catch (reason) {
      setError(String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const action = async (name: PreferenceAction) => {
    setBusy(true);
    setError('');
    try {
      const result = await browser.preferenceAction(
        name,
        name === 'store' || name === 'extensions' ? extensionScope : profileId
      );
      if (result && 'searchEngine' in result) setPreferences(result);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  const makeDefaultBrowser = async () => {
    setDefaultBrowserBusy(true);
    setDefaultBrowserMessage('');
    try {
      const result = await browser.preferenceAction('set-default-browser');
      if (result && 'text' in result) setDefaultBrowserMessage(result.text);
      setInfo((await browser.preferenceAction('info')) as PreferenceInfo);
    } catch (reason) {
      setDefaultBrowserMessage(String(reason));
    } finally {
      setDefaultBrowserBusy(false);
    }
  };
  let status = 'Saved automatically';
  if (
    [
      'network',
      'compatibility',
      'websites',
      'startup',
      'privacy',
      'languages',
      'performance',
    ].includes(section)
  )
    status = 'Advanced changes require Save';
  if (busy) status = 'Saving…';
  const filter = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(filter);
  const visible = filter
    ? preferenceSections.filter(
        (item) =>
          matches(`${item.title} ${item.description}`) ||
          preferenceControls.some(
            (control) =>
              control.section === item.id &&
              matches(`${control.title} ${control.description}`)
          )
      )
    : preferenceSections.filter((item) => item.id === section);
  const profileChooser = (label: string) => (
    <div className="preference-row">
      <div>
        <div className="preference-label">
          <strong>{label}</strong>
          <PreferenceHint label={label}>
            Actions affect the selected login profile and every group sharing
            it.
          </PreferenceHint>
        </div>
      </div>
      <GroupPicker
        value={profileId}
        onChange={setProfileId}
        disabled={!info?.profiles.length || busy}
        label="Browser profile"
        options={info?.profiles || []}
      />
    </div>
  );
  return (
    <Tabs.Root
      value={section}
      onValueChange={(value) => {
        setSection(value);
        setQuery('');
      }}
      className="preferences-shell"
      orientation="vertical"
    >
      <div className="preferences-drag-region" aria-hidden="true" />
      <aside className="preferences-sidebar">
        <div className="preferences-brand">
          <Settings2 size={21} />
          <strong>Preferences</strong>
        </div>
        <TextField.Root
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings"
          aria-label="Search settings"
        >
          <TextField.Slot>
            <Search size={16} />
          </TextField.Slot>
        </TextField.Root>
        <Tabs.List className="preferences-navigation">
          {preferenceSections.map((item) => (
            <Tabs.Trigger key={item.id} value={item.id}>
              <item.icon size={17} />
              {item.title}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <span className="preferences-footer">Kudium Browser</span>
      </aside>
      <main className="preferences-main">
        <header className="preferences-topbar">
          <span>{filter ? 'Search results' : 'Browser preferences'}</span>
          <span aria-live="polite">
            {!['ai', 'passwords'].includes(section) &&
              (ready ? status : 'Loading…')}
          </span>
        </header>
        {info?.defaultBrowser === false && (
          <div
            className="default-browser-banner"
            role="region"
            aria-label="Default browser"
          >
            <Globe size={20} aria-hidden="true" />
            <div className="default-browser-copy">
              <strong>Make Kudium Browser your default browser</strong>
              <p role={defaultBrowserMessage ? 'status' : undefined}>
                {defaultBrowserMessage ||
                  'Open links from other apps in your active group.'}
              </p>
            </div>
            <Button
              variant="soft"
              disabled={defaultBrowserBusy}
              onClick={makeDefaultBrowser}
            >
              {defaultBrowserBusy ? 'Requesting…' : 'Make default'}
            </Button>
          </div>
        )}
        {error && (
          <Callout.Root color="red" role="alert">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        {!visible.length && (
          <p className="preferences-empty">
            No settings match “{query}”. Try privacy, zoom, downloads or
            extensions.
          </p>
        )}
        {visible.map((item) => (
          <section
            className="preference-section"
            key={item.id}
            aria-label={item.title}
          >
            <header>
              <h1>{item.title}</h1>
              <PreferenceHint label={item.title}>
                {item.description}
              </PreferenceHint>
            </header>
            {item.id === 'updates' && <AppUpdateSettings />}
            {item.id === 'import' && <BrowserImportSettings />}
            {item.id === 'ai' && (
              <AISettingsPage>
                <div className="preference-row">
                  <div>
                    <strong id="ai-project-instructions-label">
                      Project instructions
                    </strong>
                    <p>Keep browser context in linked projects.</p>
                  </div>
                  <Switch
                    aria-labelledby="ai-project-instructions-label"
                    checked={preferences.writeBrowserInstructions}
                    disabled={!ready || busy}
                    onCheckedChange={(value) =>
                      save({ writeBrowserInstructions: value })
                    }
                  />
                </div>
              </AISettingsPage>
            )}
            {item.id === 'passwords' && <PasswordManager />}
            <div
              className={
                [
                  'passwords',
                  'sync',
                  'import',
                  'apps',
                  'spaces',
                  'archive',
                ].includes(item.id)
                  ? 'preference-page-content'
                  : 'preference-card'
              }
            >
              {preferenceControls
                .filter(
                  (control) =>
                    control.section === item.id &&
                    item.id !== 'ai' &&
                    (!filter ||
                      matches(
                        `${item.title} ${control.title} ${control.description}`
                      ))
                )
                .map((control) => (
                  <div className="preference-row" key={control.key}>
                    <div>
                      <div className="preference-label">
                        <strong>{control.title}</strong>
                        {item.id !== 'ai' && (
                          <PreferenceHint label={control.title}>
                            {control.description}
                          </PreferenceHint>
                        )}
                      </div>
                      {item.id === 'ai' && <p>{control.description}</p>}
                    </div>
                    {control.kind === 'toggle' && (
                      <Switch
                        checked={Boolean(preferences[control.key])}
                        aria-label={control.title}
                        disabled={!ready || busy}
                        onCheckedChange={(value) =>
                          save({ [control.key]: value })
                        }
                      />
                    )}
                    {control.kind === 'number' && (
                      <TextField.Root
                        key={String(preferences[control.key])}
                        type="number"
                        min={control.min}
                        max={control.max}
                        step="1"
                        defaultValue={String(preferences[control.key])}
                        aria-label={control.title}
                        disabled={
                          !ready || busy || !preferences.discardInactiveTabs
                        }
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (
                            !event.target.value ||
                            !Number.isInteger(value) ||
                            value < (control.min || 1) ||
                            value > (control.max || 1440)
                          ) {
                            setError(
                              `Enter a whole number between ${control.min} and ${control.max} minutes.`
                            );
                            event.target.value = String(
                              preferences[control.key]
                            );
                          } else if (value !== preferences[control.key])
                            save({ [control.key]: value });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                    )}
                    {control.kind === 'select' && (
                      <Select.Root
                        value={String(preferences[control.key])}
                        disabled={!ready || busy}
                        onValueChange={(value) =>
                          save({
                            [control.key]:
                              typeof defaultPreferences[control.key] ===
                              'number'
                                ? Number(value)
                                : value,
                          })
                        }
                      >
                        <Select.Trigger aria-label={control.title} />
                        <Select.Content>
                          {(control.key === 'searchEngine'
                            ? preferences.searchEngines.map((engine) => ({
                                label: engine.name,
                                value: engine.id,
                              }))
                            : control.options
                          )?.map((option) => (
                            <Select.Item
                              key={option.value}
                              value={String(option.value)}
                            >
                              {option.label}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Root>
                    )}
                  </div>
                ))}
              {item.id === 'sync' && (
                <SyncSettings
                  settings={preferences.cloudSync}
                  busy={!ready || busy}
                  save={(cloudSync) => save({ cloudSync })}
                />
              )}
              {item.id === 'shortcuts' && (
                <KeyboardShortcuts
                  bindings={preferences.shortcuts}
                  busy={!ready || busy}
                  save={(shortcuts) => save({ shortcuts })}
                />
              )}
              {item.id === 'search' && (
                <SearchEngineManager
                  preferences={preferences}
                  busy={!ready || busy}
                  save={save}
                />
              )}
              {item.id === 'performance' && (
                <div className="preference-row">
                  <div>
                    <div className="preference-label">
                      <strong>Always keep these websites awake</strong>
                      <PreferenceHint label="Website exclusions">
                        One domain or website address per line. Subdomains are
                        included. Editors, active media, downloads, capture
                        permissions and unload warnings are always protected.
                      </PreferenceHint>
                    </div>
                  </div>
                  <div className="preference-field-stack">
                    <TextArea
                      aria-label="Websites excluded from sleeping"
                      value={sleepSites}
                      onChange={(event) => setSleepSites(event.target.value)}
                      disabled={!ready || busy}
                      placeholder={'example.com\nmail.example.org'}
                      rows={4}
                    />
                    <Button
                      disabled={!ready || busy}
                      onClick={() =>
                        save({
                          discardExcludedSites: sleepSites
                            .split(/\r?\n/)
                            .map((site) => site.trim())
                            .filter(Boolean),
                        })
                      }
                    >
                      Save website exclusions
                    </Button>
                  </div>
                </div>
              )}
              {item.id === 'appearance' && <TabOption compact />}
              {item.id === 'languages' && (
                <div className="preference-row">
                  <div>
                    <div className="preference-label">
                      <strong>Spelling language</strong>
                      <PreferenceHint label="Spelling language">
                        Use the operating system default or choose a supported
                        dictionary.
                      </PreferenceHint>
                    </div>
                  </div>
                  <Select.Root
                    value={preferences.spellcheckLanguage || 'system'}
                    disabled={!ready || busy}
                    onValueChange={(value) =>
                      save({
                        spellcheckLanguage: value === 'system' ? '' : value,
                      })
                    }
                  >
                    <Select.Trigger aria-label="Spelling language" />
                    <Select.Content>
                      <Select.Item value="system">System default</Select.Item>
                      {info?.languages.map((language) => (
                        <Select.Item key={language} value={language}>
                          {language}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </div>
              )}
              {item.id === 'downloads' && (
                <div className="preference-row">
                  <div>
                    <strong>Download location</strong>
                    <p className="preference-path">
                      {preferences.downloadDirectory ||
                        'System Downloads folder'}
                    </p>
                  </div>
                  <div className="preference-actions">
                    <Button
                      variant="soft"
                      disabled={busy}
                      onClick={() => action('choose-download-directory')}
                    >
                      Change…
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => action('open-download-directory')}
                    >
                      Open folder
                    </Button>
                  </div>
                </div>
              )}
              {item.id === 'privacy' && (
                <>
                  {profileChooser('Site data')}
                  <div className="preference-row">
                    <div>
                      <strong>Clear browsing data</strong>
                      <p>
                        Clear cached files or cookies and storage for websites
                        in this profile. Clearing site data signs you out.
                      </p>
                    </div>
                    <div className="preference-actions">
                      <Button
                        variant="soft"
                        disabled={!profileId || busy}
                        onClick={() => action('clear-cache')}
                      >
                        Clear cache…
                      </Button>
                      <Button
                        color="red"
                        variant="soft"
                        disabled={!profileId || busy}
                        onClick={() => action('clear-data')}
                      >
                        Clear site data…
                      </Button>
                    </div>
                  </div>
                </>
              )}
              {[
                'network',
                'compatibility',
                'websites',
                'startup',
                'privacy',
                'languages',
                'performance',
              ].includes(item.id) && (
                <AdvancedSettings
                  section={item.id}
                  preferences={preferences}
                  info={info}
                  busy={busy || !ready}
                  save={save}
                />
              )}
              {item.id === 'apps' && (
                <Workspace tab={workspaceTab} onTabChange={setWorkspaceTab} />
              )}
              {item.id === 'extensions' && (
                <>
                  <div className="preference-row">
                    <div>
                      <div className="preference-label">
                        <strong>Extension access</strong>
                        <PreferenceHint label="Extension access">
                          {extensionScope === 'all'
                            ? 'Extensions can run in all current and future login profiles. Groups sharing a login also share its extension data.'
                            : 'Install extensions for this group. You can change access later.'}
                        </PreferenceHint>
                      </div>
                    </div>
                    <GroupPicker
                      value={extensionScope}
                      onChange={setExtensionScope}
                      disabled={busy}
                      label="Extension access"
                      options={[
                        { id: 'all', name: 'All groups' },
                        ...(info?.profiles || []),
                      ]}
                    />
                  </div>
                  <div className="preference-row">
                    <div>
                      <div className="preference-label">
                        <strong>Chrome extensions</strong>
                        <PreferenceHint label="Chrome extensions">
                          {extensionScope === 'all' ? (
                            'All groups selected. '
                          ) : (
                            <>
                              {info?.profiles.find(
                                (profile) => profile.id === extensionScope
                              )?.extensions || 0}{' '}
                              available in this group.{' '}
                            </>
                          )}
                          Review permissions before installing. You can change
                          access later in Manage extensions. Electron supports a
                          subset of Chrome APIs.
                        </PreferenceHint>
                      </div>
                    </div>
                    <div className="preference-actions">
                      <Button
                        disabled={!info?.profiles.length || busy}
                        onClick={() => action('store')}
                      >
                        Open Chrome Web Store
                      </Button>
                      <Button
                        variant="soft"
                        disabled={!info?.profiles.length || busy}
                        onClick={() => action('extensions')}
                      >
                        Manage extensions…
                      </Button>
                    </div>
                  </div>
                </>
              )}
              {item.id === 'developer' && (
                <>
                  {profileChooser('Inspect a profile')}
                  <div className="preference-row">
                    <div>
                      <div className="preference-label">
                        <strong>Developer tools</strong>
                        <PreferenceHint label="Developer tools">
                          Inspect an open website’s DOM, network requests and
                          console.
                        </PreferenceHint>
                      </div>
                    </div>
                    <Button
                      variant="soft"
                      disabled={!profileId || busy}
                      onClick={() => action('devtools')}
                    >
                      Open DevTools
                    </Button>
                  </div>
                  <div className="preference-row">
                    <div>
                      <div className="preference-label">
                        <strong>Browser configuration</strong>
                        <PreferenceHint label="Browser configuration">
                          Reveal the JSON preferences file. Manual edits take
                          effect on next launch.
                        </PreferenceHint>
                      </div>
                    </div>
                    <Button
                      variant="soft"
                      onClick={() => action('reveal-config')}
                    >
                      Reveal configuration
                    </Button>
                  </div>
                </>
              )}
              {item.id === 'about' && (
                <>
                  <div className="preference-row">
                    <div>
                      <strong>Kudium Browser</strong>
                      <p>By Kudium</p>
                      <p>
                        Version {info?.versions.kudiumbrowser || '—'} · Electron{' '}
                        {info?.versions.engine || '—'} · Chromium{' '}
                        {info?.versions.chromium || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="preference-row">
                    <div>
                      <strong>Reset browser preferences</strong>
                      <p>
                        Restore defaults while keeping your apps, cookies and
                        extensions.
                      </p>
                    </div>
                    <Button
                      color="red"
                      variant="soft"
                      disabled={busy}
                      onClick={() => action('reset')}
                    >
                      Reset preferences…
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        ))}
      </main>
    </Tabs.Root>
  );
}
