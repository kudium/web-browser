import { EventEmitter } from 'events';
import { interceptAIHTMLDrag } from '../main/aiHTMLDrag';

Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
  configurable: true,
  value() {
    if (this.aborted) throw new Error('Stopped.');
  },
});
let contents: any;
let send: jest.Mock;
const payload = {
  items: [{ mimeType: 'text/plain', data: 'Actual browser drag data' }],
  dragOperationsMask: 1,
};
beforeEach(() => {
  contents = { debugger: new EventEmitter() };
  send = jest.fn().mockResolvedValue({});
});
const capture = (data: unknown = payload) =>
  contents.debugger.emit('message', {}, 'Input.dragIntercepted', { data });

it('passes the captured native payload unchanged and releases interception', async () => {
  const drop = jest.fn().mockResolvedValue(undefined);
  await interceptAIHTMLDrag(
    contents,
    send,
    new AbortController().signal,
    async () => {
      capture();
    },
    drop
  );
  expect(drop).toHaveBeenCalledWith(payload);
  expect(send).toHaveBeenLastCalledWith('Input.setInterceptDrags', {
    enabled: false,
  });
  expect(contents.debugger.listenerCount('message')).toBe(0);
});

it('refuses duplicate native drags before dropping', async () => {
  const drop = jest.fn();
  await expect(
    interceptAIHTMLDrag(
      contents,
      send,
      new AbortController().signal,
      async () => {
        capture();
        capture();
      },
      drop
    )
  ).rejects.toThrow('drag changed');
  expect(drop).not.toHaveBeenCalled();
  expect(contents.debugger.listenerCount('message')).toBe(0);
});

it('refuses external file payloads without implicit file approval', async () => {
  const drop = jest.fn();
  await expect(
    interceptAIHTMLDrag(
      contents,
      send,
      new AbortController().signal,
      async () => {
        capture({ ...payload, files: ['/private.txt'] });
      },
      drop
    )
  ).rejects.toThrow('separate file approval');
  expect(drop).not.toHaveBeenCalled();
});

it('Stop releases listeners and interception even if a backend trigger never resolves', async () => {
  const controller = new AbortController();
  const drop = jest.fn();
  await expect(
    interceptAIHTMLDrag(
      contents,
      send,
      controller.signal,
      async () => {
        capture();
        controller.abort();
        await new Promise(() => {});
      },
      drop
    )
  ).rejects.toThrow('Stopped');
  expect(drop).not.toHaveBeenCalled();
  expect(contents.debugger.listenerCount('message')).toBe(0);
  expect(send).toHaveBeenLastCalledWith('Input.setInterceptDrags', {
    enabled: false,
  });
});
