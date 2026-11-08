import { useEffect, useState } from 'react';
import { IconButton } from '@radix-ui/themes';
import { Maximize2 } from 'lucide-react';
import type { SiteDeveloperWindowState } from '../../browser/siteDeveloper';
import { SiteDeveloperPanel } from '../UI/SiteDeveloperPanel';

export function SiteDeveloperPage() {
  const [state, setState] = useState<SiteDeveloperWindowState>();
  useEffect(() => {
    const unsubscribe = window.electron.siteDeveloper.onState(setState);
    window.electron.siteDeveloper.command('get');
    return unsubscribe;
  }, []);
  return (
    <main className="site-developer-page">
      <header className="site-developer-page-heading">
        <div>
          <h1>Developer</h1>
          {state ? (
            <nav className="site-developer-breadcrumb" aria-label="Breadcrumb">
              <a
                href="#group"
                title={`Return to ${state.groupName}`}
                onClick={(event) => {
                  event.preventDefault();
                  window.electron.siteDeveloper.command('focus-group');
                }}
              >
                {state.groupName}
              </a>
              <span aria-hidden="true">/</span>
              <a
                href={state.pageURL}
                title={state.pageURL}
                onClick={(event) => {
                  event.preventDefault();
                  window.electron.siteDeveloper.command('focus-page');
                }}
              >
                {new URL(state.pageURL).host}
                {new URL(state.pageURL).pathname === '/'
                  ? ''
                  : new URL(state.pageURL).pathname}
              </a>
            </nav>
          ) : (
            <p>Loading site…</p>
          )}
        </div>
        <IconButton
          variant="ghost"
          color="gray"
          aria-label="Expand or restore editor"
          onClick={() => window.electron.siteDeveloper.command('expand')}
        >
          <Maximize2 size={17} />
        </IconButton>
      </header>
      {state && !state.available && (
        <p className="site-developer-unavailable" role="status">
          This tab is closed or has moved to another site. Return to the
          original site to continue.
        </p>
      )}
      <SiteDeveloperPanel
        origin={state?.pageURL || state?.origin}
        developer={state?.developer}
        disabled={!state?.available}
        send={(action, patch) =>
          window.electron.siteDeveloper.command({ id: '', action, ...patch })
        }
      />
    </main>
  );
}
