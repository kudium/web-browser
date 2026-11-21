export interface SidebarPanelInfo {
  id: string;
  title: string;
  kind: 'extension' | 'hook' | 'feature';
  key?: string;
}
export interface SidebarPanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Native views must fit the window even when CSS rounding or an inset extends the slot. */
export function clipSidebarPanelBounds(
  bounds: SidebarPanelBounds,
  viewport: { width: number; height: number },
): SidebarPanelBounds | undefined {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width < 1 ||
    bounds.height < 1
  )
    return undefined;
  const x = Math.max(0, Math.round(bounds.x)),
    y = Math.max(0, Math.round(bounds.y));
  const right = Math.min(viewport.width, Math.floor(bounds.x + bounds.width));
  const bottom = Math.min(
    viewport.height,
    Math.floor(bounds.y + bounds.height),
  );
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : undefined;
}
export interface SidebarPanelTarget {
  id: string;
  title: string;
  profileId: string;
}
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
      bounds: SidebarPanelBounds | null;
    };

export const EMPTY_SIDEBAR_PANELS: SidebarPanelState = {
  panels: [],
  openRequest: 0,
};
