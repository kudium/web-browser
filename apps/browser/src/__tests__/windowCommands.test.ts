import { EventEmitter } from 'events';
import { registerWindowCommands } from '../main/windowCommands';
import { eventBus } from '../utils/EventBus';

jest.mock('electron-log', () => ({ warn: jest.fn() }));
const fixture = () => {
  const ipc = new EventEmitter();
  const mainFrame = {};
  const source = {
    isDestroyed: () => false,
    close: jest.fn(),
    webContents: { mainFrame, send: jest.fn() },
  };
  const event = { sender: source.webContents, senderFrame: mainFrame };
  return { ipc, source, event };
};

it('restricts window commands to registered main frames and ignores renderer security options', async () => {
  const { ipc, source, event } = fixture();
  const create = jest.fn().mockResolvedValue(undefined);
  registerWindowCommands(ipc as any, { main: source } as any, create);
  [
    undefined,
    [],
    [null],
    [{ view: '__proto__' }],
    [{ view: 'settings', intent: 'unknown' }],
  ].forEach((bad) => ipc.emit('ipc-create-window', event, bad));
  ipc.emit('ipc-create-window', { ...event, senderFrame: {} }, [
    { view: 'settings' },
  ]);
  ipc.emit('ipc-create-window', { ...event, sender: {} }, [
    { view: 'settings' },
  ]);
  expect(create).not.toHaveBeenCalled();
  ipc.emit('ipc-create-window', event, [
    {
      view: 'settings',
      options: { webPreferences: { nodeIntegration: true }, width: 9999 },
      isChild: false,
    },
  ]);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      view: 'settings',
      isChild: true,
      options: { width: 1080, height: 800, minWidth: 760, minHeight: 600 },
    })
  );
  ipc.emit('ipc-close-window', { ...event, senderFrame: {} });
  expect(source.close).not.toHaveBeenCalled();
  ipc.emit('ipc-close-window', event);
  expect(source.close).toHaveBeenCalledTimes(1);
  create.mockRejectedValueOnce(new Error('Failed load'));
  ipc.emit('ipc-create-window', event, [{ view: 'main' }]);
  await Promise.resolve();
});

it('broadcasts only bounded known events from registered main frames', () => {
  const { ipc, source, event } = fixture();
  eventBus.registerOnMain(ipc as any, { main: source } as any);
  const content = [{ app_list_update: undefined }];
  ipc.emit('ipc-event-bus', { ...event, senderFrame: {} }, content);
  ipc.emit('ipc-event-bus', { ...event, sender: {} }, content);
  [
    null,
    [],
    [null],
    [{ unknown_event: 1 }],
    [{ app_list_update: 'x'.repeat(262145) }],
    [{ app_list_update: 1, space_update: 2 }],
  ].forEach((bad) => ipc.emit('ipc-event-bus', event, bad));
  const circular: any = {};
  circular.self = circular;
  ipc.emit('ipc-event-bus', event, [{ app_list_update: circular }]);
  expect(source.webContents.send).not.toHaveBeenCalled();
  ipc.emit('ipc-event-bus', event, content);
  expect(source.webContents.send).toHaveBeenCalledWith(
    'ipc-event-bus',
    content
  );
});
