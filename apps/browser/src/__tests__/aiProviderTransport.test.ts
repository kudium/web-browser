/** @jest-environment node */
import http from 'http';
import { AddressInfo } from 'net';
import { aiProviderURL, aiURL } from '../browser/ai';
import { fetchAIProvider, requestAIProvider } from '../main/aiProviderRequest';

it.each([
  'http://provider.example/v1',
  'http://localhost.example/v1',
  'http://127.0.0.1.example/v1',
  'http://192.168.1.5/v1',
  'http://[::ffff:127.0.0.1]/v1',
  'https://user:secret@provider.example/v1',
  'file:///private/model',
])('rejects unsafe provider configuration %s', (url) => {
  expect(() => aiProviderURL(url)).toThrow();
});

it.each([
  'https://provider.example/v1',
  'http://localhost:11434/v1',
  'http://127.0.0.1:11434/v1',
  'http://[::1]:11434/v1',
])('preserves supported provider configuration %s', (url) => {
  expect(aiProviderURL(url)).toBe(url);
});

it('keeps ordinary HTTP browser navigation available', () => {
  expect(aiURL('http://example.com')).toBe('http://example.com/');
});

it('rejects remote plaintext before any network request', async () => {
  const fetcher = jest.spyOn(global, 'fetch');
  try {
    await expect(
      requestAIProvider(
        'http://provider.example',
        { headers: { Authorization: 'Bearer synthetic' } },
        new AbortController().signal,
        jest.fn()
      )
    ).rejects.toThrow('require HTTPS');
    await expect(
      fetchAIProvider('http://provider.example/models', {})
    ).rejects.toThrow('require HTTPS');
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    fetcher.mockRestore();
  }
});

it.each([301, 302, 303, 307, 308])(
  'blocks real %s redirects without forwarding synthetic credentials or retrying',
  async (status) => {
    const destination = jest.fn();
    const target = http.createServer((request, response) => {
      destination(request.headers, request.url);
      response.end('{}');
    });
    const origin = jest.fn();
    const source = http.createServer((request, response) => {
      origin(request.headers);
      response.writeHead(status, {
        Location: `http://127.0.0.1:${
          (target.address() as AddressInfo).port
        }/destination`,
      });
      response.end();
    });
    const close = async (server: http.Server) => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    };
    try {
      await new Promise<void>((resolve) => {
        target.listen(0, '127.0.0.1', resolve);
      });
      await new Promise<void>((resolve) => {
        source.listen(0, '127.0.0.1', resolve);
      });
      const retry = jest.fn();
      const url = `http://127.0.0.1:${(source.address() as AddressInfo).port}`;
      await expect(
        requestAIProvider(
          url,
          {
            method: 'POST',
            redirect: 'follow',
            headers: { Authorization: 'Bearer synthetic' },
            body: '{"private":"synthetic"}',
          },
          new AbortController().signal,
          retry
        )
      ).rejects.toThrow('redirects are blocked');
      expect(origin).toHaveBeenCalledTimes(1);
      expect(destination).not.toHaveBeenCalled();
      expect(retry).not.toHaveBeenCalled();
      // Model discovery cannot override the same transport boundary either.
      await expect(
        fetchAIProvider(`${url}/models`, { redirect: 'follow' })
      ).rejects.toThrow('redirects are blocked');
      expect(origin).toHaveBeenCalledTimes(2);
      expect(destination).not.toHaveBeenCalled();
    } finally {
      await close(source);
      await close(target);
    }
  }
);
