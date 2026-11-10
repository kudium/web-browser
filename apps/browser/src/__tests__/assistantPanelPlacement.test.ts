import { hasFloatingAssistantPanels } from '../utils/assistantPanelPlacement';

afterEach(() => localStorage.clear());
it('restores floating pages independently of the docked sidebar preference', () => {
  localStorage.setItem('kudiumbrowser-ai-page-open', 'false');
  localStorage.setItem(
    'kudium-assistant-window-notes',
    JSON.stringify({ floating: true })
  );
  expect(hasFloatingAssistantPanels()).toBe(true);
  localStorage.setItem(
    'kudium-assistant-window-notes',
    JSON.stringify({ floating: false })
  );
  expect(hasFloatingAssistantPanels()).toBe(false);
});
it('ignores unavailable or malformed placement preferences', () => {
  localStorage.setItem('kudium-assistant-window-notes', 'broken');
  expect(hasFloatingAssistantPanels()).toBe(false);
});
