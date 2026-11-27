import {
  Menu,
  MenuItem,
  clipboard,
  ContextMenuParams,
  WebContents,
  BrowserWindow,
} from 'electron';
import { showBrowserContextMenu, fillFormMenu } from '../main/browserContextMenu';

jest.mock('electron', () => ({
  clipboard: { writeText: jest.fn() },
  Menu: { buildFromTemplate: jest.fn(() => ({ popup: jest.fn() })) },
}));
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({
    searchEngine: 'custom',
    searchEngines: [
      { id: 'custom', name: 'Custom', url: 'https://search.example/?q=%s' },
    ],
  }),
}));

const openTab = jest.fn();
const owner = { isDestroyed: () => false, webContents: { send: jest.fn() } };
const contents = {
  getURL: () => 'https://example.com/page',
  focus: jest.fn(),
  copy: jest.fn(),
  paste: jest.fn(),
  inspectElement: jest.fn(),
  navigationHistory: { canGoBack: () => false, canGoForward: () => true },
} as unknown as WebContents;
const pictureInPicture = jest.fn();
function menu(patch: Partial<ContextMenuParams> = {}, hookActions: any[] = [], addSelection?: (kind: 'note' | 'today' | 'append', text: string) => void, appendKind?: 'note'|'todo') {
  showBrowserContextMenu(
    owner as unknown as BrowserWindow,
    contents,
    {
      mediaType: 'none',
      selectionText: '',
      linkURL: '',
      isEditable: false,
      ...patch,
    } as ContextMenuParams,
    openTab,
    [{ label: 'Extension Action' } as MenuItem],
    pictureInPicture,
    hookActions,
    undefined,
    addSelection,
    appendKind
  );
  return (Menu.buildFromTemplate as jest.Mock).mock.calls.at(-1)[0];
}

beforeEach(() => jest.clearAllMocks());

test('clean-link action copies the clicked link without changing its destination', () => {
  const url = 'https://example.com/path?item=42&utm_source=mail';
  const items = menu({ linkURL: url });
  items.find((entry: any) => entry.label === 'Copy Clean Link').click();
  expect(clipboard.writeText).toHaveBeenLastCalledWith('https://example.com/path?item=42');
  items.find((entry: any) => entry.label === 'Open Link in New Tab').click();
  expect(openTab).toHaveBeenLastCalledWith(url);
});

test('page menu includes navigation, saving, printing, extensions and inspection', () => {
  const items = menu({ x: 12, y: 34 });
  expect(items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Back', enabled: false }),
      expect.objectContaining({ label: 'Forward', enabled: true }),
      expect.objectContaining({ label: 'Save Page As…' }),
      expect.objectContaining({ label: 'Print…' }),
      expect.objectContaining({ label: 'Extension Action' }),
    ])
  );
  items.find((entry: any) => entry.label === 'Inspect').click();
  expect(contents.inspectElement).toHaveBeenCalledWith(12, 34);
});

test('link menu opens a tab and copies the target address', () => {
  const items = menu({ linkURL: 'https://example.com/path' });
  items.find((entry: any) => entry.label === 'Open Link in New Tab').click();
  expect(openTab).toHaveBeenCalledWith('https://example.com/path');
  items.find((entry: any) => entry.label === 'Open Link in New Group').click();
  expect(openTab).toHaveBeenLastCalledWith('https://example.com/path', true);
  items.find((entry: any) => entry.label === 'Copy Link Address').click();
  expect(clipboard.writeText).toHaveBeenCalledWith('https://example.com/path');
  expect(menu({ linkURL: 'file:///tmp/example' })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: 'Open Link in New Tab',
        enabled: false,
      }),
    ])
  );
});

test('selection searches with the configured engine and encodes the text', () => {
  const items = menu({ selectionText: 'a & b' });
  items
    .find((entry: any) => entry.label === 'Search With')
    .submenu.find((entry: any) => entry.label === 'Custom')
    .click();
  expect(openTab).toHaveBeenCalledWith('https://search.example/?q=a%20%26%20b');
});

test('editing targets the clicked contents and honors native edit flags', () => {
  const items = menu({
    isEditable: true,
    editFlags: {
      canPaste: true,
      canCopy: false,
    } as ContextMenuParams['editFlags'],
  });
  expect(items.find((entry: any) => entry.label === 'Copy').enabled).toBe(
    false
  );
  items.find((entry: any) => entry.label === 'Paste').click();
  expect(contents.paste).toHaveBeenCalled();
  expect(contents.focus).toHaveBeenCalled();
});

test.each(['image', 'video', 'audio'] as const)(
  '%s URL offers both shared and isolated opening',
  (mediaType) => {
    const srcURL = `https://example.com/file.${mediaType}`;
    const items = menu({ mediaType, srcURL });
    const shared = items.find(
      (entry: any) =>
        entry.label ===
        `Open ${mediaType[0].toUpperCase()}${mediaType.slice(1)} in New Tab`
    );
    const isolated = items.find(
      (entry: any) =>
        entry.label ===
        `Open ${mediaType[0].toUpperCase()}${mediaType.slice(1)} in New Group`
    );
    expect(shared.enabled).toBe(true);
    expect(isolated.enabled).toBe(true);
    shared.click();
    expect(openTab).toHaveBeenLastCalledWith(srcURL);
    isolated.click();
    expect(openTab).toHaveBeenLastCalledWith(srcURL, true);
  }
);

test('linked images retain separate opening pairs for link and image targets', () => {
  const items = menu({
    mediaType: 'image',
    srcURL: 'https://example.com/image.png',
    linkURL: 'https://example.com/article',
  });
  items.find((entry: any) => entry.label === 'Open Image in New Group').click();
  expect(openTab).toHaveBeenLastCalledWith(
    'https://example.com/image.png',
    true
  );
  items.find((entry: any) => entry.label === 'Open Link in New Group').click();
  expect(openTab).toHaveBeenLastCalledWith('https://example.com/article', true);
});

test('both opening actions reject unsupported media URLs', () => {
  const items = menu({ mediaType: 'image', srcURL: 'file:///tmp/image.png' });
  expect(
    items.find((entry: any) => entry.label === 'Open Image in New Tab').enabled
  ).toBe(false);
  expect(
    items.find((entry: any) => entry.label === 'Open Image in New Group')
      .enabled
  ).toBe(false);
});

it('includes native macOS sharing and Services with selected text', () => {
  if (process.platform !== 'darwin') return;
  const items = menu({ selectionText: 'Selected words' });
  const share = items.find((item: any) => item.role === 'shareMenu');
  expect(share.sharingItem).toEqual({
    texts: ['Selected words'],
    urls: undefined,
  });
  expect(items.some((item: any) => item.role === 'services')).toBe(true);
});

it('offers native PiP for supported video, including streams without source URLs', () => {
  const items = menu({
    mediaType: 'video',
    mediaFlags: {
      canShowPictureInPicture: true,
    } as ContextMenuParams['mediaFlags'],
  });
  items.find((item: any) => item.label === 'Picture in Picture').click();
  expect(pictureInPicture).toHaveBeenCalledTimes(1);
  expect(
    menu({
      mediaType: 'video',
      mediaFlags: {
        canShowPictureInPicture: false,
      } as ContextMenuParams['mediaFlags'],
    }).some((item: any) => item.label === 'Picture in Picture')
  ).toBe(false);
  expect(
    menu({ mediaType: 'audio' }).some(
      (item: any) => item.label === 'Picture in Picture'
    )
  ).toBe(false);
  expect(
    menu({
      mediaType: 'video',
      mediaFlags: {
        isShowingPictureInPicture: true,
      } as ContextMenuParams['mediaFlags'],
    }).some((item: any) => item.label === 'Exit Picture in Picture')
  ).toBe(true);
});

test('puts built-in AI first and prefills the owning window without opening a search tab', () => {
  const items = menu({ selectionText: '  selected text  ' });
  const submenu = items.find(
    (entry: any) => entry.label === 'Search With'
  ).submenu;
  expect(submenu[0]).toEqual(
    expect.objectContaining({ label: 'Kudium AI', enabled: true })
  );
  submenu[0].click();
  expect(owner.webContents.send).toHaveBeenCalledWith(
    'browser-ai-selection',
    'selected text'
  );
  expect(openTab).not.toHaveBeenCalled();
});


test('page menu separates navigation and save actions from inspection tools', () => {
  const items = menu();
  const separators = items.flatMap((entry: any, index: number) => entry.type === 'separator' ? [index] : []);
  expect(separators).toHaveLength(2);
  expect(items[separators[0] - 1].label).toBe('Reload');
  expect(items[separators[1] + 1].label).toBe('Inspect');
});

test('Fill form puts an editable AI request first and preserves multiple login accounts', () => {
  const draft = jest.fn();
  const accounts = [{ label: 'Personal', click: jest.fn() }, { label: 'Business', click: jest.fn() }];
  const login = { label: 'Auto login', submenu: accounts };
  const item = fillFormMenu([login], draft);
  expect(item.label).toBe('Form');
  const options = item.submenu as any[];
  expect(options.map(option => option.label)).toEqual(['Fill with AI', 'Auto login']);
  expect(options[1]).toBe(login);
  options[0].click();
  expect(draft).toHaveBeenCalledTimes(1);
  expect(accounts[0].click).not.toHaveBeenCalled();
});

test('Form keeps personal-data fallback actions together before saved login accounts', () => {
  const pick = { label: 'Choose saved value…', click: jest.fn() };
  const save = { label: 'Save this value…', click: jest.fn() };
  const fill = { label: 'Autofill form', click: jest.fn() };
  const menu = fillFormMenu([{ label: 'Auto login' }], jest.fn(), [pick, save, fill]);
  const entries = menu.submenu as any[];
  expect(entries.map(entry => entry.label)).toEqual(['Fill with AI', 'Choose saved value…', 'Save this value…', 'Autofill form', 'Auto login']);
  entries[1].click(); entries[2].click(); entries[3].click();
  expect(pick.click).toHaveBeenCalledTimes(1);
  expect(save.click).toHaveBeenCalledTimes(1);
  expect(fill.click).toHaveBeenCalledTimes(1);
});

 test('selection places lookup and search with Form, then Copy in the save group', () => {
  const items = menu({selectionText:'selected text'}, [{label:'Form',submenu:[]},{label:'Translate to English'}]);
  const labels = items.map((item: any) => item.label || item.type);
  const search = labels.indexOf('Search With');
  expect(labels[0]).toBe('Form');
  expect(labels.slice(0, search + 1)).not.toContain('separator');
  expect(labels[search + 1]).toBe('separator');
  expect(labels[search + 2]).toBe('Copy');
  const translate = labels.indexOf('Translate to English');
  expect(labels.slice(search + 2, translate + 1)).not.toContain('separator');
  expect(labels[labels.indexOf('Inspect') - 1]).toBe('separator');
});

test('Add to appears directly under Form only for highlighted page text', () => {
  const add=jest.fn();
  const items=menu({selectionText:'  Remember this  '},[{label:'Form',submenu:[]}],add);
  expect(items[1].label).toBe('Add to');
  items[1].submenu[0].click();items[1].submenu[1].click();
  expect(add).toHaveBeenNthCalledWith(1,'note','Remember this');
  expect(add).toHaveBeenNthCalledWith(2,'today','Remember this');
  expect(menu({},[],add).some((item: any)=>item.label==='Add to')).toBe(false);
});

 test('Add to saves link destinations with selected text and supports links alone', () => {
  const add = jest.fn();
  const url = 'https://example.com/review?id=42';
  menu({selectionText:'Review this',linkURL:url},[],add).find((item:any)=>item.label==='Add to').submenu[1].click();
  expect(add).toHaveBeenLastCalledWith('today',`Review this\n${url}`);
  menu({linkURL:url},[],add).find((item:any)=>item.label==='Add to').submenu[1].click();
  expect(add).toHaveBeenLastCalledWith('today',url);
  expect(menu({linkURL:'javascript:alert(1)'},[],add).some((item:any)=>item.label==='Add to')).toBe(false);
  expect(menu({selectionText:'x',isEditable:true,editFlags:{} as ContextMenuParams['editFlags']},[],add).some((item:any)=>item.label==='Add to')).toBe(false);
 });

test('long selections remain available for Today and current editors offer contextual append', () => {
  const add=jest.fn();
  const entries=menu({selectionText:'word '.repeat(180)},[],add,'note').find((item:any)=>item.label==='Add to').submenu;
  expect(entries[1].enabled).toBe(true);
  expect(entries[2].label).toBe('Append to current note');
  entries[2].click();expect(add).toHaveBeenLastCalledWith('append',expect.any(String));
  expect(menu({selectionText:'Text'},[],add,'todo').find((item:any)=>item.label==='Add to').submenu[2].label).toBe('Append to current to-do list');
});
