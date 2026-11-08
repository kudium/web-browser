import type { IApp } from '../types';

export type BrowserWindowKind = 'workspace' | 'groups' | 'temporary';
export interface BrowserWindowState {
  id: number;
  kind: BrowserWindowKind;
  groupIds: string[];
  tabs: IApp[];
  reservedIds: string[];
  pendingTabs: IApp[];
  parentGroups: Record<string, string>;
  selectedId?: string;
}
export type BrowserWindowRequest =
  | { action: 'status' | 'new-window' }
  | { action: 'open-tab' | 'open-group'; id: string }
  | { action: 'begin-drag'; token: string; id: string; kind: 'tab' | 'group' }
  | { action: 'finish-drag'; token: string; cancelled?: boolean }
  | { action: 'cancel-drag'; token: string }
  | { action: 'commit-complete'; token: string }
  | { action: 'drop'; token: string; targetId?: string }
  | { action: 'temporary-tabs'; tabs: IApp[] };
export const WINDOW_DRAG_MIME = 'application/x-kudium-window-drag';
export function isBrowserWindowRequest(
  value: unknown
): value is BrowserWindowRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const text = (key: string) =>
    typeof input[key] === 'string' &&
    (input[key] as string).length > 0 &&
    (input[key] as string).length <= 1024;
  const token = () =>
    typeof input.token === 'string' && /^[a-f0-9-]{36}$/i.test(input.token);
  switch (input.action) {
    case 'status':
    case 'new-window':
      return true;
    case 'open-tab':
    case 'open-group':
      return text('id');
    case 'begin-drag':
      return (
        token() && text('id') && ['tab', 'group'].includes(String(input.kind))
      );
    case 'cancel-drag':
    case 'commit-complete':
      return token();
    case 'finish-drag':
      return (
        token() &&
        (input.cancelled === undefined || typeof input.cancelled === 'boolean')
      );
    case 'drop':
      return token() && (input.targetId === undefined || text('targetId'));
    case 'temporary-tabs':
      return Array.isArray(input.tabs) && input.tabs.length <= 512;
    default:
      return false;
  }
}
