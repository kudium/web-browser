import { useEffect, useState } from 'react';
import { browser } from '../browser/client';
import {
  EMPTY_SIDEBAR_PANELS,
  SidebarPanelState,
} from '../browser/sidebarPanels';

export function useSidebarPanels() {
  const [state, setState] = useState<SidebarPanelState>(EMPTY_SIDEBAR_PANELS);
  useEffect(() => {
    let active = true;
    let received = false;
    const stop = browser.onSidebarPanels?.((next) => {
      received = true;
      if (active) setState(next);
    });
    browser
      .sidebarPanels?.({ action: 'list' })
      .then((next) => {
        if (active && !received) setState(next);
      })
      .catch(() => {});
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  return state;
}
