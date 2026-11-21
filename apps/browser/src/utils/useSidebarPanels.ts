import { useEffect, useState, useRef } from 'react';
import { browser } from '../browser/client';
import {
  EMPTY_SIDEBAR_PANELS,
  SidebarPanelState,
} from '../browser/sidebarPanels';

export function useSidebarPanels() {
  const [state, setState] = useState<SidebarPanelState>(EMPTY_SIDEBAR_PANELS);
  const restoring = useRef(false);
  const restored = useRef(false);
  useEffect(() => {
    try {
      const panel = state.panels.find((entry) => entry.id === state.activeId);
      if (panel) {
        restored.current = true;
        localStorage.setItem(
          'kudium-sidebar-panel-selection',
          panel.key || panel.id,
        );
      } else if (!restoring.current && !restored.current) {
        const saved = localStorage.getItem('kudium-sidebar-panel-selection');
        const available = state.panels.find(
          (entry) => (entry.key || entry.id) === saved,
        );
        if (available) {
          restored.current = true;
          restoring.current = true;
          void browser
            .sidebarPanels({
              action: 'activate',
              id: available.id,
              reveal: false,
            })
            .finally(() => {
              restoring.current = false;
            })
            .catch(() => {});
        }
      }
    } catch {
      /* Layout preferences must not prevent opening a panel. */
    }
  }, [state.activeId, state.panels]);
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
