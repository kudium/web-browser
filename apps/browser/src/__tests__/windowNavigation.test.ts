import { EventEmitter } from 'events';
import {
  externalLinkURL,
  protectWindowNavigation,
} from '../main/windowNavigation';

it('limits external launches to web/mail/phone URLs without embedded credentials', () => {
  expect(externalLinkURL('tel:+14165550123')).toBe('tel:+14165550123');
  expect(externalLinkURL('tel:123')).toBeUndefined();
  expect(externalLinkURL('tel:+14165550123?extra=1')).toBeUndefined();
  expect(externalLinkURL('https://kudium.com')).toBe('https://kudium.com/');
  expect(externalLinkURL('mailto:hello@kudium.com')).toBe(
    'mailto:hello@kudium.com'
  );
  [
    'file:///tmp/test',
    // eslint-disable-next-line no-script-url
    'javascript:alert(1)',
    'data:text/html,test',
    'kudiumbrowser:run',
    'bad url',
    'https://user:secret@example.com',
  ].forEach((value) => {
    expect(externalLinkURL(value)).toBeUndefined();
  });
});

it('keeps the exact trusted document, permits fragments, and denies remote navigation/redirects', async () => {
  let popup!: (details: { url: string }) => { action: string };
  const contents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: (handler: typeof popup) => {
      popup = handler;
    },
  });
  const launch = jest.fn().mockRejectedValue(new Error('No handler'));
  protectWindowNavigation(
    contents as any,
    'file:///app/index.html?view=main',
    launch
  );
  ['will-navigate', 'will-redirect'].forEach((eventName) => {
    const permitted = { preventDefault: jest.fn() };
    contents.emit(
      eventName,
      permitted,
      'file:///app/index.html?view=main#section'
    );
    expect(permitted.preventDefault).not.toHaveBeenCalled();
    [
      'https://example.com',
      'file:///app/index.html?view=settings',
      'file:///app/other.html',
    ].forEach((url) => {
      const event = { preventDefault: jest.fn() };
      contents.emit(eventName, event, url);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });
  expect(popup({ url: 'file:///private/test' })).toEqual({ action: 'deny' });
  expect(launch).toHaveBeenCalledTimes(1);
  expect(launch).toHaveBeenCalledWith('https://example.com/');
  expect(popup({ url: 'https://kudium.com' })).toEqual({ action: 'deny' });
  expect(launch).toHaveBeenCalledWith('https://kudium.com/');
  expect(popup({ url: 'tel:+14165550123' })).toEqual({ action: 'deny' });
  expect(launch).toHaveBeenCalledWith('tel:+14165550123');
  await Promise.resolve();
});

it('allows only named Assistant blank windows from the main host and protects their navigation', () => {
  const openInGroup = jest.fn().mockResolvedValue(undefined);
  let popup: (details: { url: string; frameName: string }) => any = () => {};
  const contents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: (handler: typeof popup) => {
      popup = handler;
    },
  });
  protectWindowNavigation(
    contents as any,
    'file:///app/index.html?view=main',
    openInGroup,
    true
  );
  for (const panel of [
    'assistant',
    'notes',
    'activity',
    'tasks',
    'developer',
    'email',
  ]) {
    const result = popup({
      url: 'about:blank',
      frameName: `kudium-assistant-${panel}`,
    });
    expect(result.action).toBe('allow');
    expect(result.overrideBrowserWindowOptions.webPreferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    });
  }
  expect(popup({ url: 'about:blank', frameName: 'unrelated' }).action).toBe(
    'deny'
  );
  expect(popup({ url: 'about:blank', frameName: 'kudium-sidebar-hook-output' }).action).toBe('allow');
  expect(popup({ url: 'about:blank', frameName: 'kudium-sidebar-../private' }).action).toBe('deny');
  expect(
    popup({ url: 'https://example.com', frameName: 'kudium-assistant-notes' })
      .action
  ).toBe('deny');
  const childContents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: jest.fn(),
  });
  const child = Object.assign(new EventEmitter(), {
    webContents: childContents,
    setMinimumSize: jest.fn(),
  });
  contents.emit('did-create-window', child);
  const event = { preventDefault: jest.fn() };
  childContents.emit('will-navigate', event, 'https://example.com');
  expect(event.preventDefault).toHaveBeenCalled();
  expect(openInGroup).toHaveBeenLastCalledWith('https://example.com/');
  const childPopup = childContents.setWindowOpenHandler.mock.calls[0][0];
  expect(childPopup({ url: 'https://example.com/child', frameName: '' })).toEqual({ action: 'deny' });
  expect(openInGroup).toHaveBeenLastCalledWith('https://example.com/child');
  openInGroup.mockClear();
  childContents.emit('will-redirect', { preventDefault: jest.fn() }, 'https://example.com/redirect');
  expect(openInGroup).not.toHaveBeenCalled();
});
