/** @jest-environment node */
import {ipcMain} from 'electron';
import {browserActivity,registerActivity} from '../main/activity';
import {showAppToast,dismissAppToast} from '../main/appToast';
let mockEnabled=true;
let mockLocked=false;
let mockPreferenceChange:()=>void;
let mockLockChange:()=>void;
const mockContents={mainFrame:{},send:jest.fn(),once:jest.fn(),isDestroyed:()=>false};
const mockOwner={webContents:mockContents,isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false,isFocused:()=>true};
jest.mock('electron',()=>({app:{getPath:()=>'/tmp'},ipcMain:{handle:jest.fn()},BrowserWindow:{getAllWindows:()=>[mockOwner]},Notification:{isSupported:()=>false}}));
jest.mock('fs',()=>({existsSync:()=>false,writeFileSync:jest.fn(),renameSync:jest.fn(),unlinkSync:jest.fn()}));
jest.mock('../main/localStorage',()=>({safeStorage:{encryptString:(value:string)=>Buffer.from(value)}}));
jest.mock('../main/preferences',()=>({getBrowserPreferences:()=>({activityToasts:mockEnabled}),onBrowserPreferencesChanged:(listener:()=>void)=>{mockPreferenceChange=listener}}));
jest.mock('../main/groupLocks',()=>({getGroupLocks:()=>({locked:()=>mockLocked,subscribe:(listener:()=>void)=>{mockLockChange=listener}})}));
jest.mock('../main/appToast',()=>({showAppToast:jest.fn(async()=>{}),dismissAppToast:jest.fn()}));
jest.mock('../main/activitySound',()=>({playActivitySound:jest.fn()}));
jest.mock('../main/siteSettings',()=>({getSiteSettings:jest.fn(),updateSiteSettings:jest.fn()}));
jest.mock('../main/globalHooks',()=>({getGlobalHooks:jest.fn(),saveGlobalHooks:jest.fn(),globalHookHash:jest.fn()}));
beforeAll(()=>{
  registerActivity(()=>true);
  const handler=(ipcMain.handle as jest.Mock).mock.calls.find(([channel])=>channel==='browser-activity')[1];
  handler({sender:mockContents,senderFrame:mockContents.mainFrame},{action:'list'});
});
beforeEach(()=>{
  mockEnabled=true;mockLocked=false;
  browserActivity().delete(browserActivity().list().map(entry=>entry.id));
  jest.clearAllMocks();
});
const create=(destination={})=>browserActivity().create({title:'Ready',message:'Review changes',...destination},{source:'hook',groupId:'group'});
const toast=()=> (showAppToast as jest.Mock).mock.calls.at(-1)[1];
it('is opt-in and skips read or locked activities',()=>{
  mockEnabled=false;create();expect(showAppToast).not.toHaveBeenCalled();
  mockEnabled=true;mockLocked=true;create();expect(showAppToast).not.toHaveBeenCalled();
  mockLocked=false;browserActivity().create({title:'Read'},{source:'ai'},true);expect(showAppToast).not.toHaveBeenCalled();
});
it('marks explicit dismissal read and broadcasts the update',()=>{
  const entry=create();const shown=toast();
  expect(shown.action).toBeUndefined();
  expect(browserActivity().list()[0].asRead).toBe(false);
  shown.onDismiss();
  expect(browserActivity().list()[0].asRead).toBe(true);
  expect(dismissAppToast).toHaveBeenCalledWith('activity-'+entry.id);
  expect(mockContents.send).toHaveBeenCalledWith('browser-activity-changed');
});
it.each([{noteId:'note-one'}, {url:'https://example.com/ready'}])('routes the existing destination and marks read %#',destination=>{
  const entry=create(destination);
  const shown=toast();
  expect(shown.action.label).toBe('noteId' in destination?'Open note':'Open page');
  shown.action.run();
  expect(browserActivity().list()[0].asRead).toBe(true);
  expect(mockContents.send).toHaveBeenCalledWith('browser-activity-action',expect.objectContaining({id:entry.id,...destination}));
});
it('syncs external reads/deletions and removes disabled or locked toasts without reading them',()=>{
  const first=create();browserActivity().read(first.id);
  expect(dismissAppToast).toHaveBeenCalledWith('activity-'+first.id);
  const deleted=create();browserActivity().delete(deleted.id);
  expect(dismissAppToast).toHaveBeenCalledWith('activity-'+deleted.id);
  const pending=create({url:'https://example.com'});const shown=toast();
  mockLocked=true;mockLockChange();shown.action.run();shown.onDismiss();
  expect(browserActivity().list().find(entry=>entry.id===pending.id)?.asRead).toBe(false);
  expect(mockContents.send).not.toHaveBeenCalledWith('browser-activity-action',expect.anything());
  mockLocked=false;const disabled=create();mockEnabled=false;mockPreferenceChange();
  expect(dismissAppToast).toHaveBeenCalledWith('activity-'+disabled.id);
  expect(browserActivity().list().find(entry=>entry.id===disabled.id)?.asRead).toBe(false);
});
