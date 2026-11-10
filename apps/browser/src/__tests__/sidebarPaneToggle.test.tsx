import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { useSidebarPaneToggle } from '../utils/hooks/useSidebarPaneToggle';

const panes = ['assistant', 'tasks', 'developer', 'notes', 'activity'] as const;

function useSidebar() {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<(typeof panes)[number]>('assistant');
  const [mounted, setMounted] = useState(false);
  const toggle = useSidebarPaneToggle(open, pane, setOpen, setPane, setMounted);
  return { open, pane, mounted, toggle };
}

describe('shared sidebar pane toggle', () => {
  it.each(panes)('opens, closes and reopens %s', (pane) => {
    const { result } = renderHook(useSidebar);
    act(() => result.current.toggle(pane));
    expect(result.current).toMatchObject({ open: true, pane, mounted: true });
    act(() => result.current.toggle(pane));
    expect(result.current).toMatchObject({ open: false, pane });
    act(() => result.current.toggle(pane));
    expect(result.current).toMatchObject({ open: true, pane });
  });

  it.each(panes)('switches from %s to every other page without closing', (from) => {
    const { result } = renderHook(useSidebar);
    panes.filter((pane) => pane !== from).forEach((to) => {
      act(() => result.current.toggle(from));
      act(() => result.current.toggle(to));
      expect(result.current).toMatchObject({ open: true, pane: to });
    });
  });
});
