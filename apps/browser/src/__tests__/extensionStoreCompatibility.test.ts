import { EventEmitter } from 'events';
import {
  applyExtensionStoreClientHint,
  configureExtensionStoreCompatibility,
} from '../main/extensionStoreCompatibility';
import { addRequestHeaderRule } from '../main/requestHeaderRules';

const version = '156.0.8078.48';
const store = 'https://chromewebstore.google.com/detail/fixture';
const original = () => ({
  'User-Agent': `Mozilla/5.0 Chrome/${version} Safari/537.36`,
  'sec-ch-ua': '"Chromium";v="156", "Not:A-Brand";v="8"',
  Cookie: 'fixture=value',
});

it('adds the store compatibility brand with the real engine version and preserves other headers', () => {
  const headers = original();
  applyExtensionStoreClientHint(store, headers, version);
  expect(headers).toEqual({
    'User-Agent': original()['User-Agent'],
    'Sec-CH-UA': `${original()['sec-ch-ua']}, "Google Chrome";v="156"`,
    Cookie: 'fixture=value',
  });
  const copy = { ...headers };
  applyExtensionStoreClientHint(store, headers, version);
  expect(headers).toEqual(copy);
});

it.each([
  'https://example.com/',
  'https://chromewebstore.google.com.evil.example/',
  'https://chromewebstore.google.com:8443/',
  'http://chromewebstore.google.com/',
  'invalid',
])('leaves non-store origins unchanged: %s', (url) => {
  const headers = original();
  applyExtensionStoreClientHint(url, headers, version);
  expect(headers).toEqual(original());
});

it('respects custom identities and refuses invalid runtime versions', () => {
  const headers = { ...original(), 'User-Agent': 'Firefox/144.0' };
  const copy = { ...headers };
  applyExtensionStoreClientHint(store, headers, version);
  expect(headers).toEqual(copy);
  const invalid = original();
  applyExtensionStoreClientHint(store, invalid, '156\r\nInjected: true');
  expect(invalid).toEqual(original());
});

it('composes with preferences once per session and only affects its registered live store tab', () => {
  let listener: any;
  const session = {
    webRequest: {
      onBeforeSendHeaders: jest.fn((_filter, callback) => {
        listener = callback;
      }),
    },
  } as any;
  const contents = Object.assign(new EventEmitter(), {
    id: 20,
    session,
    isDestroyed: () => false,
    mainFrame: { origin: 'https://chromewebstore.google.com' },
  }) as any;
  const descriptor = Object.getOwnPropertyDescriptor(
    process.versions,
    'chrome'
  );
  Object.defineProperty(process.versions, 'chrome', {
    value: version,
    configurable: true,
  });
  try {
    configureExtensionStoreCompatibility(contents);
    configureExtensionStoreCompatibility(contents);
    let customIdentity = '';
    addRequestHeaderRule(session, (_details, headers) => {
      delete headers.Cookie;
      if (customIdentity) headers['User-Agent'] = customIdentity;
    });
    expect(session.webRequest.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
    const send = (id: number, resourceType = 'mainFrame') => {
      const response = jest.fn();
      listener(
        {
          url: store,
          webContentsId: id,
          resourceType,
          requestHeaders: original(),
        },
        response
      );
      expect(response).toHaveBeenCalledTimes(1);
      return response.mock.calls[0][0].requestHeaders;
    };
    expect(send(21)['sec-ch-ua']).toBe(original()['sec-ch-ua']);
    expect(send(20)['Sec-CH-UA']).toContain('"Google Chrome";v="156"');
    expect(send(20).Cookie).toBeUndefined();
    contents.mainFrame.origin = 'https://example.com';
    expect(send(20, 'xhr')['sec-ch-ua']).toBe(original()['sec-ch-ua']);
    expect(send(20)['Sec-CH-UA']).toContain('Google Chrome');
    customIdentity = 'Firefox/144.0';
    expect(send(20)['sec-ch-ua']).toBe(original()['sec-ch-ua']);
    customIdentity = '';
    contents.emit('destroyed');
    expect(send(20)['sec-ch-ua']).toBe(original()['sec-ch-ua']);
    expect(original().Cookie).toBe('fixture=value');
  } finally {
    if (descriptor)
      Object.defineProperty(process.versions, 'chrome', descriptor);
    else delete (process.versions as Record<string, string>).chrome;
  }
});

it('cancels once when a composed header rule fails', () => {
  let listener: any;
  const session = {
    webRequest: {
      onBeforeSendHeaders: (_filter: any, callback: any) => {
        listener = callback;
      },
    },
  } as any;
  addRequestHeaderRule(session, () => {
    throw new Error('Invalid policy');
  });
  const response = jest.fn();
  listener({ requestHeaders: original() }, response);
  expect(response).toHaveBeenCalledTimes(1);
  expect(response).toHaveBeenCalledWith({ cancel: true });
});
