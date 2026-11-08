import { EventEmitter } from 'events';
import { attachAIInputGuard } from '../main/aiInterrupt';

it('absorbs native page keys during owned AI work without requesting takeover', () => {
  const contents = new EventEmitter();
  let owned = true;
  let active = true;
  const cleanup = attachAIInputGuard(
    contents as any,
    () => owned,
    () => active
  );
  const event = { preventDefault: jest.fn() };
  ['Escape', 'a', 'Enter', 'Backspace', 'Delete'].forEach((key) => {
    contents.emit('before-input-event', event, { type: 'keyDown', key });
  });
  expect(event.preventDefault).toHaveBeenCalledTimes(5);
  active = false;
  contents.emit('before-input-event', event, { type: 'keyDown', key: 'a' });
  active = true;
  owned = false;
  contents.emit('before-input-event', event, { type: 'keyDown', key: 'a' });
  expect(event.preventDefault).toHaveBeenCalledTimes(5);
  cleanup();
  cleanup();
  expect(contents.listenerCount('before-input-event')).toBe(0);
});
