/* eslint-disable react/require-default-props */
import type { ReactNode } from 'react';
import { SidebarPanelHost } from './SidebarPanelHost';
export { focusSidebarPanel as focusAssistantPanel } from './SidebarPanelHost';

export type AssistantPanel =
  'assistant' | 'notes' | 'activity' | 'tasks' | 'developer' | 'email';
export const ASSISTANT_PANEL_NAMES: Record<AssistantPanel, string> = {
  assistant: 'Chat',
  notes: 'Notes',
  activity: 'Activity',
  tasks: 'Tasks',
  developer: 'Developer',
  email: 'Email',
};
function preference(panel: AssistantPanel, open: boolean) {
  try {
    if (open)
      localStorage.setItem('kudiumbrowser-ai-page-pane', JSON.stringify(panel));
    localStorage.setItem('kudiumbrowser-ai-page-open', JSON.stringify(open));
    for (const key of open ? ['pane', 'open'] : ['open'])
      window.dispatchEvent(
        new CustomEvent('ai-page-preference-changed', {
          detail: `kudiumbrowser-ai-page-${key}`,
        }),
      );
  } catch {
    /* Layout preference storage is optional. */
  }
}
/** Built-in panels retain their saved placement while sharing the generic host. */
export function AssistantPanelHost({
  panel,
  active,
  visible = true,
  children,
  onOpen,
  onClose,
}: {
  panel: AssistantPanel;
  active: boolean;
  visible?: boolean;
  children: ReactNode;
  onOpen?: () => void;
  onClose?: () => void;
}) {
  return (
    <SidebarPanelHost
      id={panel}
      title={ASSISTANT_PANEL_NAMES[panel]}
      active={active}
      visible={visible}
      windowName={`kudium-assistant-${panel}`}
      placementKey={`kudium-assistant-window-${panel}`}
      onDock={onOpen || (() => preference(panel, true))}
      onWindowClose={onClose || (() => preference(panel, false))}
      onClose={onClose}
    >
      {children}
    </SidebarPanelHost>
  );
}
