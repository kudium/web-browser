import type { CSSProperties } from 'react';

/** Chromium resolves page metadata to RGB; never accept arbitrary CSS from pages. */
export function websiteThemeStyle(color?: string): CSSProperties | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return { '--website-color': color } as CSSProperties;
}
