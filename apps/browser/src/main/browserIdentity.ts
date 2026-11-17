/** Keep the real Chromium and Electron identity; remove only app product tokens. */
export const browserUserAgent = (userAgent: string): string =>
  userAgent
    // Providers use the runtime token to select compatible sign-in flows.
    // Removing it sends Google through a flow that rejects this browser host.
    // Electron removes spaces from app.setName('Kudium Browser') in its UA.
    .replace(/ (?:touch-?box|kudium-?browser|Kudium Browser)\/\S+/gi, '');
