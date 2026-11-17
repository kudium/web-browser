import { EventEmitter } from 'events';
import { desktopCapturer, webContents } from 'electron';
import {
  screenSharingHandler,
  configureScreenSharing,
} from '../main/screenSharing';
import { showBrowserDialog } from '../main/dialogs';
import { getBrowserPreferences } from '../main/preferences';
import { getSiteSettings } from '../main/siteSettings';

jest.mock('electron', () => ({
  desktopCapturer: { getSources: jest.fn() },
  webContents: { fromFrame: jest.fn() },
}));
jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
jest.mock('../main/preferences', () => ({ getBrowserPreferences: jest.fn() }));
jest.mock('../main/siteSettings', () => ({
  ...jest.requireActual('../main/siteSettings'),
  getSiteSettings: jest.fn(),
}));

const source = { id: 'window:fixture:0', name: 'Disposable fixture' };
let contents: any;
let owner: any;
let ownerFor: jest.Mock;
const request = () => ({
  frame: { isDestroyed: () => false },
  securityOrigin: 'https://fixture.test',
  videoRequested: true,
  audioRequested: true,
  userGesture: true,
});
beforeEach(() => {
  jest.clearAllMocks();
  contents = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  owner = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  ownerFor = jest.fn(() => owner);
  (webContents.fromFrame as jest.Mock).mockReturnValue(contents);
  (getBrowserPreferences as jest.Mock).mockReturnValue({ permissions: 'ask' });
  (getSiteSettings as jest.Mock).mockReturnValue({ permissions: {} });
  (desktopCapturer.getSources as jest.Mock).mockResolvedValue([source]);
  (showBrowserDialog as jest.Mock).mockResolvedValue({
    response: 1,
    inputValues: { source: '0' },
  });
});

it('requires an explicit fresh source selection through the browser-owned picker', async () => {
  const session = { setDisplayMediaRequestHandler: jest.fn() };
  configureScreenSharing(session as any, 'profile', ownerFor);
  expect(session.setDisplayMediaRequestHandler).toHaveBeenCalledWith(
    expect.any(Function),
    { useSystemPicker: false },
  );
  const callback = jest.fn();
  await screenSharingHandler('profile', ownerFor)(request() as any, callback);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ video: source });
  expect(desktopCapturer.getSources).toHaveBeenCalledTimes(2);
  expect(showBrowserDialog).toHaveBeenCalledWith(
    owner,
    expect.objectContaining({
      siteOrigin: 'https://fixture.test',
      defaultId: 0,
      cancelId: 0,
    }),
  );
  expect(contents.listenerCount('destroyed')).toBe(0);
  expect(owner.listenerCount('closed')).toBe(0);
});

it.each([
  'cancel',
  'missing-source',
  'empty-source',
  'removed-source',
  'global-block',
  'site-block',
  'owner-changed',
])('denies %s without sharing another surface', async (reason) => {
  if (reason === 'cancel')
    (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 0 });
  if (reason === 'missing-source')
    (showBrowserDialog as jest.Mock).mockResolvedValue({
      response: 1,
      inputValues: { source: '99' },
    });
  if (reason === 'empty-source')
    (showBrowserDialog as jest.Mock).mockResolvedValue({
      response: 1,
      inputValues: { source: '' },
    });
  if (reason === 'removed-source')
    (desktopCapturer.getSources as jest.Mock)
      .mockResolvedValueOnce([source])
      .mockResolvedValueOnce([]);
  if (reason === 'global-block')
    (getBrowserPreferences as jest.Mock).mockReturnValue({
      permissions: 'block',
    });
  if (reason === 'site-block')
    (getSiteSettings as jest.Mock).mockReturnValue({
      permissions: { 'display-capture': 'block' },
    });
  if (reason === 'owner-changed')
    ownerFor.mockReturnValueOnce(owner).mockReturnValue(undefined);
  const callback = jest.fn();
  await screenSharingHandler('profile', ownerFor)(request() as any, callback);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({});
});

it.each(['navigation', 'close'])(
  'invalidates a pending selection on %s and answers once',
  async (reason) => {
    let resolve!: (answer: any) => void;
    (showBrowserDialog as jest.Mock).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const callback = jest.fn();
    const pending = screenSharingHandler('profile', ownerFor)(
      request() as any,
      callback,
    );
    await Promise.resolve();
    if (reason === 'navigation')
      contents.emit('did-start-navigation', {}, 'https://other.test', false);
    else owner.emit('closed');
    expect(callback).toHaveBeenCalledWith({});
    resolve({ response: 1, inputValues: { source: '0' } });
    await pending;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(contents.listenerCount('did-start-navigation')).toBe(0);
  },
);

it('rejects requests without a live browser owner or trusted user gesture', async () => {
  const callback = jest.fn();
  await screenSharingHandler('profile', ownerFor)(
    { ...request(), userGesture: false } as any,
    callback,
  );
  expect(callback).toHaveBeenCalledWith({});
  expect(desktopCapturer.getSources).not.toHaveBeenCalled();
  callback.mockClear();
  ownerFor.mockReturnValue(undefined);
  await screenSharingHandler('profile', ownerFor)(request() as any, callback);
  expect(callback).toHaveBeenCalledWith({});
  expect(showBrowserDialog).not.toHaveBeenCalled();
});
