import { useEffect, useState } from 'react';
import { Check, Compass, Dock, Power } from 'lucide-react';
import kudiumLogo from '../../../assets/app-icon.png';
import { browser } from '../../browser/client';
import { PreferenceAction, PreferenceInfo } from '../../browser/preferences';

function WelcomeShortcuts({ floating = false }: { floating?: boolean }) {
  return <nav className={`browser-welcome-shortcuts${floating ? ' browser-start-actions' : ''}`} aria-label="Browser shortcuts">
    {([
      { label:'Global hooks', name:'Manage global hooks', section:'hooks' },
      { label:'Customize', name:'Customize start page', section:'appearance' },
      { label:'Import', name:'Import browsing data', section:'import' },
    ] as const).map(item => <button key={item.section} type="button" aria-label={item.name} title={item.name} onClick={() => { void browser.preferences('open', {section:item.section}); }}>{item.label}</button>)}
  </nav>;
}

export function BrowserWelcome({
  privateMode = false,
  preview = false,
}: {
  privateMode?: boolean;
  preview?: boolean;
}) {
  const [startPage, setStartPage] = useState<'kudium' | 'blank' | 'custom'>('kudium');
  const [startPageURL, setStartPageURL] = useState('');
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [info, setInfo] = useState<PreferenceInfo>();
  const [applied, setApplied] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (privateMode) {
      setReady(true);
      setCompleted(true);
      return undefined;
    }
    let active = true;
    Promise.all([browser.preferences('get'), browser.preferenceAction('info')])
      .then(([preferences, details]) => {
        if (!active) return;
        setCompleted(preview || preferences.setupCompleted);
        setStartPage(preferences.startPage || 'kudium');
        setStartPageURL(preferences.startPageURL || '');
        setInfo(details as PreferenceInfo);
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [privateMode, preview]);
  useEffect(() => browser.onPreferences(preferences => {
    setStartPage(preferences.startPage || 'kudium');
    setStartPageURL(preferences.startPageURL || '');
  }), []);

  async function finish() {
    setBusy(true);
    setMessage('');
    try {
      await browser.preferences('update', { setupCompleted: true });
      setCompleted(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Setup could not finish. Try again or skip for now.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;
  if (privateMode)
    return (
      <section className="browser-onboarding">
        <div className="browser-onboarding-card">
          <h1>Private browsing</h1>
          <p>Use the address bar or open a tab to start browsing.</p>
          <p>
            Your private tabs and website data stay out of your regular
            workspace. Downloaded files remain on your computer.
          </p>
        </div>
      </section>
    );
  const customURL = (() => {
    try { const parsed = new URL(startPageURL); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''; } catch { return ''; }
  })();
  if (!completed || startPage === 'kudium' || (startPage === 'custom' && !customURL)) {
    const options = [
      {
        title: 'Default browser',
        description: 'Open links from other apps in Kudium.',
        icon: Compass,
        action: 'set-default-browser',
        cta: 'Make default',
        done: info?.defaultBrowser,
      },
      ...(info?.platform === 'darwin'
        ? [
            {
              title: 'Keep in Dock',
              description: 'Open Finder, then drag Kudium into your Dock.',
              icon: Dock,
              action: 'reveal-app-for-dock',
              cta: 'Show in Finder',
              done: false,
            },
          ]
        : []),
      ...(['darwin', 'win32'].includes(info?.platform || '')
        ? [
            {
              title: 'Open at login',
              description: 'Have Kudium ready when you sign in.',
              icon: Power,
              action: 'enable-open-at-login',
              cta: 'Enable',
              done: info?.openAtLogin,
            },
          ]
        : []),
    ];
    async function apply(action: string) {
      setBusy(true);
      setMessage('');
      try {
        await browser.preferenceAction(action as PreferenceAction);
        // Revealing Finder completes the action, not the user's Dock setup.
        if (action !== 'reveal-app-for-dock') {
          const details = await browser.preferenceAction('info');
          setInfo(details as PreferenceInfo);
        } else setApplied((current) => [...current, action]);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not apply this setting. Please try again.'
        );
      } finally {
        setBusy(false);
      }
    }
    return (
      <section
        className="browser-onboarding"
        aria-label="Set up Kudium Browser"
      >
        <div className="browser-onboarding-card">
          <div className="browser-onboarding-content">
            <img className="browser-onboarding-logo" src={kudiumLogo} alt="" />
            <h1>More than a browser.</h1>
            <p>Kudium brings your tabs, tools, and ideas together in one workspace.</p>
          </div>
          <div className="browser-onboarding-options">
            {options.map((option) => {
              const Icon = option.icon;
              return (
                <div className="browser-onboarding-option" key={option.action}>
                  <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <h2>{option.title}</h2>
                    <p>{option.description}</p>
                  </div>
                  <button
                    type="button"
                    className="browser-onboarding-option-action"
                    disabled={
                      preview || busy || option.done || !info?.systemSetupAvailable
                    }
                    onClick={() => apply(option.action)}
                  >
                    {option.done ? (
                      <>
                        <Check size={14} /> Enabled
                      </>
                    ) : applied.includes(option.action) ? (
                      'Show again'
                    ) : (
                      option.cta
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          {!info?.systemSetupAvailable && (
            <p className="browser-onboarding-note">
              These settings are available in the installed app.
            </p>
          )}
          {message && (
            <p className="browser-onboarding-note" role="alert">
              {message}
            </p>
          )}
          <footer className="browser-onboarding-footer">
            {!completed && !preview && <button
              className="browser-onboarding-primary"
              type="button"
              disabled={busy}
              onClick={() => finish()}
            >
              {busy ? 'One moment…' : 'Start browsing'}
            </button>}
            {!preview && <WelcomeShortcuts />}
            {!completed && !preview && <p>You can change these settings later in Preferences.</p>}
          </footer>
        </div>
      </section>
    );
  }
  return <section className="browser-start-page" aria-label="Start page">
    {startPage === 'blank' ? <div className="browser-start-blank"><img src={kudiumLogo} alt="Kudium" /><p>Open a tab or enter an address to start browsing.</p></div> :
      <iframe className="browser-showcase" title="Start page website" src={customURL}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />}
    {!preview && <WelcomeShortcuts floating />}
  </section>;
}
