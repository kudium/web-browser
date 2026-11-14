/** @jest-environment node */
import type { WebContents } from 'electron';
import { FaviconResolver } from '../main/faviconResolver';

jest.mock('../main/faviconDecoder', () => ({
  FaviconDecoder: jest.fn(() => ({
    decode: jest.fn(async (bytes: Buffer) => {
      if (bytes.toString() !== 'image') throw new Error('Invalid image');
      return 'data:image/png;base64,aW1hZ2U=';
    }),
    clear: jest.fn(),
  })),
}));
const pageURL = 'https://example.com/page';
function context(response: () => Promise<Response>) {
  return {
    isDestroyed: () => false,
    getURL: jest.fn(() => pageURL),
    session: { fetch: jest.fn(response) },
    executeJavaScriptInIsolatedWorld: jest.fn(async () => 'aW1hZ2U='),
  };
}
it('publishes a decoded declared icon without page execution', async () => {
  const contents = context(async () => new Response('image'));
  const accept = jest.fn();
  const resolver = new FaviconResolver();
  await resolver.resolve(
    'tab',
    contents as unknown as WebContents,
    ['https://example.com/icon.png'],
    accept
  );
  expect(accept).toHaveBeenCalledWith('data:image/png;base64,aW1hZ2U=');
  expect(contents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  resolver.clear();
});
it.each([403, 200])(
  'falls back after HTTP %s blocked or invalid image responses',
  async (status) => {
    const contents = context(async () => new Response('challenge', { status }));
    const resolver = new FaviconResolver();
    const accept = jest.fn();
    await resolver.resolve(
      'tab',
      contents as unknown as WebContents,
      [],
      accept
    );
    expect(contents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(1);
    expect(accept).toHaveBeenCalledTimes(1);
    resolver.clear();
  }
);
it('does not retry or publish after cancellation', async () => {
  let release!: (response: Response) => void;
  const contents = context(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const resolver = new FaviconResolver();
  const accept = jest.fn();
  const pending = resolver.resolve(
    'tab',
    contents as unknown as WebContents,
    [],
    accept
  );
  await Promise.resolve();
  resolver.cancel('tab');
  release(new Response('image'));
  await expect(pending).rejects.toThrow();
  expect(accept).not.toHaveBeenCalled();
  expect(contents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  resolver.clear();
});
it('does not publish an icon or retry after navigation', async () => {
  const contents = context(async () => {
    contents.getURL.mockReturnValue('https://other.example/');
    return new Response('challenge', { status: 403 });
  });
  const resolver = new FaviconResolver();
  const accept = jest.fn();
  await expect(
    resolver.resolve('tab', contents as unknown as WebContents, [], accept)
  ).rejects.toThrow();
  expect(accept).not.toHaveBeenCalled();
  expect(contents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  resolver.clear();
});
