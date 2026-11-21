export interface SidebarPanelInfo {
  id: string;
  title: string;
  kind: 'extension' | 'hook' | 'feature';
  key?: string;
}
export interface SidebarPanelTarget { id: string; title: string; profileId: string; }
export interface SidebarPanelState {
  panels: SidebarPanelInfo[];
  activeId?: string;
  openRequest: number;
  error?: string;
  floating?: boolean;
  targets?: SidebarPanelTarget[];
  targetGroup?: string;
}
export type SidebarPanelRequest =
  | { action: 'list' }
  | { action: 'activate'; id: string; reveal?: boolean }
  | { action: 'target'; groupId?: string }
  | { action: 'close' }
  | { action: 'undock' }
  | { action: 'dock' }
  | {
      action: 'layout';
      id: string;
      bounds: { x: number; y: number; width: number; height: number } | null;
    };

export const EMPTY_SIDEBAR_PANELS: SidebarPanelState = {
  panels: [],
  openRequest: 0,
};
