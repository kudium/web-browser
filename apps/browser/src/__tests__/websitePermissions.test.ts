import { EventEmitter } from 'events';
import { showBrowserDialog } from '../main/dialogs';
import { getBrowserPreferences } from '../main/preferences';
import { getSiteSettings, updateSiteSettings } from '../main/siteSettings';
import {
  websitePermissionHandler,
  websitePermissionCheckHandler,
} from '../main/websitePermissions';

jest.mock('../main/dialogs', () => ({
  showBrowserDialog: jest.fn(),
  websitePermissionDialog: jest.fn(() => ({})),
}));
jest.mock('../main/preferences', () => ({ getBrowserPreferences: jest.fn() }));
jest.mock('../main/siteSettings', () => ({
  ...jest.requireActual('../main/siteSettings'),
  getSiteSettings: jest.fn(),
  updateSiteSettings: jest.fn(),
}));
jest.mock('electron', () => ({ app: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  (getBrowserPreferences as jest.Mock).mockReturnValue({ permissions: 'ask' });
  (getSiteSettings as jest.Mock).mockReturnValue({
    permissions: {},
    muted: false,
  });
});

function pendingRequest() {
  let answer!: (value: { response: number }) => void;
  (showBrowserDialog as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    })
  );
  const requester = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    getURL: () => 'https://example.com',
  });
  const callback = jest.fn();
  const pending = websitePermissionHandler({} as any, 'profile')(
    requester as any,
    'geolocation',
    callback,
    { requestingUrl: 'https://example.com/path' } as any
  );
  return { requester, callback, pending, answer };
}

describe.each([
  'persistent-storage',
  'storage-access',
  'top-level-storage-access',
])('%s', (permission) => {
  it.each([
    [undefined, 'ask', true],
    ['ask', 'ask', true],
    ['allow', 'ask', true],
    ['block', 'ask', false],
    ['allow', 'block', false],
    [undefined, 'block', false],
  ])(
    'handles storage access silently with site %s and global %s',
    async (choice, globalChoice, allowed) => {
      (getBrowserPreferences as jest.Mock).mockReturnValue({
        permissions: globalChoice,
      });
      (getSiteSettings as jest.Mock).mockReturnValue({
        permissions: { [permission]: choice },
      });
      const check = websitePermissionCheckHandler('profile');
      expect(
        check(null, permission as any, 'https://chatgpt.com', {} as any)
      ).toBe(allowed);
      const callback = jest.fn();
      await websitePermissionHandler({} as any, 'profile')(
        { isDestroyed: () => false } as any,
        permission as any,
        callback,
        { requestingUrl: 'https://chatgpt.com/' } as any
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(allowed);
      expect(showBrowserDialog).not.toHaveBeenCalled();
      expect(updateSiteSettings).not.toHaveBeenCalled();
    }
  );

  it('denies storage access without a valid requesting origin', async () => {
    const check = websitePermissionCheckHandler('profile');
    expect(check(null, permission as any, 'null', {} as any)).toBe(false);
    const callback = jest.fn();
    await websitePermissionHandler({} as any, 'profile')(
      { isDestroyed: () => false } as any,
      permission as any,
      callback,
      { requestingUrl: '', isMainFrame: false } as any
    );
    expect(callback).toHaveBeenCalledWith(false);
    expect(showBrowserDialog).not.toHaveBeenCalled();
  });
});

it('global blocking overrides an open permission prompt without saving approval', async () => {
  const request = pendingRequest();
  (getBrowserPreferences as jest.Mock).mockReturnValue({
    permissions: 'block',
  });
  request.answer({ response: 1 });
  await request.pending;
  expect(request.callback).toHaveBeenCalledWith(false);
  expect(updateSiteSettings).not.toHaveBeenCalled();
  expect(request.requester.listenerCount('did-start-navigation')).toBe(0);
});

it.each(['navigation', 'destruction'])(
  'invalidates a prompt on %s and answers exactly once',
  async (cause) => {
    const request = pendingRequest();
    if (cause === 'navigation') {
      request.requester.emit(
        'did-start-navigation',
        {},
        'https://other.example',
        false
      );
    } else request.requester.emit('destroyed');
    expect(request.callback).toHaveBeenCalledWith(false);
    request.answer({ response: 1 });
    await request.pending;
    expect(request.callback).toHaveBeenCalledTimes(1);
    expect(updateSiteSettings).not.toHaveBeenCalled();
    expect(request.requester.listenerCount('destroyed')).toBe(0);
  }
);

it('keeps in-page navigation valid and preserves a changed site decision', async () => {
  const request = pendingRequest();
  request.requester.emit(
    'did-start-navigation',
    {},
    'https://example.com/#a',
    true
  );
  (getSiteSettings as jest.Mock).mockReturnValue({
    permissions: { geolocation: 'block' },
  });
  request.answer({ response: 1 });
  await request.pending;
  expect(request.callback).toHaveBeenCalledWith(false);
  expect(updateSiteSettings).not.toHaveBeenCalled();
});

it('saves approval for the original origin and releases prompt listeners', async () => {
  const request = pendingRequest();
  request.answer({ response: 1 });
  await request.pending;
  expect(request.callback).toHaveBeenCalledWith(true);
  expect(updateSiteSettings).toHaveBeenCalledWith(
    'profile',
    'https://example.com',
    {
      permissions: { geolocation: 'allow' },
    }
  );
  expect(request.requester.listenerCount('did-start-navigation')).toBe(0);
  expect(request.requester.listenerCount('destroyed')).toBe(0);
});

it('does not inherit the parent grant for a subframe without a requesting URL', async () => {
  (getSiteSettings as jest.Mock).mockReturnValue({
    permissions: { geolocation: 'allow' },
  });
  const callback = jest.fn();
  const requester = {
    isDestroyed: () => false,
    getURL: () => 'https://parent.example',
  } as any;
  const handler = websitePermissionHandler({} as any, 'profile');
  await handler(requester, 'geolocation', callback, {
    isMainFrame: false,
    requestingUrl: '',
  });
  expect(callback).toHaveBeenCalledWith(false);
  expect(getSiteSettings).not.toHaveBeenCalled();
  expect(showBrowserDialog).not.toHaveBeenCalled();
  callback.mockClear();
  await handler(requester, 'geolocation', callback, {
    isMainFrame: true,
    requestingUrl: '',
  });
  expect(callback).toHaveBeenCalledWith(true);
  expect(getSiteSettings).toHaveBeenCalledWith(
    'profile',
    'https://parent.example'
  );
});

it('checks media against the reported security origin rather than its embedding page', () => {
  (getSiteSettings as jest.Mock).mockImplementation((_profile, origin) => ({
    permissions: {
      media: origin === 'https://parent.example' ? 'allow' : 'block',
    },
  }));
  const check = websitePermissionCheckHandler('profile');
  expect(
    check(null, 'media', 'https://parent.example', {
      isMainFrame: false,
      securityOrigin: 'https://frame.example',
      embeddingOrigin: 'https://parent.example',
    })
  ).toBe(false);
  expect(getSiteSettings).toHaveBeenLastCalledWith(
    'profile',
    'https://frame.example'
  );
  expect(
    check(null, 'media', 'https://parent.example', {
      isMainFrame: false,
      securityOrigin: 'null',
    })
  ).toBe(false);
  expect(
    check(null, 'media', 'https://parent.example', {
      isMainFrame: false,
      securityOrigin: '',
    })
  ).toBe(false);
  expect(
    check(null, 'media', 'https://parent.example', { isMainFrame: true })
  ).toBe(true);
});
