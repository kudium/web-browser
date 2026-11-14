import type { WebContents } from 'electron';
import { FaviconDecoder } from './faviconDecoder';
import { FaviconLoader, faviconCandidates } from './faviconLoader';
import { fetchPageFavicon } from './pageFavicon';

/** Shared bounded fetch, decode and page-context fallback for website icons. */
export class FaviconResolver {
  private loader = new FaviconLoader();

  private decoder = new FaviconDecoder();

  private requests = new Map<string, symbol>();

  cancel(id: string) {
    this.requests.delete(id);
    this.loader.cancel(id);
  }

  clear() {
    this.requests.clear();
    this.loader.clear();
    this.decoder.clear();
  }

  async resolve(
    id: string,
    contents: WebContents,
    declared: string[],
    accept: (icon: string) => void
  ): Promise<void> {
    this.cancel(id);
    const request = Symbol(id);
    this.requests.set(id, request);
    const pageURL = contents.getURL();
    const candidates = faviconCandidates(declared, pageURL);
    const current = () =>
      this.requests.get(id) === request &&
      !contents.isDestroyed() &&
      contents.getURL() === pageURL;
    const decode = async (bytes: Buffer, signal: AbortSignal) => {
      const icon = await this.decoder.decode(bytes, signal);
      signal.throwIfAborted();
      if (current()) accept(icon);
    };
    try {
      try {
        await this.loader.load(
          id,
          candidates,
          (address, options) => contents.session.fetch(address, options),
          decode
        );
      } catch (error) {
        if (!current()) throw error;
        // Retry even when a successful HTTP response contained a challenge
        // document or an image our decoder could not read.
        const pageCandidates = candidates.filter((address) => {
          const icon = new URL(address);
          return (
            ['http:', 'https:'].includes(icon.protocol) &&
            icon.origin === new URL(pageURL).origin
          );
        });
        if (!pageCandidates.length) throw error;
        await this.loader.load(
          id,
          pageCandidates,
          (address, options) =>
            fetchPageFavicon(contents, address, pageURL, options.signal),
          decode
        );
      }
    } finally {
      if (this.requests.get(id) === request) this.requests.delete(id);
    }
  }
}
