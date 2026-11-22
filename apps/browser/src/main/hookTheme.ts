import type { BrowserWindow } from 'electron';
import { getAppTheme } from './appTheme';
import { resolveAppTheme } from '../utils/appTheme';
import type { HookTheme } from '../browser/hookPanels';

/** Hooks consume the existing resolved chrome theme, never a second palette. */
export function getHookTheme(owner?: BrowserWindow): HookTheme {
  const theme = (owner && getAppTheme(owner)) || resolveAppTheme({ color: 'iris' });
  return { primary: theme.primary, frame: theme.frame, contrast: theme.contrast };
}
