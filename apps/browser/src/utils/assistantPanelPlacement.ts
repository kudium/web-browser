/** Restore floating pages even when the docked Assistant was closed. */
export function hasFloatingAssistantPanels() {
  try {
    return ['assistant', 'notes', 'activity', 'tasks', 'developer'].some(
      (panel) =>
        JSON.parse(
          localStorage.getItem(`kudium-assistant-window-${panel}`) || 'null'
        )?.floating === true
    );
  } catch {
    return false;
  }
}
