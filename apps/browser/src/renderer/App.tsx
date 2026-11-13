import { CSSProperties, useEffect, useState } from 'react';
import { Theme } from '@radix-ui/themes';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HookMarketplaceDialog } from '../components/UI/HookMarketplaceDialog';
import { SiteDeveloperPage } from '../components/View/SiteDeveloperPage';
import { useAppearance } from '../utils/appearance';
import { AddApp } from '../components/View/AddApp/AddApp';
import { Main } from '../components/View/Main/Main';
import { BrowserWorkspace } from '../components/UI/BrowserWorkspace';
import { Downloads } from '../components/View/Downloads/Downloads';
import { Settings } from '../components/View/Settings/Settings';
import { View } from '../types';
import {
  useSpaces,
  spacePrimaryColor,
  spaceFrameColor,
  primaryContrast,
} from '../utils/SpaceManager';
import { installFocusModality } from '../utils/focusModality';
import { browser } from '../browser/client';
import { defaultPreferences } from '../browser/preferences';

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
  const { active } = useSpaces();
  const primary = spacePrimaryColor(active);
  const frame = spaceFrameColor(active);
  const [glass, setGlass] = useState({
    chrome: defaultPreferences.translucentChrome,
    assistant: defaultPreferences.translucentAI,
  });
  useEffect(() => {
    let live = true;
    const update = (preferences: {
      translucentChrome?: boolean;
      translucentAI?: boolean;
    }) => {
      if (live)
        setGlass({
          chrome: preferences.translucentChrome !== false,
          assistant: preferences.translucentAI === true,
        });
    };
    // Detached hook windows receive only appearance flags through their own
    // state channel; they do not have permission to read general preferences.
    if (
      new URL(window.location.href).searchParams.get('view') ===
      'site-developer'
    ) {
      const unsubscribe = window.electron.siteDeveloper.onState((state) => {
        if (state.material) update(state.material);
      });
      return () => {
        live = false;
        unsubscribe();
      };
    }
    const unsubscribe = browser.onPreferences(update);
    browser
      .preferences('get')
      .then(update)
      .catch(() => {});
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--kudium-primary', primary);
    root.style.setProperty(
      '--kudium-primary-contrast',
      primaryContrast(primary)
    );
    root.style.setProperty('--kudium-frame', frame);
    root.dataset.chromeGlass = String(glass.chrome);
    root.dataset.assistantGlass = String(glass.assistant);
  }, [primary, frame, glass]);
  document.documentElement.dataset.platform =
    window.electron?.platform || 'unknown';
  return (
    <Theme
      style={
        {
          '--kudium-primary': primary,
          '--kudium-primary-contrast': primaryContrast(primary),
        } as CSSProperties
      }
      appearance={appearance}
      panelBackground="solid"
      accentColor="teal"
      grayColor="gray"
      radius="large"
      scaling="100%"
    >
      {['main', 'site-developer'].includes(
        new URL(window.location.href).searchParams.get('view') || ''
      ) && <HookMarketplaceDialog />}
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AppSelectedView />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  );
}
