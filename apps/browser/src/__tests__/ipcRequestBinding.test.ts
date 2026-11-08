/** @jest-environment node */
import { EventEmitter } from 'events';
import type { IpcMainInvokeEvent } from 'electron';
import { watchIPCRequest } from '../main/ipcRequestBinding';

function fixture() {
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: {},
    getURL: jest.fn(() => 'file:///trusted/index.html'),
    isDestroyed: jest.fn(() => false),
  });
  const event = {
    sender,
    senderFrame: sender.mainFrame,
  } as unknown as IpcMainInvokeEvent;
  const trusted = jest.fn(() => true);
  return { sender, event, trusted };
}

it.each(['navigation', 'destroyed', 'render-process-gone'])(
  'revokes %s even when frame and URL identities are reused',
  (reason) => {
    const { sender, event, trusted } = fixture();
    const request = watchIPCRequest(event, trusted);
    if (reason === 'navigation')
      sender.emit('did-start-navigation', {}, sender.getURL(), false, true);
    else sender.emit(reason);
    expect(request.active()).toBe(false);
    expect(request.assert).toThrow('window or its access changed');
    request.dispose();
    expect(sender.eventNames()).toEqual([]);
  }
);

it('checks current sender/frame/trust and cleans up a successful request', () => {
  const { sender, event, trusted } = fixture();
  expect(() =>
    watchIPCRequest({ ...event, senderFrame: {} } as any, trusted)
  ).toThrow();
  const request = watchIPCRequest(event, trusted);
  sender.emit('did-start-navigation', {}, 'https://child.test/', false, false);
  request.assert();
  trusted.mockReturnValue(false);
  expect(request.assert).toThrow();
  request.dispose();
  expect(sender.eventNames()).toEqual([]);
});
