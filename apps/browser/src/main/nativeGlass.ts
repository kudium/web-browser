import { nativeTheme } from 'electron';

/** Shared macOS material policy for browser dialogs and overlays. */
export function usesNativeGlass() {
  return process.platform === 'darwin' &&
    !nativeTheme.prefersReducedTransparency &&
    !nativeTheme.shouldUseHighContrastColors;
}

/** Keep the system material visible instead of covering it with an opaque wash. */
export const nativeGlassSurfaceTokens = `
:root {
  --native-glass-light-tint: #f5f5f71f;
  --native-glass-dark-tint: #28282a26;
  --native-glass-light-edge: #ffffff80;
  --native-glass-dark-edge: #ffffff24;
}
`;
