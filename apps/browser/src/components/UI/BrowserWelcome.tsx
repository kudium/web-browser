import { useEffect, useState } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import { browser } from '../../browser/client';
import { PreferenceAction, PreferenceInfo } from '../../browser/preferences';

export function BrowserWelcome() {
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [info, setInfo] = useState<PreferenceInfo>();
  const [choices, setChoices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([browser.preferences('get'), browser.preferenceAction('info')])
      .then(([preferences, details]) => {
        if (!active) return;
        setCompleted(preferences.setupCompleted);
        setInfo(details as PreferenceInfo);
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function finish(skip = false) {
    setBusy(true);
    setMessage('');
    try {
      if (!skip) {
        const actions: PreferenceAction[] = [];
        if (choices.includes('default')) actions.push('set-default-browser');
        if (choices.includes('login')) actions.push('enable-open-at-login');
        if (choices.includes('dock')) actions.push('reveal-app-for-dock');
        for (const action of actions) await browser.preferenceAction(action);
      }
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
  if (!completed) {
    const options = [
      {
        id: 'default',
        title: 'Make Kudium your default browser',
        description: info?.defaultBrowser
          ? 'Kudium is already your default browser.'
          : 'Open links and web pages in Kudium. Your system may ask you to confirm.',
        disabled: info?.defaultBrowser || !info?.systemSetupAvailable,
      },
      ...(info?.platform === 'darwin'
        ? [
            {
              id: 'dock',
              title: 'Keep Kudium in your Dock',
              description:
                'We’ll show the app in Finder. Drag it to your Dock for quick access.',
              disabled: !info.systemSetupAvailable,
            },
          ]
        : []),
      ...(['darwin', 'win32'].includes(info?.platform || '')
        ? [
            {
              id: 'login',
              title: 'Open Kudium at login',
              description: info?.openAtLogin
                ? 'Kudium already opens when you sign in.'
                : 'Have your browser ready when you sign in to your computer.',
              disabled: info?.openAtLogin || !info?.systemSetupAvailable,
            },
          ]
        : []),
    ];
    return (
      <section className="browser-setup" aria-label="Set up Kudium Browser">
        <div className="browser-setup-copy">
          <span className="browser-setup-eyebrow">WELCOME TO KUDIUM</span>
          <h1>Make yourself at home.</h1>
          <p>Set up your browser to fit your day. Choose what works for you.</p>
          <div className="browser-setup-options">
            {options.map((option) => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  checked={
                    Boolean(
                      option.disabled &&
                        (option.id === 'default'
                          ? info?.defaultBrowser
                          : option.id === 'login' && info?.openAtLogin)
                    ) || choices.includes(option.id)
                  }
                  disabled={busy || option.disabled}
                  onChange={(event) =>
                    setChoices((current) =>
                      event.target.checked
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id)
                    )
                  }
                />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
          {!info?.systemSetupAvailable && (
            <p>System setup is available in the installed Kudium Browser.</p>
          )}
          {message && <p role="alert">{message}</p>}
          <button
            className="browser-setup-primary"
            type="button"
            disabled={busy}
            onClick={() => finish()}
          >
            {busy ? 'Setting up…' : 'Get started'}
            <ArrowRight size={18} />
          </button>
          <button
            className="browser-setup-skip"
            type="button"
            disabled={busy}
            onClick={() => finish(true)}
          >
            Skip for now
          </button>
        </div>
        <div className="browser-setup-art" aria-hidden="true">
          <Compass size={112} strokeWidth={1} />
          <span>Your space to explore.</span>
        </div>
      </section>
    );
  }
  const url =
    process.env.NODE_ENV === 'production'
      ? 'https://browser.kudium.com'
      : 'http://localhost:3000';
  return (
    <iframe
      className="browser-showcase"
      title="About Kudium Browser"
      src={url}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
    />
  );
}
