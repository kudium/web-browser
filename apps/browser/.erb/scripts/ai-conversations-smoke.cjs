// Production sidebar, AI IPC and deterministic local provider in a disposable profile.
const {app,BrowserWindow,dialog}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-ai-chats-'));
const out=path.resolve('docs/evidence/ai-conversations');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(root,'profile'));
const build=require('esbuild').buildSync;
build({entryPoints:['src/main/ai.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(root,'ai.cjs')});
build({entryPoints:['src/main/preload.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(root,'preload.cjs')});
fs.writeFileSync(path.join(root,'preview.tsx'),`import React from ${JSON.stringify(require.resolve('react'))};import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};import {Theme} from '@radix-ui/themes';import {AISidebar} from ${JSON.stringify(path.resolve('src/components/UI/AISidebar'))};import ${JSON.stringify(path.resolve('src/renderer/index.css'))};function Preview(){const [theme,setTheme]=React.useState('light');window.setFixtureTheme=setTheme;return <Theme appearance={theme}><main style={{height:'100vh',padding:20}}><AISidebar/></main></Theme>;}createRoot(document.getElementById('root')).render(<Preview/>);`);
build({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.resolve('node_modules')],outfile:path.join(root,'preview.js'),loader:{'.svg':'dataurl','.png':'dataurl','.woff2':'dataurl'}});
fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><link rel="stylesheet" href="preview.css"><div id="root"></div><script src="preview.js"></script>');
const bodies=[];let hold=false;
const provider=http.createServer((req,res)=>{if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'fixture'}]}));let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const body=JSON.parse(raw);if(body.messages[0].content.startsWith('Generate a concise chat title')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({choices:[{message:{role:'assistant',content:body.messages.at(-1).content.includes('Beta')?'Beta investigation':'Alpha investigation'}}]}));}bodies.push(body);if(hold)return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:body.messages.at(-1).content.includes('Beta')?'Beta answer':'Alpha answer'}}]}));});});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await app.whenReady();await new Promise(r=>provider.listen(0,'127.0.0.1',r));const w=new BrowserWindow({width:440,height:640,useContentSize:true,show:true,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true}});
const tabs=[{id:'page',sessionId:'work',name:'Fixture',url:'https://example.com',icon:''}];const dispose=require(path.join(root,'ai.cjs')).registerAI(w,{tabs:()=>tabs,focused:()=>tabs[0].id,contents:()=>undefined});
const run=code=>w.webContents.executeJavaScript(code);const until=async(test)=>{for(let i=0;i<120;i++){if(await test())return;await wait(50);}throw new Error('Fixture timeout');};
await w.loadFile(path.join(root,'index.html'));await wait(200);
await run(`window.electron.ai.settings({endpoint:'http://127.0.0.1:${provider.address().port}/v1',model:'fixture',key:'fixture-only',remember:false})`);
const chatA=(await run('window.electron.ai.conversations()')).selectedId;
await run(`window.electron.ai.run('Alpha task context')`);await until(async()=>!(await run('window.electron.ai.taskStatus()')).busy);
assert((await run('window.electron.ai.conversations()')).conversations[0].title==='Alpha investigation','AI title generated from first request');
const chatB=(await run(`window.electron.ai.conversations({action:'create',draft:'Alpha draft retained'})`)).selectedId;
await run(`window.electron.ai.run('Beta task context')`);await until(async()=>!(await run('window.electron.ai.taskStatus()')).busy);
assert(!JSON.stringify(bodies.at(-1).messages.slice(1)).includes('Alpha'),'new chat does not send previous context');
const a=await run(`window.electron.ai.conversations({action:'select',id:${JSON.stringify(chatA)},draft:'Beta draft retained'})`);assert.equal(a.draft,'Alpha draft retained');assert(!a.history.some(e=>e.text.includes('Beta')));
await run(`window.electron.ai.run('Follow up in original chat')`);await until(async()=>!(await run('window.electron.ai.taskStatus()')).busy);assert(JSON.stringify(bodies.at(-1).messages.slice(1)).includes('Alpha task context'),'followup uses selected history');
hold=true;await run(`window.electron.ai.run('Pause Alpha safely')`);await until(async()=>bodies.at(-1).messages.at(-1).content==='Pause Alpha safely');
assert(await run(`window.electron.ai.conversations({action:'create'}).then(()=>false,e=>e.message.includes('current task'))`),'active task blocks switching');
await run('window.electron.ai.takeOver()');await until(async()=>!(await run('window.electron.ai.taskStatus()')).busy);assert((await run('window.electron.ai.taskStatus()')).resumable,'paused checkpoint retained');
await run(`window.electron.ai.conversations({action:'select',id:${JSON.stringify(chatB)}})`);assert(!(await run('window.electron.ai.taskStatus()')).resumable,'other chat has no checkpoint');
await run(`window.electron.ai.conversations({action:'select',id:${JSON.stringify(chatA)}})`);assert((await run('window.electron.ai.taskStatus()')).resumable,'original paused checkpoint restored');hold=false;
await run('window.electron.ai.resume()');await until(async()=>!(await run('window.electron.ai.taskStatus()')).busy);
await run(`window.electron.ai.conversations({action:'select',id:${JSON.stringify(chatB)}})`);
const checks=[];
const click=label=>run(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click();undefined`);
const input=async(text,label='AI task')=>{await run(`(()=>{const e=document.querySelector(${JSON.stringify(label==='Search chats'?'input[aria-label="Search chats"]':'textarea')});Object.getOwnPropertyDescriptor(${label==='Search chats'?'HTMLInputElement':'HTMLTextAreaElement'}.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(100);};
for(const width of [240,400,600,1200])for(const theme of ['light','dark']){
 w.setContentSize(width+40,640);await w.loadFile(path.join(root,'index.html'));await wait(200);await run(`window.setFixtureTheme('${theme}');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');undefined`);await wait(100);
 for(const scenario of ['closed','open','search','empty','focused','busy']){
  if(scenario==='open') {const r=await run(`(()=>{const r=document.querySelector('[aria-label="Chat history"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);w.webContents.sendInputEvent({type:'mouseDown',x:Math.round(r.x),y:Math.round(r.y),button:'left',clickCount:1});w.webContents.sendInputEvent({type:'mouseUp',x:Math.round(r.x),y:Math.round(r.y),button:'left',clickCount:1});}
  if(scenario==='busy'){hold=true;await run("window.electron.ai.run('Working drawer fixture')");await wait(100);}
  if(scenario==='search')await input('Alpha','Search chats');if(scenario==='empty')await input('No match fixture','Search chats');if(scenario==='focused'){await input('','Search chats');await run('document.querySelector("input[aria-label=\\"Search chats\\"]").focus()');}
  await wait(180);
  const layout=await run(`(()=>{const h=document.querySelector('.ai-sidebar-header'),r=h.getBoundingClientRect(),p=document.querySelector('.ai-chat-history'),b=p?.getBoundingClientRect();return {overflow:h.scrollWidth>h.clientWidth,popup:b?{left:b.left,right:b.right,top:b.top,bottom:b.bottom}:null,width:innerWidth,height:innerHeight}})()`);assert(!layout.overflow);if(scenario==='busy')assert(await run("document.querySelector('[aria-label=\"Start new chat\"]').disabled"));if(scenario!=='closed')assert(layout.popup,'drawer opens');if(layout.popup)assert(layout.popup.left>=0&&layout.popup.right<=layout.width&&layout.popup.bottom<=layout.height,'popup within window');if(layout.popup){const inset=await run(`(()=>{const panel=document.querySelector('.ai-sidebar').getBoundingClientRect(),history=document.querySelector('.ai-chat-history').getBoundingClientRect(),button=document.querySelector('.ai-chat-history-row > button:first-child'),row=button?.getBoundingClientRect(),style=button && getComputedStyle(button);return {drawer:history.left-panel.left,title:row ? row.left+parseFloat(style.paddingLeft)-panel.left : null}})()`);assert(inset.drawer<=2,'history is flush with AI panel edge');assert(inset.title<=18,'chat titles avoid stacked leading padding');}checks.push({width,theme,scenario,...layout});fs.writeFileSync(path.join(out,`${width}-${theme}-${scenario}.png`),(await w.webContents.capturePage()).toPNG());
 }
 if(hold){await run('window.electron.ai.stop()');await until(async()=>!(await run('window.electron.ai.taskStatus()')).busy);hold=false;}
 await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));undefined`);await wait(100);
}
// UI switching retains an unsent draft and its earlier transcript.
await input('Unsent Beta UI draft');await click('Chat history');await wait(100);await click('Start new chat');await wait(180);assert.equal(await run('document.querySelector("textarea").value'),'');
assert(!(await run("!!document.querySelector('.ai-chat-history')")),'new chat closes unpinned history');
const newId=(await run('window.electron.ai.conversations()')).selectedId;
await click('Chat history');await wait(180);await run(`[...document.querySelectorAll('.ai-chat-history-row > button:first-child')].find(e=>e.textContent.includes('Beta')).click();undefined`);await wait(180);assert.equal(await run('document.querySelector("textarea").value'),'Unsent Beta UI draft');assert((await run('window.electron.ai.conversations()')).selectedId===chatB);
assert(!(await run("!!document.querySelector('.ai-chat-history')")),'selection closes unpinned history');
await click('Chat history');await click('Pin chat history');await wait(100);
const rowOrder=await run("[...document.querySelectorAll('.ai-chat-history-row > button:first-child')].map(e=>e.title)");
const activationPoint=await run(`(()=>{const row=[...document.querySelectorAll('.ai-chat-history-row > button:first-child')].find(e=>e.textContent.includes('Alpha')),r=row.getBoundingClientRect();window.chatActivationStarted=performance.now();window.chatActivationElapsed=null;const observer=new MutationObserver(()=>{if(row.getAttribute('aria-pressed')==='true'){window.chatActivationElapsed=performance.now()-window.chatActivationStarted;observer.disconnect();}});observer.observe(row,{attributes:true,attributeFilter:['aria-pressed']});return {x:r.x+20,y:r.y+20}})()`);
w.webContents.sendInputEvent({type:'mouseDown',x:Math.round(activationPoint.x),y:Math.round(activationPoint.y),button:'left',clickCount:1});w.webContents.sendInputEvent({type:'mouseUp',x:Math.round(activationPoint.x),y:Math.round(activationPoint.y),button:'left',clickCount:1});
await until(async()=>await run('window.chatActivationElapsed!==null'));
const activationMs=await run('window.chatActivationElapsed');assert(activationMs<300,`native mouse selection must activate without the old 500ms wait: ${activationMs}ms`);fs.writeFileSync(path.join(out,'selection-latency.json'),JSON.stringify({activationMs,thresholdMs:300},null,2));console.log(`Native mouse chat activation: ${activationMs.toFixed(1)}ms`);

assert(await run("!!document.querySelector('.ai-chat-history')"),'pin preserves history after selection');
assert.deepEqual(await run("[...document.querySelectorAll('.ai-chat-history-row > button:first-child')].map(e=>e.title)"),rowOrder,'selecting a chat preserves visible list order');
assert(await run("document.querySelector('[aria-label=\"Unpin chat history\"]').getAttribute('aria-pressed')==='true'"));
fs.writeFileSync(path.join(out,'600-dark-pinned.png'),(await w.webContents.capturePage()).toPNG());
await click('Unpin chat history');
await run(`[...document.querySelectorAll('.ai-chat-history-row > button:first-child')].find(e=>e.textContent.includes('Beta')).click();undefined`);await wait(180);
assert(!(await run("!!document.querySelector('.ai-chat-history')")),'unpin restores automatic dismissal');
await click('Chat history');await wait(100);
for(const width of [240,600])for(const theme of ['light','dark']) {
 w.setContentSize(width+40,640);await run(`window.setFixtureTheme('${theme}');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');undefined`);await wait(180);
 const r=await run(`(()=>{const r=document.querySelector('.ai-chat-history-row').getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()`);w.webContents.sendInputEvent({type:'mouseMove',x:Math.round(r.x),y:Math.round(r.y)});await wait(100);
 assert(await run("getComputedStyle(document.querySelector('.ai-chat-row-actions')).opacity==='1'"),'row hover reveals actions');
 fs.writeFileSync(path.join(out,`${width}-${theme}-hover.png`),(await w.webContents.capturePage()).toPNG());
}
const renamePoint=await run(`(()=>{const r=document.querySelector('.ai-chat-history-row > button:first-child').getBoundingClientRect();return {x:r.x+25,y:r.y+15}})()`);
for(const clickCount of [1,2]) {w.webContents.sendInputEvent({type:'mouseDown',x:Math.round(renamePoint.x),y:Math.round(renamePoint.y),button:'left',clickCount});w.webContents.sendInputEvent({type:'mouseUp',x:Math.round(renamePoint.x),y:Math.round(renamePoint.y),button:'left',clickCount});await wait(60);}await wait(550);assert(await run("!!document.querySelector('input[aria-label=\"Chat name\"]')"),'double click renames without closing history');
for(const width of [240,600])for(const theme of ['light','dark']) {
 w.setContentSize(width+40,640);await run(`window.setFixtureTheme('${theme}');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');undefined`);await wait(180);
 fs.writeFileSync(path.join(out,`${width}-${theme}-rename.png`),(await w.webContents.capturePage()).toPNG());
}
await run(`(()=>{const e=document.querySelector('input[aria-label="Chat name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Custom investigation');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(100);await click('Save chat name');await wait(180);
assert((await run('window.electron.ai.conversations()')).conversations.some(c=>c.title==='Custom investigation'),'inline rename persists');
assert(await run("!!document.querySelector('.ai-chat-history')"),'renaming keeps history open');
const previousOrder=(await run('window.electron.ai.conversations()')).conversations.map(c=>c.id);
await run(`(()=>{const rows=[...document.querySelectorAll('.ai-chat-history-row')],data=new DataTransfer();rows[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));window.fixtureDrag=data;})()`);await wait(60);
await run(`(()=>{const rows=[...document.querySelectorAll('.ai-chat-history-row')],r=rows.at(-1).getBoundingClientRect();rows.at(-1).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.fixtureDrag,clientY:r.bottom-2}));})()`);await wait(180);
const reordered=(await run('window.electron.ai.conversations()')).conversations.map(c=>c.id);assert.equal(reordered.at(-1),previousOrder[0],'drag moves chat to end');
await click('Close chat history');
const attachment=await run("window.electron.ai.addAttachment('fixture-notes.txt',new Uint8Array([78,111,116,101,115]))");
await run(`window.electron.ai.run({prompt:'Review attached material',attachmentIds:[${JSON.stringify(attachment.id)}],contextReferences:[{kind:'tab',id:'page'}]})`);await until(async()=>!(await run('window.electron.ai.taskStatus()')).busy);
await w.loadFile(path.join(root,'index.html'));await wait(250);
assert(await run("document.querySelector('.ai-message-assets').textContent.includes('fixture-notes.txt')"),'message shows original attachment');
assert(await run("document.querySelector('.ai-message-assets').textContent.includes('Fixture')"),'message shows context');
for(const width of [240,600,1200])for(const theme of ['light','dark']) {
 w.setContentSize(width+40,640);await run(`window.setFixtureTheme('${theme}');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');undefined`);await wait(180);
 fs.writeFileSync(path.join(out,`${width}-${theme}-message-assets.png`),(await w.webContents.capturePage()).toPNG());
}
await run("document.querySelector('.ai-sent-files details').open=true;undefined");
for(const width of [240,600])for(const theme of ['light','dark']) {
 w.setContentSize(width+40,640);await run(`window.setFixtureTheme('${theme}');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');undefined`);await wait(180);
 fs.writeFileSync(path.join(out,`${width}-${theme}-temporary-files-open.png`),(await w.webContents.capturePage()).toPNG());
 await run("document.querySelector('.ai-sent-files').scrollTop=10000;undefined");await wait(80);
 assert(await run("(()=>{const c=document.querySelector('.ai-sent-files').getBoundingClientRect(),b=[...document.querySelectorAll('.ai-sent-files button')].at(-1).getBoundingClientRect();return b.top>=c.top && b.bottom<=c.bottom;})()"),'temporary-file actions reachable by scrolling');
 fs.writeFileSync(path.join(out,`${width}-${theme}-temporary-files-scrolled.png`),(await w.webContents.capturePage()).toPNG());
}
const deletedId=(await run('window.electron.ai.conversations()')).selectedId;
const deleting=run(`window.electron.ai.conversations({action:'delete',id:${JSON.stringify(deletedId)}})`);
await until(async()=>BrowserWindow.getAllWindows().some(win=>win!==w));const modal=BrowserWindow.getAllWindows().find(win=>win!==w);await wait(180);await modal.webContents.executeJavaScript("document.querySelector('#confirm').click();undefined");await deleting;
assert(!(await run('window.electron.ai.conversations()')).conversations.some(c=>c.id===deletedId),'deleting chat removes history');
assert(!(await run('window.electron.ai.savedAttachments()')).some(file=>file.id===attachment.id),'deleting chat removes attachment originals');
assert(await run(`window.electron.ai.saveAttachment(${JSON.stringify(attachment.id)}).then(()=>false,e=>e.message.includes('expired'))`),'deleted attachment original bytes are unavailable');
await click('Chat history');await click('Pin chat history');await wait(120);
await w.loadFile(path.join(root,'index.html'));await wait(250);
assert(await run("!!document.querySelector('.ai-chat-history')"),'open history restores after reload');
assert(await run("!!document.querySelector('[aria-label=\"Unpin chat history\"]')"),'pin restores after reload');
await run("document.querySelector('#ai-tasks-tab').click();undefined");await wait(120);
await w.loadFile(path.join(root,'index.html'));await wait(250);
assert(await run("document.querySelector('#ai-tasks-tab').getAttribute('aria-selected')==='true'"),'selected page restores');
await run("document.querySelector('#ai-assistant-tab').click();undefined");await wait(120);
await run("window.setFixtureTheme('dark');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','600px');undefined");await wait(180);
fs.writeFileSync(path.join(out,'600-dark-restored-pinned.png'),(await w.webContents.capturePage()).toPNG());
await click('Close chat history');await wait(120);await w.loadFile(path.join(root,'index.html'));await wait(250);
assert(!(await run("!!document.querySelector('.ai-chat-history')")),'explicitly closed history stays closed after reload');
await click('Chat history');assert(await run("!!document.querySelector('[aria-label=\"Unpin chat history\"]')"),'pin preference remains after closing');
fs.writeFileSync(path.join(out,'layout-checks.json'),JSON.stringify(checks,null,2));console.log('Native chat/model isolation, draft retention, busy guards, paused recovery switching, pin/unpin dismissal, double-click rename, drag reorder, attachment/context history and deletion cleanup, layout preference restoration, and 48 sidebar layouts passed');dispose();w.destroy();provider.close();app.quit();})().catch(e=>{console.error(e);provider.close();app.exit(1)});
