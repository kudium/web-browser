import type { WebContents } from 'electron';

export function externalLinkURL(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
      return undefined;
    if (url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Only the app document may inhabit a window with the trusted UI preload. */
export function protectWindowNavigation(
  contents: WebContents,
  documentURL: string,
  openExternal: (url: string) => Promise<void>
) {
  const document = new URL(documentURL);
  document.hash = '';
  const allowed = (value: string) => {
    try {
      const candidate = new URL(value);
      candidate.hash = '';
      return candidate.href === document.href;
    } catch {
      return false;
    }
  };
  const navigate = (event: { preventDefault: () => void }, url: string) => {
    if (!allowed(url)) event.preventDefault();
  };
  contents.on('will-navigate', navigate);
  contents.on('will-redirect', navigate);
  contents.setWindowOpenHandler(({ url }) => {
    const destination = externalLinkURL(url);
    if (destination) {
      // External launch failures must not become unhandled promise rejections.
      openExternal(destination).catch(() => {});
    }
    return { action: 'deny' };
  });
}
