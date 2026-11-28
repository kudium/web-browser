import type { BrowserWindow, Session } from 'electron';
import type { AIAccessMode } from '../browser/aiPermissions';

const owners = new Map<
  Session,
  {
    mode(): AIAccessMode;
    change(mode: AIAccessMode): void;
    assertChange(): void;
  }
>();
export function registerWorkspaceAccess(
  host: BrowserWindow,
  access: {
    mode(): AIAccessMode;
    change(mode: AIAccessMode): void;
    assertChange(): void;
  }
) {
  const session = host.webContents.session;
  owners.set(session, access);
  return () => {
    if (owners.get(session) === access) owners.delete(session);
  };
}
export function workspaceAccess(host: BrowserWindow) {
  const access = owners.get(host.webContents.session);
  if (!access) throw new Error('AI settings are unavailable in this window.');
  return access;
}
