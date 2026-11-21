import type { Session } from 'electron';
import { extensionPanelURL } from './extensionSidePanels';

export function extensionDocumentId(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'chrome-extension:' &&
      /^[a-p]{32}$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    )
      return url.hostname;
  } catch {
    /* Other tab URL policies handle malformed addresses. */
  }
  return undefined;
}

/** Restored extension tabs must resolve in their group's loaded extension session. */
export function assertExtensionDocument(value: string, session: Session) {
  const id = extensionDocumentId(value);
  if (!id) throw new Error('Invalid extension page address');
  const extension = session.extensions.getExtension(id);
  if (!extension) throw new Error('Extension is unavailable in this group');
  extensionPanelURL(extension, value);
}
