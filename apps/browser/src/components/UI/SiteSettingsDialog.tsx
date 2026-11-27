import { useRef } from 'react';
import { AddressBarSetting } from './AddressBarSetting';
import { preferenceControls } from '../../browser/preferences';
import {
  Popover,
  Button,
  Select,
  Switch,
  DropdownMenu,
} from '@radix-ui/themes';
import {
  Code2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  MapPin,
  Bell,
  Camera,
  Mic,
  Monitor,
  Clipboard,
  Maximize,
  Music2,
  Settings2,
  Volume2,
  RotateCw,
  FileDown,
  ChevronDown,
  Scan,
  Image,
  ScrollText,
  X,
} from 'lucide-react';
import type { BrowserState, BrowserCommand } from '../../browser/contracts';

import type { PageCaptureMode } from '../../browser/pageCapture';

const permissions = [
  ['geolocation', 'Location', MapPin],
  ['notifications', 'Notifications', Bell],
  ['camera', 'Camera', Camera],
  ['microphone', 'Microphone', Mic],
  ['display-capture', 'Screen sharing', Monitor],
  ['clipboard-read', 'Clipboard', Clipboard],
  ['fullscreen', 'Full screen', Maximize],
  ['midi', 'MIDI devices', Music2],
] as const;
export function SiteSettingsDialog({
  open,
  onOpenChange,
  state,
  command,
  onCapture,
  fullUrl,
  showLinkPreview,
  onLinkPreviewChange,
  siteAutofillEnabled,
  onSiteAutofillChange,
  onFullUrlChange,
  addressBarPlacement,
  onAddressBarPlacementChange,
}: {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  state: BrowserState | undefined;
  command: (request: BrowserCommand) => void;
  onCapture?: (mode: PageCaptureMode) => void;
  addressBarPlacement?: 'sidebar' | 'header';
  onAddressBarPlacementChange?: (placement: 'sidebar' | 'header') => void;
  fullUrl?: boolean;
  showLinkPreview?: boolean;
  onLinkPreviewChange?: (enabled: boolean) => void;
  siteAutofillEnabled?: boolean;
  onSiteAutofillChange?: (enabled: boolean) => void;
  onFullUrlChange?: (enabled: boolean) => void;
}) {
  const anchor = useRef({ getBoundingClientRect: () => document.querySelector('.address-site-settings-button')?.getBoundingClientRect() || new DOMRect(16, 16, 0, 0) });
  const site = state?.siteSettings;
  const send = (
    action: BrowserCommand['action'],
    patch: Partial<BrowserCommand> = {},
  ) => {
    if (state && site)
      command({ id: state.id, action, url: site.origin, ...patch });
  };
  const secure = site?.origin.startsWith('https:') && !site.certificateError;
  const ConnectionIcon = secure ? LockKeyhole : ShieldAlert;
  let connectionLabel = secure
    ? 'Connection uses HTTPS'
    : 'Connection is not secure';
  let connectionDescription = secure
    ? 'Your connection is encrypted with TLS. This does not guarantee the website is trustworthy.'
    : site?.certificateError
      ? `The website’s identity could not be verified because its TLS certificate is invalid (${site.certificateError}).`
      : 'This site uses HTTP. Information you send can be read or changed in transit.';
  if (!site) {
    connectionLabel = 'No website selected';
    connectionDescription =
      'Open a website to manage its connection and permissions.';
  }
  const extra = Object.keys(site?.permissions || {}).filter(
    (key) =>
      key !== 'media' &&
      !permissions.some(([permission]) => permission === key),
  );
  const rows = [
    ...permissions,
    ...extra.map((key) => [key, key.replace(/-/g, ' '), Settings2] as const),
  ];
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Content
        className="site-settings-dialog"
        side="bottom" align="end" sideOffset={8} collisionPadding={12}
        aria-labelledby="site-settings-title"
        aria-describedby="site-settings-description"
      >
        <div className="site-settings-heading">
          <div>
            <h2 id="site-settings-title">
              {site ? new URL(site.origin).host : 'Site settings'}
            </h2>
            <p id="site-settings-description">
              Site settings
            </p>
          </div>
          <button type="button" className="site-settings-close" aria-label="Close site settings" onClick={() => onOpenChange(false)}>
            <X size={16} />
          </button>
        </div>
        <section
          className="site-settings-actions"
          aria-labelledby="site-hooks-intro"
        >
          <div className="site-hooks-intro">
            <h2 id="site-hooks-intro">Site hooks</h2>
          </div>
          <Button
            size="1"
            variant="ghost"
            color="gray"
            disabled={!site}
            onClick={() => {
              send('open-site-developer');
              onOpenChange(false);
            }}
          >
            <Code2 size={15} />
            Manage Site Hooks
          </Button>
        </section>
        <div className="site-settings-tab-content">
          <div className="site-settings-scroll">
            <details className="site-connection">
              <summary>
                <ConnectionIcon size={18} />
                {connectionLabel}
                <ChevronDown className="site-connection-chevron" size={14} aria-hidden="true" />
              </summary>
              <div className="site-connection-content">
                <p>{connectionDescription}</p>
                <p className="site-origin">{site?.origin}</p>
              </div>
            </details>
            {site?.protection && <div className="site-setting-row">
              <span className="site-setting-icon"><ShieldCheck size={18}/></span>
              <span className="site-setting-label">Block ads and trackers
                <small className="preference-note">{!site.protection.globallyEnabled ? 'Enable blocking in Privacy & security.' : `${site.protection.blocked} requests blocked${site.protection.status.available ? '' : ' · Rules unavailable'}`}</small>
              </span>
              <Switch aria-label="Block ads and trackers on this site" checked={site.protection.enabled}
                disabled={!site.protection.globallyEnabled}
                onCheckedChange={() => send('toggle-ad-blocking')} />
            </div>}
            <div
              className="site-page-actions"
              role="group"
              aria-label="Page capture and export"
            >
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button
                    size="1"
                    variant="soft"
                    color="gray"
                    disabled={!state || state.loading || !onCapture}
                    aria-label="Capture page"
                  >
                    <Camera size={16} />
                    Capture
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Item onSelect={() => onCapture?.('area')}>
                    <Scan size={15} />
                    Capture area
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => onCapture?.('visible')}>
                    <Image size={15} />
                    Visible page
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => onCapture?.('full')}>
                    <ScrollText size={15} />
                    Full page
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
              <Button
                size="1"
                variant="soft"
                color="gray"
                disabled={!state || state.loading || !onCapture}
                onClick={() => onCapture?.('pdf')}
              >
                <FileDown size={16} />
                Save PDF
              </Button>
            </div>
            {onFullUrlChange && onAddressBarPlacementChange && (
              <section aria-labelledby="address-customize-heading">
                <div className="site-section-heading">
                  <h2 id="address-customize-heading">Customize</h2>
                </div>
                <div className="site-settings-group">
                  {onLinkPreviewChange && (
                    <div className="site-setting-row">
                      <span className="site-setting-icon"><Settings2 size={18} /></span>
                      <span className="site-setting-label">Link URL preview</span>
                      <Switch aria-label="Link URL preview" checked={showLinkPreview !== false} onCheckedChange={onLinkPreviewChange} />
                    </div>
                  )}
                  {onSiteAutofillChange && (
                    <div className="site-setting-row">
                      <span className="site-setting-icon">
                        <Settings2 size={18} />
                      </span>
                      <span className="site-setting-label">
                        Autofill on this website
                      </span>
                      <Switch
                        aria-label="Autofill on this website"
                        checked={!!siteAutofillEnabled}
                        disabled={!site?.origin.startsWith('https:')}
                        onCheckedChange={onSiteAutofillChange}
                      />
                    </div>
                  )}
                  {(['addressBarPlacement', 'addressBarFullUrl'] as const).map(
                    (key) => (
                      <div className="site-setting-row" key={key}>
                        <span className="site-setting-icon">
                          <Settings2 size={18} />
                        </span>
                        <span className="site-setting-label">
                          {
                            preferenceControls.find(
                              (control) => control.key === key,
                            )?.title
                          }
                        </span>
                        <AddressBarSetting
                          setting={key}
                          value={
                            key === 'addressBarPlacement'
                              ? addressBarPlacement || 'sidebar'
                              : !!fullUrl
                          }
                          onChange={(patch) => {
                            if (patch.addressBarPlacement)
                              onAddressBarPlacementChange(
                                patch.addressBarPlacement,
                              );
                            if (patch.addressBarFullUrl !== undefined)
                              onFullUrlChange(patch.addressBarFullUrl);
                          }}
                        />
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}
            <section aria-labelledby="site-permissions-heading">
              <div className="site-section-heading">
                <h2 id="site-permissions-heading">Permissions</h2>
                <Button
                  variant="ghost"
                  color="gray"
                  size="1"
                  className="site-reset"
                  disabled={!site}
                  onClick={() => send('reset-permissions')}
                >
                  Reset permissions
                </Button>
              </div>
              {site?.blocked && (
                <p className="site-blocked">
                  Browser settings currently block all website permissions.
                </p>
              )}
              <div className="site-settings-group">
                {rows.map(([permission, label, Icon]) => (
                  <div className="site-setting-row" key={permission}>
                    <span className="site-setting-icon">
                      <Icon size={18} />
                    </span>
                    <span
                      id={`site-permission-${permission}`}
                      className="site-setting-label"
                    >
                      {label}
                    </span>
                    <Select.Root
                      value={
                        site?.permissions[permission] ||
                        (['camera', 'microphone'].includes(permission)
                          ? site?.permissions.media
                          : undefined) ||
                        'ask'
                      }
                      disabled={!site || site.blocked}
                      onValueChange={(choice) =>
                        send('set-permission', {
                          permission,
                          choice: choice as BrowserCommand['choice'],
                        })
                      }
                    >
                      <Select.Trigger
                        aria-labelledby={`site-permission-${permission}`}
                      />
                      <Select.Content>
                        <Select.Item value="ask">Ask</Select.Item>
                        <Select.Item value="allow">Allow</Select.Item>
                        <Select.Item value="block">Block</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </div>
                ))}
              </div>
            </section>
            <section aria-labelledby="site-sound-heading">
              <div className="site-section-heading">
                <h2 id="site-sound-heading">Sound</h2>
              </div>
              <div className="site-settings-group">
                <div className="site-setting-row">
                  <span className="site-setting-icon">
                    <Volume2 size={18} />
                  </span>
                  <span id="site-mute-label" className="site-setting-label">
                    Mute this site
                  </span>
                  <Switch
                    id="site-mute"
                    aria-labelledby="site-mute-label"
                    checked={!!state?.muted}
                    disabled={!site}
                    onCheckedChange={() => send('toggle-mute')}
                  />
                </div>
              </div>
            </section>
          </div>
          <footer className="site-settings-footer">
            <span>Reload to apply permission changes.</span>
            <Button
              size="2"
              disabled={!site}
              onClick={() => {
                send('reload');
                onOpenChange(false);
              }}
            >
              <RotateCw size={14} />
              Reload
            </Button>
          </footer>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

SiteSettingsDialog.defaultProps = { onCapture: undefined };
