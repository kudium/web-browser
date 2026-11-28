import { createContext } from 'react';
export const SidebarPageDockContext = createContext<{
  position: 'right' | 'bottom';
  change: (position: 'right' | 'bottom') => void;
} | null>(null);
