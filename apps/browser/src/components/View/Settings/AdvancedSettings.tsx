import { useEffect, useState, ReactNode } from 'react';
import { PreferenceHint } from '../../UI/PreferenceHint';
import {
  Button,
  Select,
  Switch,
  TextField,
  TextArea,
  Callout,
} from '@radix-ui/themes';
import {
  AdvancedPreferences,
  defaultAdvanced,
  ProxyPreference,
  SiteRule,
} from '../../../browser/advancedPreferences';
import {
  BrowserPreferences,
  PreferenceAction,
  PreferenceInfo,
} from '../../../browser/preferences';
import { browser } from '../../../browser/client';
import { GroupPicker } from '../../UI/GroupPicker';

type Props = {
  section: string;
  preferences: BrowserPreferences;
  info: PreferenceInfo | undefined;
  busy: boolean;
  save: (patch: Partial<BrowserPreferences>) => Promise<boolean>;
};
export function AdvancedSettings({
  section,
  preferences,
  info,
  busy,
  save,
}: Props) {
  const [draft, setDraft] = useState<AdvancedPreferences>(
    preferences.advanced || defaultAdvanced
  );
  const [profile, setProfile] = useState('global');
  const [report, setReport] = useState('');
  const [running, setRunning] = useState(false);
  const [site, setSite] = useState('');
  const [error, setError] = useState('');
  useEffect(
    () => setDraft(preferences.advanced || defaultAdvanced),
    [preferences.advanced]
  );
  const set = <K extends keyof AdvancedPreferences>(
    key: K,
    value: AdvancedPreferences[K]
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const row = (title: string, description: string, control: ReactNode) => (
    <div className="preference-row">
      <div>
        <div className="preference-label">
          <strong>{title}</strong>
          <PreferenceHint label={title}>{description}</PreferenceHint>
        </div>
      </div>
      {control}
    </div>
  );
  const choose = (
    label: string,
    value: string,
    options: [string, string][],
    change: (next: string) => void
  ) => (
    <Select.Root
      value={value}
      onValueChange={change}
      disabled={busy || running}
    >
      <Select.Trigger aria-label={label} />
      <Select.Content>
        {options.map(([id, name]) => (
          <Select.Item key={id} value={id}>
            {name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
  const input = (
    label: string,
    value: string,
    change: (next: string) => void,
    placeholder = ''
  ) => (
    <TextField.Root
      aria-label={label}
      value={value}
      onChange={(event) => change(event.target.value)}
      placeholder={placeholder}
      disabled={busy || running}
      className="advanced-setting-input"
    />
  );
  const toggle = (
    label: string,
    value: boolean,
    change: (next: boolean) => void
  ) => (
    <Switch
      aria-label={label}
      checked={value}
      onCheckedChange={change}
      disabled={busy || running}
    />
  );
  const lines = (
    label: string,
    value: string[],
    change: (next: string[]) => void
  ) => (
    <TextArea
      aria-label={label}
      value={value.join('\n')}
      onChange={(event) => change(event.target.value.split('\n'))}
      placeholder="One https:// URL per line"
      disabled={busy || running}
    />
  );
  const diagnostic = async (action: PreferenceAction) => {
    setRunning(true);
    setError('');
    try {
      const selected = profile === 'global' ? info?.profiles[0]?.id : profile;
      const result = await browser.preferenceAction(action, selected);
      if (result && 'kind' in result && result.kind === 'diagnostic')
        setReport(result.text);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRunning(false);
    }
  };
  const proxy =
    profile === 'global'
      ? draft.proxy
      : draft.profileProxies[profile] || draft.proxy;
  const updateProxy = (patch: Partial<ProxyPreference>) => {
    const next = { ...proxy, ...patch };
    if (profile === 'global') set('proxy', next);
    else set('profileProxies', { ...draft.profileProxies, [profile]: next });
  };
  const scope = row(
    'Apply to',
    'Browser defaults apply to all groups. An override applies to every group sharing the selected login profile.',
    <GroupPicker
      label="Settings group"
      value={profile}
      onChange={setProfile}
      disabled={busy || running}
      options={[
        {
          id: 'global',
          name: 'Browser defaults',
          detail: 'Used by groups without an override',
        },
        ...(info?.profiles || []).map((item) => ({
          id: item.id,
          name: item.name,
          detail: 'Includes groups sharing this login profile',
        })),
      ]}
    />
  );
  const deleteOverride = () => {
    const proxies = { ...draft.profileProxies };
    if (section === 'network') delete proxies[profile];
    const agents = { ...draft.profileUserAgents };
    if (section === 'compatibility') delete agents[profile];
    setDraft((current) => ({
      ...current,
      profileProxies: proxies,
      profileUserAgents: agents,
    }));
  };
  const modifySite = (index: number, patch: Partial<SiteRule>) =>
    set(
      'siteRules',
      draft.siteRules.map((rule, i) =>
        i === index ? { ...rule, ...patch } : rule
      )
    );
  return (
    <div className="advanced-preferences">
      {section === 'network' && (
        <>
          {row(
            'Secure DNS mode',
            'Applies to all sessions. Automatic allows system DNS fallback; secure-only requires your chosen provider.',
            choose(
              'Secure DNS mode',
              draft.dnsMode,
              [
                ['automatic', 'Automatic with fallback'],
                ['secure', 'Secure only'],
                ['off', 'System DNS without DoH'],
              ],
              (value) => set('dnsMode', value as AdvancedPreferences['dnsMode'])
            )
          )}
          {row(
            'DNS provider',
            'Choose a DNS-over-HTTPS provider or use the operating system configuration.',
            choose(
              'DNS provider',
              draft.dnsProvider,
              [
                ['system', 'System default'],
                ['cloudflare', 'Cloudflare'],
                ['google', 'Google'],
                ['quad9', 'Quad9'],
                ['custom', 'Custom endpoint'],
              ],
              (value) =>
                set('dnsProvider', value as AdvancedPreferences['dnsProvider'])
            )
          )}
          {draft.dnsProvider === 'custom' &&
            row(
              'Custom DNS endpoint',
              'An HTTPS DNS-over-HTTPS POST endpoint.',
              input(
                'Custom DNS endpoint',
                draft.dnsEndpoint,
                (value) => set('dnsEndpoint', value),
                'https://resolver.example/dns-query'
              )
            )}
          {scope}
          {row(
            'Proxy mode',
            'System uses your operating system proxy. Fixed servers supports HTTP, HTTPS and SOCKS proxies.',
            choose(
              'Proxy mode',
              proxy.mode,
              [
                ['system', 'System proxy'],
                ['direct', 'Direct connection'],
                ['fixed_servers', 'Custom proxy'],
                ['pac_script', 'PAC URL'],
              ],
              (value) => updateProxy({ mode: value as ProxyPreference['mode'] })
            )
          )}
          {proxy.mode === 'fixed_servers' &&
            row(
              'Proxy server',
              'Use host:port, socks5://host:port, or http=host:port;https=host:port. Authenticated proxies are not supported yet.',
              input(
                'Proxy server',
                proxy.rules,
                (value) => updateProxy({ rules: value }),
                'socks5://127.0.0.1:1080'
              )
            )}
          {proxy.mode === 'pac_script' &&
            row(
              'PAC URL',
              'URL of a proxy auto-configuration script.',
              input('PAC URL', proxy.pacURL, (value) =>
                updateProxy({ pacURL: value })
              )
            )}
          {row(
            'Proxy bypass list',
            'Chromium bypass rules separated by semicolons, for example localhost;*.internal.example.',
            input('Proxy bypass list', proxy.bypass, (value) =>
              updateProxy({ bypass: value })
            )
          )}
          {profile !== 'global' && (
            <div className="advanced-setting-actions">
              <Button variant="soft" onClick={deleteOverride} disabled={busy}>
                Use browser defaults
              </Button>
            </div>
          )}
          <p className="advanced-setting-note">
            Save before testing. Global diagnostics use the first open session;
            select a session to test its effective configuration. Proxy changes
            close existing network connections.
          </p>
          <div className="preference-actions advanced-setting-actions">
            <Button
              disabled={busy || running || !info?.profiles.length}
              onClick={() => diagnostic('network-test')}
            >
              Test connection
            </Button>
            <Button
              variant="soft"
              disabled={busy || running || !info?.profiles.length}
              onClick={() => diagnostic('network-log-start')}
            >
              Start network log…
            </Button>
            <Button
              variant="soft"
              disabled={busy || running || !info?.profiles.length}
              onClick={() => diagnostic('network-log-stop')}
            >
              Stop network log
            </Button>
          </div>
        </>
      )}
      {section === 'compatibility' && (
        <>
          {scope}
          {row(
            'Custom user agent',
            'Leave empty for Automatic. Overrides can affect site compatibility and verification; reopen tabs after changing identity.',
            input(
              'Custom user agent',
              profile === 'global'
                ? draft.userAgent
                : draft.profileUserAgents[profile] || '',
              (value) =>
                profile === 'global'
                  ? set('userAgent', value)
                  : set('profileUserAgents', {
                      ...draft.profileUserAgents,
                      [profile]: value,
                    }),
              'Automatic (actual Chromium version)'
            )
          )}
          {profile !== 'global' && (
            <div className="advanced-setting-actions">
              <Button variant="soft" disabled={busy} onClick={deleteOverride}>
                Use browser defaults
              </Button>
            </div>
          )}
          <p className="advanced-setting-note">
            Site-specific user agents can be configured in Website behavior.
            Arbitrary user-agent overrides do not change the underlying engine
            or all JavaScript browser metadata.
          </p>
        </>
      )}
      {section === 'privacy' && (
        <>
          {row(
            'HTTP cookies',
            'Filters outgoing Cookie and incoming Set-Cookie headers. This does not block document.cookie, local storage or IndexedDB.',
            choose(
              'HTTP cookie policy',
              draft.cookies,
              [
                ['allow', 'Allow HTTP cookies'],
                ['block-third-party-http', 'Block third-party HTTP cookies'],
                ['block-all-http', 'Block all HTTP cookies'],
              ],
              (value) => set('cookies', value as AdvancedPreferences['cookies'])
            )
          )}
          {row(
            'Cookie exceptions',
            'Allow HTTP cookies when browsing these website origins.',
            lines('Cookie exceptions', draft.cookieExceptions, (value) =>
              set('cookieExceptions', value)
            )
          )}
          {row(
            'Clear website data on exit',
            'Clears cookies, local storage, IndexedDB and service workers in Kudium Browser sessions after a normal Quit. Extension storage is kept. Forced termination cannot run cleanup.',
            toggle('Clear website data on exit', draft.clearOnExit, (value) =>
              set('clearOnExit', value)
            )
          )}
          {row(
            'Referrer headers',
            'Choose how much of the source address is sent in HTTP Referer headers.',
            choose(
              'Referrer headers',
              draft.referrer,
              [
                ['default', 'Website default'],
                ['origin', 'Origin only'],
                ['none', 'Send none'],
              ],
              (value) =>
                set('referrer', value as AdvancedPreferences['referrer'])
            )
          )}
          {row(
            'Basic tracking protection',
            'Blocks requests to a small built-in list: DoubleClick, Google Analytics, Google Syndication, Facebook Connect and TikTok Analytics. This is not a comprehensive ad blocker.',
            toggle(
              'Basic tracking protection',
              draft.trackingProtection,
              (value) => set('trackingProtection', value)
            )
          )}
          {row(
            'Tracking exceptions',
            'Disable basic tracking protection on these website origins.',
            lines('Tracking exceptions', draft.trackingExceptions, (value) =>
              set('trackingExceptions', value)
            )
          )}
          {row(
            'WebRTC IP handling',
            'Restrict interface exposure or prevent WebRTC from using UDP outside your proxy. Calls may be affected.',
            choose(
              'WebRTC IP handling',
              draft.webrtc,
              [
                ['default', 'Browser default'],
                ['default_public_interface_only', 'Public interface only'],
                ['disable_non_proxied_udp', 'Disable non-proxied UDP'],
              ],
              (value) => set('webrtc', value as AdvancedPreferences['webrtc'])
            )
          )}
          {scope}
          <div className="advanced-setting-actions">
            <Button
              variant="soft"
              disabled={running || busy || !info?.profiles.length}
              onClick={() => diagnostic('storage-info')}
            >
              Inspect session storage
            </Button>
          </div>
        </>
      )}
      {section === 'languages' &&
        row(
          'Website languages',
          'Preferred language tags in order, separate from spelling. Leave empty for system defaults. Reopen tabs after changing.',
          input(
            'Website languages',
            draft.acceptLanguages,
            (value) => set('acceptLanguages', value),
            'en-CA,en,fr'
          )
        )}
      {section === 'performance' && (
        <>
          {row(
            'Hardware acceleration',
            'Use the GPU for rendering. Requires restarting Kudium Browser.',
            toggle(
              'Hardware acceleration',
              draft.hardwareAcceleration,
              (value) => set('hardwareAcceleration', value)
            )
          )}
          {row(
            'Energy saver',
            'Allow Chromium to throttle background tabs. Visible panes remain active; background timers and notifications can be delayed.',
            toggle('Energy saver', draft.energySaver, (value) =>
              set('energySaver', value)
            )
          )}
          <div className="advanced-setting-actions">
            <Button
              variant="soft"
              disabled={busy || running}
              onClick={() => diagnostic('performance-info')}
            >
              Inspect memory and GPU usage
            </Button>
          </div>
        </>
      )}
      {section === 'startup' && (
        <>
          {row(
            'On startup',
            'Saved groups remain available. Startup pages open once when the app launches.',
            choose(
              'On startup',
              draft.startupMode,
              [
                ['restore', 'Restore saved workspace'],
                ['pages', 'Open selected pages'],
              ],
              (value) =>
                set('startupMode', value as AdvancedPreferences['startupMode'])
            )
          )}
          {draft.startupMode === 'pages' &&
            row(
              'Startup pages',
              'Enter the URLs to open when Kudium Browser starts.',
              lines('Startup pages', draft.startupPages, (value) =>
                set('startupPages', value)
              )
            )}
          <div className="advanced-setting-actions">
            <Button
              variant="soft"
              disabled={busy || running}
              onClick={() => diagnostic('set-default-browser')}
            >
              Make default browser
            </Button>
          </div>
        </>
      )}
      {section === 'websites' && (
        <>
          {row(
            'JavaScript',
            'Apply after reloading websites. Blocking scripts can disable login and verification.',
            toggle('Website JavaScript', draft.javascript, (value) =>
              set('javascript', value)
            )
          )}
          {row(
            'Images',
            'Apply after reloading websites.',
            toggle('Website images', draft.images, (value) =>
              set('images', value)
            )
          )}
          {row(
            'Autoplay',
            'Allow media to play without a user gesture. Changes require reopening tabs.',
            toggle('Website autoplay', draft.autoplay, (value) =>
              set('autoplay', value)
            )
          )}
          <div className="preference-row">
            <div>
              <strong>Site exceptions</strong>
              <p>
                Rules apply to the exact origin across all sessions. Reload for
                scripts and images; reopen for autoplay. Popup and zoom changes
                apply live.
              </p>
            </div>
            <div className="advanced-site-create">
              {input('New site origin', site, setSite, 'https://example.com')}
              <Button
                disabled={busy}
                onClick={() => {
                  try {
                    const url = new URL(site);
                    if (!['http:', 'https:'].includes(url.protocol))
                      throw new Error('Use an HTTP or HTTPS origin.');
                    if (
                      draft.siteRules.some((rule) => rule.origin === url.origin)
                    )
                      throw new Error('This site already has a rule.');
                    set('siteRules', [
                      ...draft.siteRules,
                      {
                        origin: url.origin,
                        javascript: draft.javascript,
                        images: draft.images,
                        autoplay: draft.autoplay,
                        popups: true,
                        zoom: preferences.zoom,
                        userAgent: '',
                      },
                    ]);
                    setSite('');
                    setError('');
                  } catch (reason) {
                    setError(String(reason));
                  }
                }}
              >
                Add site
              </Button>
            </div>
          </div>
          {draft.siteRules.map((rule, index) => (
            <div key={rule.origin} className="advanced-site-rule">
              <div className="preference-row">
                <strong>{rule.origin}</strong>
                <Button
                  color="red"
                  variant="soft"
                  disabled={busy}
                  onClick={() =>
                    set(
                      'siteRules',
                      draft.siteRules.filter((_, i) => i !== index)
                    )
                  }
                >
                  Remove
                </Button>
              </div>
              {row(
                'JavaScript',
                'Allow scripts on this site.',
                toggle(`${rule.origin} JavaScript`, rule.javascript, (value) =>
                  modifySite(index, { javascript: value })
                )
              )}
              {row(
                'Images',
                'Allow images on this site.',
                toggle(`${rule.origin} Images`, rule.images, (value) =>
                  modifySite(index, { images: value })
                )
              )}
              {row(
                'Autoplay',
                'Allow autoplay on this site.',
                toggle(`${rule.origin} Autoplay`, rule.autoplay, (value) =>
                  modifySite(index, { autoplay: value })
                )
              )}
              {row(
                'Popups',
                'Allow this site to open tabs.',
                toggle(`${rule.origin} Popups`, rule.popups, (value) =>
                  modifySite(index, { popups: value })
                )
              )}
              {row(
                'Page zoom',
                'Persistent zoom for this origin.',
                choose(
                  `${rule.origin} Zoom`,
                  String(rule.zoom),
                  [
                    ...new Set([
                      0.5,
                      0.75,
                      0.9,
                      1,
                      1.1,
                      1.25,
                      1.5,
                      2,
                      rule.zoom,
                    ]),
                  ]
                    .sort((a, b) => a - b)
                    .map((value) => [
                      String(value),
                      `${Math.round(value * 100)}%`,
                    ]),
                  (value) => modifySite(index, { zoom: Number(value) })
                )
              )}
              {row(
                'User agent',
                'Leave blank to inherit session or global identity.',
                input(`${rule.origin} User agent`, rule.userAgent, (value) =>
                  modifySite(index, { userAgent: value })
                )
              )}
            </div>
          ))}
        </>
      )}
      {error && (
        <Callout.Root color="red" className="advanced-setting-feedback">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
      {report && (
        <pre role="status" className="advanced-setting-report">
          {report}
        </pre>
      )}
      <div className="preference-actions advanced-setting-footer">
        <Button
          disabled={busy || running}
          onClick={async () => {
            const normalized = {
              ...draft,
              cookieExceptions: draft.cookieExceptions.filter(Boolean),
              trackingExceptions: draft.trackingExceptions.filter(Boolean),
              startupPages: draft.startupPages.filter(Boolean),
            };
            if (await save({ advanced: normalized }))
              setReport(
                'Settings saved. Reload or reopen tabs where indicated.'
              );
          }}
        >
          Save changes
        </Button>
        <Button
          variant="soft"
          disabled={busy || running}
          onClick={() => {
            setDraft(preferences.advanced || defaultAdvanced);
            setError('');
            setReport('Unsaved changes discarded.');
          }}
        >
          Discard changes
        </Button>
        <Button
          variant="outline"
          disabled={busy || running}
          onClick={() => {
            setDraft(defaultAdvanced);
            setReport('Default settings selected. Save to apply.');
          }}
        >
          Reset defaults
        </Button>
      </div>
    </div>
  );
}
