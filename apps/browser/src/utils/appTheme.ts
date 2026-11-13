import type { Space } from './SpaceManager';

export const spaceColorValues = {
  iris: '#5aaca8',
  red: '#df6363',
  blue: '#568fe0',
  green: '#4ca87a',
  amber: '#e9b949',
  pink: '#df6ca4',
};
export interface AppTheme {
  spaceId: string;
  primary: string;
  frame: string;
  contrast: string;
}
type ThemeSpace = Pick<
  Space,
  'color' | 'customColor' | 'frameColor' | 'useWebsiteColors'
> & { id?: string };
const validColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function primaryContrast(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 >
    0.179
    ? '#102b29'
    : '#ffffff';
}
/** One decision for the active space, website fallback, linked frame and readable controls. */
export function resolveAppTheme(
  space: ThemeSpace,
  websiteColor?: string
): AppTheme {
  const fallback = validColor(space.customColor)
    ? space.customColor
    : spaceColorValues[space.color] || spaceColorValues.iris;
  const primary =
    space.useWebsiteColors && validColor(websiteColor)
      ? websiteColor
      : fallback;
  return {
    spaceId: space.id || '',
    primary,
    frame: validColor(space.frameColor) ? space.frameColor : primary,
    contrast: primaryContrast(primary),
  };
}
export function validAppTheme(value: unknown): value is AppTheme {
  if (!value || typeof value !== 'object') return false;
  const theme = value as AppTheme;
  return (
    typeof theme.spaceId === 'string' &&
    theme.spaceId.length <= 200 &&
    validColor(theme.primary) &&
    validColor(theme.frame) &&
    theme.contrast === primaryContrast(theme.primary)
  );
}
export function appThemeStyle(theme: AppTheme) {
  return {
    '--kudium-primary': theme.primary,
    '--kudium-frame': theme.frame,
    '--space-tint': theme.frame,
    '--kudium-primary-contrast': theme.contrast,
  };
}
