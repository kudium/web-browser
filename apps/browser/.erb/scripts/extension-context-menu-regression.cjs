const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {patchSource,patchPreload}=require('./patch-extension-context-menus.cjs');
const entry=require.resolve('electron-chrome-extensions');
const source=fs.readFileSync(process.argv.includes('--esm')?entry.replace('cjs/index.js','esm/index.mjs'):entry,'utf8');
assert.equal(patchSource(source),source);assert.throws(()=>patchSource('unexpected dependency'),/dependency review/);
const preload=fs.readFileSync(entry.replace('cjs/index.js','chrome-extension-api.preload.js'),'utf8');assert.equal(patchPreload(preload),preload);assert(!preload.includes('"contextMenus.update", { noop: true }'));
class Menu{constructor(){this.items=[];}append(item){this.items.push(item);}}
class MenuItem{constructor(options){Object.assign(this,{type:'normal',checked:false},options);}}
const context=vm.createContext({import_electron5:{Menu,MenuItem},Menu2:Menu,MenuItem2:MenuItem,getIconImage:()=>undefined,console});
vm.runInContext(source.slice(source.indexOf('var escapePattern ='),source.indexOf('var matchesTitlePattern =')),context);
vm.runInContext(source.slice(source.indexOf('var DEFAULT_CONTEXTS ='),source.indexOf('// src/browser/api/runtime.ts',source.indexOf('var DEFAULT_CONTEXTS ='))),context);
const extension={id:'a'.repeat(32),name:'Muse fixture',manifest:{permissions:['contextMenus']}},second={...extension,id:'b'.repeat(32)};
const extensions=new EventEmitter();extensions.getExtension=id=>[extension,second].find(item=>item.id===id);
const profile={extensions},handlers=new Map(),events=[],gestures=[];
const tab={id:10,session:profile,isDestroyed:()=>false,getURL:()=> 'https://example.com/page'},cache=new Map([[10,{id:10,windowId:3}]]);
const ctx={session:profile,emit:(...args)=>gestures.push(args),store:{tabDetailsCache:cache,getActiveTabOfCurrentWindow:()=>tab},router:{apiHandler:()=> (name,callback,options)=>handlers.set(name,{callback,options}),sendEvent:(...args)=>events.push(args)}};
const api=new context.ContextMenusAPI(ctx),event={extension},params={pageURL:tab.getURL(),mediaType:'none',selectionText:'',isEditable:false};
for(const name of ['create','update','remove','removeAll'])assert.equal(handlers.get('contextMenus.'+name).options.permission,'contextMenus');
api.create(event,{id:'askMuse',title:'Ask Muse',contexts:['page'],documentUrlPatterns:['https://*/*'],visible:false});assert.equal(api.buildMenuItemsForParams(tab,params).length,0);
api.update(event,'askMuse',{title:'Ask Muse about this page',visible:true});let items=api.buildMenuItemsForParams(tab,params);assert.equal(items[0].label,'Ask Muse about this page');items[0].click(items[0]);assert.equal(events.at(-1)[2].menuItemId,'askMuse');assert.equal(events.at(-1)[3].id,10);assert.equal(gestures.at(-1)[0],'context-menu-clicked');
api.update(event,'askMuse',{enabled:false});items[0].click(items[0]);assert.equal(events.length,1);api.update(event,'askMuse',{visible:false});assert.equal(api.buildMenuItemsForParams(tab,params).length,0);
api.create(event,{id:'toggle',type:'checkbox',title:'Use browser',contexts:['action'],checked:true});items=api.buildMenuItemsForExtension(extension.id,'browser_action');assert.equal(items[0].checked,true);items[0].checked=false;items[0].click(items[0]);assert.equal(events.at(-1)[2].checked,false);assert.equal(events.at(-1)[2].wasChecked,true);
api.removeAll(event);api.create(event,{id:0,title:'Parent',contexts:['selection']});api.create(event,{id:'child',parentId:0,title:'Search %s',contexts:['selection']});api.create({extension:second},{id:0,title:'Other',contexts:['selection']});api.create({extension:second},{id:'child',parentId:0,title:'Other child',contexts:['selection']});items=api.buildMenuItemsForParams(tab,{...params,selectionText:'selected text'});assert.equal(items.length,2);assert.equal(items[0].submenu.items[0].label,'Search selected text');assert.equal(items[1].submenu.items[0].label,'Other child');items[0].submenu.items[0].click(items[0].submenu.items[0]);assert.equal(events.at(-1)[2].parentMenuItemId,0);
assert.throws(()=>api.update(event,0,{parentId:'child'}),/cycle/);assert.throws(()=>api.update(event,'missing',{visible:true}),/Unknown/);assert.throws(()=>api.create(event,{id:0,title:'Duplicate'}),/Duplicate/);api.remove(event,0);assert(!api.menus.has(extension.id));assert(api.menus.has(second.id));assert.equal(api.buildMenuItemsForParams({...tab,session:{}},params).length,0);
api.create(event,{id:'r1',type:'radio',title:'One',checked:true});api.create(event,{id:'r2',type:'radio',title:'Two'});api.onClicked(extension.id,'r2',tab,params,true);assert.equal(api.menus.get(extension.id).get('r1').checked,false);cache.delete(tab.id);api.onClicked(extension.id,'r2',tab,params,true);assert.equal(events.at(-1)[3],undefined);extensions.emit('extension-unloaded',{},extension);assert(!api.menus.has(extension.id));
console.log('PASS installed context menus: visibility/update, toolbar action, checked events, namespaced trees, selection/tab payload, native gesture, cleanup and profile isolation ('+(process.argv.includes('--esm')?'ESM':'CJS')+').');
