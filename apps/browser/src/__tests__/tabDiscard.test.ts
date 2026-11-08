import { inspectDiscardCandidate } from '../main/tabDiscard';

function contents(
  listeners: { type: string }[] = [],
  value: unknown = { x: 1, y: 2 }
) {
  let attached = false;
  return {
    debugger: {
      isAttached: () => attached,
      attach: jest.fn(() => {
        attached = true;
      }),
      detach: jest.fn(() => {
        attached = false;
      }),
      sendCommand: jest.fn(async (command: string, params: any) => {
        if (command === 'DOMDebugger.getEventListeners') return { listeners };
        if (params.expression === 'window')
          return { result: { objectId: 'window' } };
        return { result: { value } };
      }),
    },
  };
}
test('accepts read-only pages and cleans up its debugger', async () => {
  const web = contents();
  expect(await inspectDiscardCandidate(web as any)).toEqual({ x: 1, y: 2 });
  expect(web.debugger.detach).toHaveBeenCalledTimes(1);
});
test('protects unload handlers, editors and failed inspections', async () => {
  expect(
    await inspectDiscardCandidate(contents([{ type: 'beforeunload' }]) as any)
  ).toBeUndefined();
  expect(
    await inspectDiscardCandidate(contents([], null) as any)
  ).toBeUndefined();
  const broken = contents();
  broken.debugger.sendCommand.mockRejectedValue(
    new Error('Navigation in progress')
  );
  expect(await inspectDiscardCandidate(broken as any)).toBeUndefined();
  expect(broken.debugger.detach).toHaveBeenCalledTimes(1);
});
test('does not interfere with an existing debugger', async () => {
  const web = contents();
  web.debugger.attach();
  web.debugger.attach.mockClear();
  expect(await inspectDiscardCandidate(web as any)).toBeUndefined();
  expect(web.debugger.attach).not.toHaveBeenCalled();
  expect(web.debugger.detach).not.toHaveBeenCalled();
});
