import { EventEmitter } from 'events';
import {
  externalLinkURL,
  protectWindowNavigation,
} from '../main/windowNavigation';

it('limits external launches to web/mail URLs without embedded credentials', () => {
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
  expect(launch).not.toHaveBeenCalled();
  expect(popup({ url: 'https://kudium.com' })).toEqual({ action: 'deny' });
  expect(launch).toHaveBeenCalledWith('https://kudium.com/');
  await Promise.resolve();
});
