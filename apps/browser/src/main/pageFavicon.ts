interface PageContents {
  isDestroyed(): boolean;
  getURL(): string;
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { code: string }[]
  ): Promise<unknown>;
}

/** Retry same-origin icons using the loaded page's browser context. */
export async function fetchPageFavicon(
  contents: PageContents,
  address: string,
  pageURL: string,
  signal: AbortSignal
): Promise<Response> {
  signal.throwIfAborted();
  const page = new URL(pageURL);
  const icon = new URL(address);
  if (
    !['http:', 'https:'].includes(page.protocol) ||
    icon.origin !== page.origin ||
    contents.isDestroyed() ||
    contents.getURL() !== pageURL
  )
    throw new Error('Page favicon context is unavailable.');
  const result = await contents.executeJavaScriptInIsolatedWorld(1004, [
    {
      code: `(async () => {
      if (location.href !== ${JSON.stringify(pageURL)}) return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      let reader;
      try {
        const response = await fetch(${JSON.stringify(address)}, {
          credentials: 'same-origin', mode: 'same-origin',
          redirect: 'error', signal: controller.signal
        });
        if (!response.ok || !response.body) return null;
        const length = response.headers.get('content-length');
        if (length && Number(length) > 1048576) return null;
        reader = response.body.getReader();
        let size = 0;
        let binary = '';
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1048576) return null;
          for (let offset = 0; offset < chunk.value.length; offset += 8192)
            binary += String.fromCharCode(...chunk.value.subarray(offset, offset + 8192));
        }
        return btoa(binary);
      } catch { return null; }
      finally {
        clearTimeout(timer);
        if (reader) await reader.cancel().catch(() => {});
        controller.abort();
      }
    })()`,
    },
  ]);
  signal.throwIfAborted();
  if (
    contents.isDestroyed() ||
    contents.getURL() !== pageURL ||
    typeof result !== 'string' ||
    !result.length ||
    result.length > 1398104 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(result)
  )
    throw new Error('Page favicon response is unavailable.');
  return new Response(Buffer.from(result, 'base64'));
}
