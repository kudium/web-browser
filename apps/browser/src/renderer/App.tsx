import { useEffect } from 'react';
import { Theme } from '@radix-ui/themes';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SiteDeveloperPage } from '../components/View/SiteDeveloperPage';
import { useAppearance } from '../utils/appearance';
import { AddApp } from '../components/View/AddApp/AddApp';
import { Main } from '../components/View/Main/Main';
import { BrowserWorkspace } from '../components/UI/BrowserWorkspace';
import { Downloads } from '../components/View/Downloads/Downloads';
import { Settings } from '../components/View/Settings/Settings';
import { View } from '../types';
import { installFocusModality } from '../utils/focusModality';

export function AppSelectedView() {
  const view = new URL(window.location.href).searchParams.get('view') as View;

  useEffect(() => {
    if (view === 'settings')
      window.electron?.telemetry?.feature('settings_opened');
    if (view === 'downloads')
      window.electron?.telemetry?.feature('downloads_opened');
  }, [view]);
  switch (view) {
    case 'site-developer':
      return <SiteDeveloperPage />;
    case 'main':
      return <BrowserWorkspace />;
    case 'downloads':
      return <Downloads />;
    case 'settings':
      return <Settings />;
    case 'add-app':
      return <AddApp />;
    default:
      throw new Error(`'${view}' view is undefined`);
  }
}

export default function App() {
  useEffect(installFocusModality, []);
  const { appearance } = useAppearance();
  document.documentElement.dataset.platform =
    window.electron?.platform || 'unknown';
  return (
    <Theme
      appearance={appearance}
      panelBackground="solid"
      accentColor="iris"
      grayColor="slate"
      radius="large"
      scaling="100%"
    >
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AppSelectedView />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  );
}
