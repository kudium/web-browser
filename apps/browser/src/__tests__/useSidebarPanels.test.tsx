import { act, renderHook, waitFor } from '@testing-library/react';
import { useSidebarPanels } from '../utils/useSidebarPanels';
import { browser } from '../browser/client';
import type { SidebarPanelState } from '../browser/sidebarPanels';
jest.mock('../browser/client', () => ({ browser: { sidebarPanels: jest.fn(), onSidebarPanels: jest.fn() } }));

it('restores a remembered panel on reopen without reopening an explicitly closed active panel', async () => {
  const selected: SidebarPanelState = {
    panels: [{ id: 'extension', key: 'saved-extension', title: 'Extension', kind: 'extension' }],
    activeId: 'extension', openRequest: 1, floating: false,
  };
  let receive!: (state: SidebarPanelState) => void;
  (browser.onSidebarPanels as jest.Mock).mockImplementation(callback => { receive = callback; return () => {}; });
  (browser.sidebarPanels as jest.Mock).mockResolvedValue(selected);
  localStorage.clear();
  const { result, rerender } = renderHook(({ active }) => useSidebarPanels(active), { initialProps: { active: true } });
  await waitFor(() => expect(result.current.activeId).toBe('extension'));
  expect(localStorage.getItem('kudium-sidebar-panel-selection')).toBe('saved-extension');
  (browser.sidebarPanels as jest.Mock).mockClear();
  act(() => receive({ ...selected, activeId: undefined }));
  expect(browser.sidebarPanels).not.toHaveBeenCalled();
  rerender({ active: false });
  rerender({ active: true });
  await waitFor(() => expect(browser.sidebarPanels).toHaveBeenCalledWith({ action: 'activate', id: 'extension', reveal: false }));
});
