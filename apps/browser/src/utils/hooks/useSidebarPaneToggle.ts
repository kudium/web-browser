import { useCallback } from 'react';
import { focusAssistantPanel } from '../../components/UI/AssistantPanelHost';

/** Every pane button opens its own page, or closes it when already active. */
export function useSidebarPaneToggle<Pane extends string>(
  open: boolean,
  activePane: Pane,
  setOpen: (value: boolean) => void,
  setPane: (pane: Pane) => void,
  setMounted: (mounted: boolean) => void
) {
  return useCallback(
    (pane: Pane) => {
      if (focusAssistantPanel(pane)) return;
      setMounted(true);
      setPane(pane);
      setOpen(!(open && activePane === pane));
    },
    [open, activePane, setOpen, setPane, setMounted]
  );
}
