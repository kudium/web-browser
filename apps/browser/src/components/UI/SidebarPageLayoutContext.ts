import { createContext } from 'react';
import type { SidebarPage } from '../../utils/hooks/useSidebarPages';
export const PANEL_DRAG_MIME = 'application/x-kudium-sidebar-page';
export const SidebarPageLayoutContext = createContext<{
  page: SidebarPage;
  menu: () => void;
  move: (direction: -1 | 1) => void;
} | null>(null);
