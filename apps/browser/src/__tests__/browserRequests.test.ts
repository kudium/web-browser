import { isBrowserCommand, isBrowserLayout } from '../main/browserRequests';

const layout = {
  apps: [
    {
      id: 'one',
      name: 'One',
      url: 'https://example.com',
      sessionId: 'account',
    },
  ],
  focusedId: 'one',
  visible: [{ id: 'one', x: 0, y: 0, width: 600, height: 400 }],
};
it('validates complete layouts before existing view state can change', () => {
  expect(isBrowserLayout(layout)).toBe(true);
  expect(isBrowserLayout({ apps: [], visible: [] })).toBe(true);
  [
    null,
    {},
    { ...layout, visible: undefined },
    { ...layout, apps: [null] },
    { ...layout, apps: [...layout.apps, layout.apps[0]] },
    { ...layout, apps: [{ ...layout.apps[0], sessionId: {} }] },
    { ...layout, focusedId: 'missing' },
    { ...layout, apps: [{ ...layout.apps[0], sessionName: {} }] },
    { ...layout, apps: [{ ...layout.apps[0], pinned: 'false' }] },
    { ...layout, visible: [{ ...layout.visible[0], width: NaN }] },
    { ...layout, visible: [{ ...layout.visible[0], height: -1 }] },
    { ...layout, visible: [{ ...layout.visible[0], id: 'missing' }] },
    { ...layout, visible: [...layout.visible, layout.visible[0]] },
  ].forEach((value) => expect(isBrowserLayout(value)).toBe(false));
});
it('rejects malformed command fields instead of passing them to native APIs', () => {
  expect(isBrowserCommand({ id: '', action: 'extensions' })).toBe(true);
  expect(isBrowserCommand({ id: 'one', action: 'close-group' })).toBe(true);
  expect(
    isBrowserCommand({
      id: 'one',
      action: 'set-permission',
      permission: 'media',
      choice: 'allow',
    })
  ).toBe(true);
  [
    null,
    {},
    { id: 'one', action: 'unknown' },
    { id: {}, action: 'reload' },
    { id: 'one', action: 'navigate', url: {} },
    { id: 'one', action: 'find', url: 'a'.repeat(65537) },
    { id: 'one', action: 'set-permission', choice: {} },
  ].forEach((value) => expect(isBrowserCommand(value)).toBe(false));
});
