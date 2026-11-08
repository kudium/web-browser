/** Preserve the actual Chromium version while removing app product tokens. */
export const browserUserAgent = (userAgent: string): string =>
  userAgent
    .replace(/ Electron\/\S+/g, '')
    .replace(/ (?:touch-?box|kudium-browser|Kudium Browser)\/\S+/gi, '');
