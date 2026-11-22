/** @jest-environment node */
import { shell, clipboard, Menu } from 'electron';
import { shellContextMenu, attachPanelContextMenu } from '../main/shellContextMenu';
import { protectWindowNavigation } from '../main/windowNavigation';

jest.mock('electron', () => ({
  app: { isPackaged: true },
  Menu: { buildFromTemplate: jest.fn(() => ({ popup: jest.fn() })) },
  shell: { openExternal: jest.fn().mockResolvedValue(undefined) },
  clipboard: { writeText: jest.fn() },
}));
const contents: any = {
  replaceMisspelling: jest.fn(),
  copyImageAt: jest.fn(),
  inspectElement: jest.fn(),
};
const params: any = {
  x: 12,
  y: 34,
  isEditable: false,
  selectionText: '',
  linkURL: '',
  mediaType: 'none',
  editFlags: {
    canUndo: false,
    canRedo: false,
    canCut: true,
    canCopy: true,
    canPaste: true,
    canSelectAll: true,
  },
};
it('offers native edit actions and capability flags for a clicked input in production', () => {
  const items = shellContextMenu(
    contents,
    { ...params, isEditable: true },
    false
  );
  expect(items.filter((item) => item.role).map((item) => item.role)).toEqual([
    'undo',
    'redo',
    'cut',
    'copy',
    'paste',
    'selectAll',
  ]);
  expect(items[0].enabled).toBe(false);
  expect(items.some((item) => item.label === 'Inspect Element')).toBe(false);
});
it('shows selected-text and image actions without unrelated page commands', () => {
  expect(
    shellContextMenu(
      contents,
      { ...params, selectionText: 'Selected' },
      false
    ).map((item) => item.role)
  ).toEqual(['copy', 'selectAll']);
  const menu = shellContextMenu(
    contents,
    { ...params, mediaType: 'image' },
    false
  );
  (menu[0].click as any)();
  expect(contents.copyImageAt).toHaveBeenCalledWith(12, 34);
  expect(shellContextMenu(contents, params, false)).toEqual([]);
});
it('allows safe links and rejects script/local protocols; inspection remains development-only', () => {
  const openInGroup = jest.fn().mockResolvedValue(undefined);
  // Register the clicked contents with the same navigation owner.
  Object.assign(contents, { on: jest.fn(), setWindowOpenHandler: jest.fn() });
  protectWindowNavigation(contents, 'file:///app/index.html', openInGroup);
  const menu = shellContextMenu(
    contents,
    { ...params, linkURL: 'https://example.com/page' },
    true
  );
  (menu.find((item) => item.label === 'Open link')!.click as any)();
  (menu.find((item) => item.label === 'Copy link')!.click as any)();
  expect(openInGroup).toHaveBeenCalledWith('https://example.com/page');
  expect(shell.openExternal).not.toHaveBeenCalled();
  expect(clipboard.writeText).toHaveBeenCalledWith('https://example.com/page');
  (menu.at(-1)!.click as any)();
  expect(contents.inspectElement).toHaveBeenCalledWith(12, 34);
  // Unsafe scheme fixture verifies that links cannot execute code.
  // eslint-disable-next-line no-script-url
  ['javascript:alert(1)', 'file:///tmp/private'].forEach((linkURL) =>
    expect(shellContextMenu(contents, { ...params, linkURL }, false)).toEqual(
      []
    )
  );
});

it('uses the panel content and rechecks access for link actions', () => {
  let listener: any;
  const panel: any = { ...contents, mainFrame: {}, on: (_event: string, callback: any) => { listener = callback; } };
  let allowed = true;
  const open = jest.fn();
  const output = jest.fn(() => [{label:'Copy JSON'}]);
  attachPanelContextMenu(panel, open, () => allowed, output);
  listener({}, {...params, linkURL:'https://example.com'});
  const menu = (Menu.buildFromTemplate as jest.Mock).mock.calls.at(-1)[0];
  expect(menu.some((item: any) => item.label === 'Copy JSON')).toBe(true);
  allowed = false;
  menu.find((item: any) => item.label === 'Open link').click();
  expect(open).not.toHaveBeenCalled();
  const calls = (Menu.buildFromTemplate as jest.Mock).mock.calls.length;
  listener({}, params);
  expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(calls);
  allowed = true;
  output.mockClear();
  listener({}, {...params, isEditable:true});
  expect(output).not.toHaveBeenCalled();
  expect((Menu.buildFromTemplate as jest.Mock).mock.calls.at(-1)[0].some((item: any) => item.role === 'paste')).toBe(true);
});
