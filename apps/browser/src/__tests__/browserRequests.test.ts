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
  expect(isBrowserLayout({ ...layout, sidebarHidden: true })).toBe(true);
  expect(isBrowserLayout({ ...layout, sidebarHidden: 'yes' })).toBe(false);
  expect(isBrowserLayout({ ...layout, suspended: true, sidebarSuspended: false, sidebarOverlay: true })).toBe(true);
  expect(isBrowserLayout({ ...layout, sidebarOverlay: 'yes' })).toBe(false);
  expect(isBrowserLayout({ ...layout, sidebarOverlay: true, sidebarOverlayToken: 7 })).toBe(true);
  for (const sidebarOverlayToken of [-1, Infinity, '7', 1.2]) expect(isBrowserLayout({ ...layout, sidebarOverlayToken })).toBe(false);
  expect(isBrowserLayout({ apps: [], visible: [] })).toBe(true);
  [
    null,
    {},
    { ...layout, visible: undefined },
    { ...layout, sidebarSuspended: 'false' },
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
  expect(isBrowserCommand({ id: '', action: 'focus-chrome' })).toBe(true);
  expect(isBrowserCommand({ id: 'one', action: 'close-group' })).toBe(true);
  expect(isBrowserCommand({ id: 'one', action: 'unload-other-groups' })).toBe(true);
  expect(isBrowserCommand({ id: 'one', action: 'unload-space-groups' })).toBe(true);
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

it('validates bounded geometry updates without accepting tab metadata or duplicate slots', () => {
  const geometry = { geometryOnly: true, apps: [], visible: layout.visible };
  expect(isBrowserLayout(geometry)).toBe(true);
  expect(isBrowserLayout({ ...geometry, geometryOnly: 'true' })).toBe(false);
  expect(isBrowserLayout({ ...geometry, apps: layout.apps })).toBe(false);
  expect(isBrowserLayout({ ...geometry, focusedId: 'one' })).toBe(false);
  expect(isBrowserLayout({ ...geometry, visible: [...layout.visible, ...layout.visible] })).toBe(false);
  expect(isBrowserLayout({ ...geometry, visible: [{ ...layout.visible[0], width: Infinity }] })).toBe(false);
});

it('rejects non-boolean live inspector resize flags', () => {
  const request = { id:'one', action:'page-devtools-resize', devToolsFraction:.5, devToolsLive:true };
  expect(isBrowserCommand(request)).toBe(true);
  expect(isBrowserCommand({ ...request, devToolsLive:'true' })).toBe(false);
});


it.each(['nativeOverlayToken','panelOverlayToken'])('validates the %s readiness generation', field => {
  expect(isBrowserLayout({...layout,[field]:7})).toBe(true);
  for (const token of [-1,NaN,Infinity,1.5,'7',{},Number.MAX_SAFE_INTEGER+1])
    expect(isBrowserLayout({...layout,[field]:token})).toBe(false);
});
