import {
  Dialog,
  Button,
  Select,
  Switch,
  IconButton,
  DropdownMenu,
} from '@radix-ui/themes';
import {
  SquareArrowOutUpRight,
  LockKeyhole,
  ShieldAlert,
  MapPin,
  Bell,
  Camera,
  Clipboard,
  Maximize,
  Music2,
  Settings2,
  Volume2,
  X,
  RotateCw,
  FileDown,
  ChevronDown,
  Scan,
  Image,
  ScrollText,
} from 'lucide-react';
import type { BrowserState, BrowserCommand } from '../../browser/contracts';

import type { PageCaptureMode } from '../../browser/pageCapture';

const permissions = [
  ['geolocation', 'Location', MapPin],
  ['notifications', 'Notifications', Bell],
  ['media', 'Camera & microphone', Camera],
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
}: {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  state: BrowserState | undefined;
  command: (request: BrowserCommand) => void;
  onCapture?: (mode: PageCaptureMode) => void;
}) {
  const site = state?.siteSettings;
  const send = (
    action: BrowserCommand['action'],
    patch: Partial<BrowserCommand> = {}
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
    (key) => !permissions.some(([permission]) => permission === key)
  );
  const rows = [
    ...permissions,
    ...extra.map((key) => [key, key.replace(/-/g, ' '), Settings2] as const),
  ];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        className="site-settings-dialog"
        maxWidth="460px"
        aria-describedby="site-settings-description"
      >
        <div className="site-settings-heading">
          <div>
            <Dialog.Title mb="1" size="5" weight="medium">
              {site ? new URL(site.origin).host : 'Site settings'}
            </Dialog.Title>
            <Dialog.Description id="site-settings-description" size="2">
              Site settings
            </Dialog.Description>
          </div>
          <Dialog.Close>
            <IconButton
              variant="ghost"
              color="gray"
              aria-label="Close site settings"
            >
              <X size={18} />
            </IconButton>
          </Dialog.Close>
        </div>
        <section
          className="site-settings-actions"
          aria-labelledby="site-hooks-intro"
        >
          <div className="site-hooks-intro">
            <h2 id="site-hooks-intro">Do more with site hooks</h2>
            <p>
              Test, debug, extract page data, and customize this site with
              JavaScript and CSS.
            </p>
          </div>
          <Button
            variant="soft"
            color="gray"
            disabled={!site}
            onClick={() => {
              send('open-site-developer');
              onOpenChange(false);
            }}
          >
            <SquareArrowOutUpRight size={15} />
            Developer
          </Button>
        </section>
        <div className="site-settings-tab-content">
          <div className="site-settings-scroll">
            <details className="site-connection">
              <summary>
                <ConnectionIcon size={18} />
                {connectionLabel}
              </summary>
              <div className="site-connection-content">
                <p>{connectionDescription}</p>
                <p className="site-origin">{site?.origin}</p>
              </div>
            </details>
            <div
              className="site-page-actions"
              role="group"
              aria-label="Page capture and export"
            >
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button
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
                variant="soft"
                color="gray"
                disabled={!state || state.loading || !onCapture}
                onClick={() => onCapture?.('pdf')}
              >
                <FileDown size={16} />
                Save PDF
              </Button>
            </div>
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
                      value={site?.permissions[permission] || 'ask'}
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
      </Dialog.Content>
    </Dialog.Root>
  );
}

SiteSettingsDialog.defaultProps = { onCapture: undefined };
