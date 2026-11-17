/** Preserve the actual Chromium version while removing app product tokens. */
export const browserUserAgent = (userAgent: string): string =>
  userAgent
    .replace(/ Electron\/\S+/g, '')
    // Electron removes spaces from app.setName('Kudium Browser') in its UA.
    .replace(/ (?:touch-?box|kudium-?browser|Kudium Browser)\/\S+/gi, '');
