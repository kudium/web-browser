/** @jest-environment node */
import { fetchPageFavicon } from '../main/pageFavicon';

const pageURL = 'https://example.com/page';
const address = 'https://example.com/favicon.ico';
function context(fetch: jest.Mock) {
  return {
    isDestroyed: () => false,
    getURL: jest.fn(() => pageURL),
    executeJavaScriptInIsolatedWorld: jest.fn((_world, scripts) =>
      // Execute the actual fallback with browser fetch/location supplied.
      // eslint-disable-next-line no-new-func -- exercise our fixed browser script in Node
      new Function('fetch', 'location', `return ${scripts[0].code}`)(fetch, {
        href: pageURL,
      })
    ),
  };
}
it('reads the favicon using same-origin page credentials and preserves bytes', async () => {
  const fetch = jest.fn(
    async () => new Response(new Uint8Array([0, 255, 127]))
  );
  const contents = context(fetch);
  const result = await fetchPageFavicon(
    contents,
    address,
    pageURL,
    new AbortController().signal
  );
  expect(Buffer.from(await result.arrayBuffer())).toEqual(
    Buffer.from([0, 255, 127])
  );
  expect(fetch).toHaveBeenCalledWith(
    address,
    expect.objectContaining({
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'error',
    })
  );
  expect(contents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
    1004,
    expect.any(Array)
  );
});
it('does not execute for cross-origin candidates', async () => {
  const contents = context(jest.fn());
  await expect(
    fetchPageFavicon(
      contents,
      'https://other.example/icon.png',
      pageURL,
      new AbortController().signal
    )
  ).rejects.toThrow('context');
  expect(contents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
});
it.each([403, 200])(
  'rejects blocked or oversized responses (%s)',
  async (status) => {
    const fetch = jest.fn(
      async () =>
        new Response(new Uint8Array(status === 200 ? 1048577 : 1), { status })
    );
    await expect(
      fetchPageFavicon(
        context(fetch),
        address,
        pageURL,
        new AbortController().signal
      )
    ).rejects.toThrow('response');
  }
);
it('rejects a result after navigation', async () => {
  const contents = context(jest.fn(async () => new Response('icon')));
  contents.getURL
    .mockReturnValueOnce(pageURL)
    .mockReturnValue('https://example.com/other');
  await expect(
    fetchPageFavicon(contents, address, pageURL, new AbortController().signal)
  ).rejects.toThrow('response');
});
it('rejects an aborted request before page execution', async () => {
  const controller = new AbortController();
  controller.abort();
  const contents = context(jest.fn());
  await expect(
    fetchPageFavicon(contents, address, pageURL, controller.signal)
  ).rejects.toThrow();
  expect(contents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
});
