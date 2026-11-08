// Production AI composer, local provider/site and disposable encrypted storage.
process.on('uncaughtException',error=>{console.error('UNCAUGHT',error,error?.stack);process.exit(1);});
const { app, BrowserWindow, WebContentsView, dialog } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-ai-reference-files-'));
const out = path.resolve('docs/evidence/ai-reference-files'); fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(root, 'profile'));
const build = require('esbuild').buildSync;
const entry = path.join(root, 'entry.ts');
fs.writeFileSync(entry, `export {registerAI, initializeLocalStorage} from ${JSON.stringify(path.resolve('src/main/ai'))};export {passwordVault} from ${JSON.stringify(path.resolve('src/main/passwordManager'))};export {writeOSCredential} from ${JSON.stringify(path.resolve('src/main/passwordManager/authentication'))};`);
build({entryPoints:[entry],bundle:true,minify:true,platform:'node',external:['electron'],outfile:path.join(root,'ai.cjs')});
build({entryPoints:['src/main/preload.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(root,'preload.cjs')});
const groupID=JSON.stringify(['work','default']);
let submittedBody='', origin, tabs, win, view, attachment, mode='answer', step=0, approval=1, bodies=[], reviewDetails=[];
const reply=(res,message)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]}));};
const call=(name,args)=>({role:'assistant',content:null,tool_calls:[{id:'call'+step,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const site=http.createServer((req,res)=>{if(req.method==='POST'){req.on('data',c=>submittedBody+=c);req.on('end',()=>res.end('Application received'));return;}res.setHeader('Content-Type','text/html');res.end('<html><body><h1>Local job application</h1><form onsubmit="window.submitted=true;return false"><label>Resume<input type="file" name="resume" aria-label="Resume"></label><button>Submit application</button></form></body></html>');});
const provider=http.createServer((req,res)=>{if(req.url.endsWith('/models'))return res.end(JSON.stringify({data:[{id:'fixture-model'}]}));let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{const body=JSON.parse(raw);bodies.push(body);step++;
 if(mode==='upload'){
  if(step===1)return reply(res,call('read_page',{tabId:'work-one',format:'detailed'}));
  if(step===2){const observation=JSON.parse(body.messages.filter(m=>m.role==='tool').at(-1).content);const element=observation.elements.find(e=>e.type==='file'||e.tag==='input'&&e.attributes?.type==='file'||e.label==='Resume');assert(element,'File input found '+JSON.stringify(observation));return reply(res,call('upload_chat_attachment',{tabId:'work-one',attachmentId:attachment.id,elementId:element.id,snapshotId:observation.snapshotId}));}
  return reply(res,{role:'assistant',content:'Resume attached. The application has not been submitted.'});
 }
 if(mode==='count'){
  if(step===1)return reply(res,call('list_tabs',{}));
  const observation=body.messages.filter(m=>m.role==='tool').at(-1).content;const pages=observation.startsWith('TOON')?require('@toon-format/toon').decode(observation.split('\n').slice(1).join('\n')):JSON.parse(observation);assert.equal(pages.length,3);return reply(res,{role:'assistant',content:`@work has **${pages.length} tabs**.`});
 }
 reply(res,{role:'assistant',content:'Reviewed the attachment.'});
});});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await app.whenReady();await new Promise(r=>site.listen(0,'127.0.0.1',r));await new Promise(r=>provider.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${site.address().port}`;
 tabs=[1,2,3].map(i=>({id:'work-'+['one','two','three'][i-1],sessionId:'work',sessionName:'Work with a very long group name for clear truncation',sessionSlug:'work',sessionIconEmoji:'💼',name:i===1?'Resume application':'Research page '+i,url:origin+'/'+i,icon:''}));tabs.push({id:'other',sessionId:'other',sessionName:'Other',sessionSlug:'other',name:'Unrelated tab',url:origin+'/other',icon:''});
 const fixture=path.join(root,'preview.tsx');
 fs.writeFileSync(fixture,`import React from ${JSON.stringify(require.resolve('react'))};import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};import {Theme} from '@radix-ui/themes';import {AISidebar} from ${JSON.stringify(path.resolve('src/components/UI/AISidebar'))};import ${JSON.stringify(require.resolve('@radix-ui/themes/styles.css'))};import ${JSON.stringify(path.resolve('src/renderer/index.css'))};localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});function Fixture(){const [theme,setTheme]=React.useState('light');const [request,setRequest]=React.useState();window.fixtureTheme=setTheme;window.fixtureContext=reference=>setRequest({reference,token:Date.now()});return <Theme appearance={theme}><main style={{height:'100vh',padding:24,display:'flex',justifyContent:'center',background:'var(--gray-2)'}}><AISidebar contextRequest={request}/></main></Theme>}createRoot(document.getElementById('root')).render(<Fixture/>);`);
 build({entryPoints:[fixture],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.resolve('node_modules')],outfile:path.join(root,'preview.js'),loader:{'.png':'dataurl','.svg':'dataurl','.woff2':'dataurl'}});
 fs.writeFileSync(path.join(root,'index.html'),'<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
 win=new BrowserWindow({show:false,width:528,height:720,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true}});
 view=new WebContentsView();win.contentView.addChildView(view);view.setBounds({x:0,y:0,width:500,height:350});await view.webContents.loadURL(origin+'/application');view.setVisible(false);
 const module=require(path.join(root,'ai.cjs'));await module.initializeLocalStorage();const credential='disposable-local-test-key';module.writeOSCredential(credential);const vault=module.passwordVault();vault.unlock(credential,true);vault.settings(true,true,true);vault.lock();
 await module.initializeLocalStorage();
 const dispose=module.registerAI(win,{tabs:()=>tabs,focused:()=> 'other',contents:id=>id==='work-one'?view.webContents:undefined});
 await win.loadFile(path.join(root,'index.html'));await wait(250);
 const run=code=>win.webContents.executeJavaScript(code).catch(e=>{console.error('Failed fixture program',code.slice(0,180),String(e),e?.message,e?.stack);throw e;});
 const click=async label=>{await run(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click();undefined`);await wait(140);};
 const input=async text=>{await run(`(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));e.focus();e.setSelectionRange(e.value.length,e.value.length);e.dispatchEvent(new Event('select',{bubbles:true}));})()`);await wait(140);};
 const shot=async name=>{await wait(170);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const settle=async()=>{for(let i=0;i<120;i++){const status=await run('window.electron.ai.taskStatus()');if(!status.busy){await wait(150);return;}await wait(100);}throw Error('AI timeout');};
 dialog.showMessageBox=async(_window,options)=>{reviewDetails.push(options);if(approval===-1)throw Error('Unable to save the file. Try again.');if(approval===-2){await wait(700);return {response:0};}return {response:approval};};
 await run(`window.electron.ai.settings({endpoint:'http://127.0.0.1:${provider.address().port}/v1',key:'fixture-only',model:'fixture-model',remember:false})`);await run("window.electron.ai.permissions('standard')");
 const original=Buffer.from('Local resume\nExperience: engineer\nOriginal upload bytes stay local.');
 const originalPath=path.join(root,'resume.txt');fs.writeFileSync(originalPath,original);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[originalPath]});await click('Attach images or files');attachment={id:await run(`document.querySelector('.ai-attachment[data-attachment-id]').dataset.attachmentId`)};
 for(const theme of ['light','dark'])for(const width of [480,240]){win.setSize(width+48,720);await run(`window.fixtureTheme('${theme}');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');document.querySelector('[aria-label="Save resume.txt to Personal Data"]').focus();undefined`);await shot(`${theme}-${width}-draft-file`);}

 approval=0;assert.equal(await run(`window.electron.ai.saveAttachment('${attachment.id}')`),false);assert.equal(vault.status().items.length,0);
 approval=1;assert(await run(`window.electron.ai.saveAttachment('${attachment.id}')`));assert(vault.status().locked,'Save must not grant secret access');vault.unlock(credential);let saved=vault.records().at(-1);assert.equal(saved.allowAI,false);assert(Buffer.from(saved.document.content,'base64').equals(original));vault.lock();assert(!fs.readFileSync(path.join(app.getPath('userData'),'password-manager','vault.json'),'utf8').includes('Experience: engineer'));
 console.log('Saved private document verified');mode='upload';step=0;const beforeUpload=bodies.length;await input('Upload my attached resume to this application; do not submit it.');await run(`window.fixtureContext({kind:'tab',id:'work-one'});undefined`);await wait(150);await click('Send AI task');await settle();
 const uploadBodies=bodies.slice(beforeUpload);assert(!JSON.stringify(uploadBodies).includes('kudiumbrowser-chat-upload-'),'Temporary paths never reach provider');
 console.log('Upload provider turns',uploadBodies.length);const result=await view.webContents.executeJavaScript(`(async()=>{const file=document.querySelector('input').files[0];return {name:file?.name,bytes:file?[...new Uint8Array(await file.arrayBuffer())]:[],submitted:!!window.submitted}})()`);assert.equal(result.name,'resume.txt');assert(Buffer.from(result.bytes).equals(original));assert.equal(result.submitted,false);assert(reviewDetails.some(r=>r.detail?.includes('resume.txt')&&r.detail?.includes(origin)),'Upload review identifies file and website');
 console.log('Original file readable verified');
 const posted=new Promise(resolve=>view.webContents.once('did-navigate',resolve));
 await view.webContents.executeJavaScript(`document.querySelector('form').onsubmit=null;document.querySelector('form').method='post';document.querySelector('form').enctype='multipart/form-data';document.querySelector('form').action='${origin}/submitted';document.querySelector('form').requestSubmit();undefined`);
 await posted;assert(submittedBody.includes(original.toString('utf8')),'Separate multipart submission can read the selected original');
 assert.equal(fs.readdirSync(path.join(app.getPath('userData'),'ai-upload-cache')).length,0,'Committed navigation releases upload originals');
 // Follow-up retains opaque IDs without re-sending extracted text.
 mode='answer';step=0;await run(`window.electron.ai.run('Can we reuse my resume later?')`);await settle();const follow=bodies.at(-1);assert(JSON.stringify(follow.messages.at(-1)).includes(attachment.id));assert(!JSON.stringify(follow.messages.at(-1)).includes('Experience: engineer'));
 console.log('Follow up verified');mode='count';step=0;await run(`window.electron.ai.run('@work how many tabs do we have there?')`);await settle();assert(bodies.at(-1).messages.flatMap(m=>Array.isArray(m.content)?m.content.map(b=>b.text||''):[m.content]).some(text=>text?.includes('"tabCount":3')));assert(await run(`document.querySelector('.ai-log').textContent.includes('3 tabs')`));
 console.log('Group count verified');
 await run(`window.fixtureFocused=[];window.addEventListener('kudiumbrowser-ai-focus-tab',e=>window.fixtureFocused.push(e.detail));document.querySelector('.ai-log .ai-inline-reference').click();undefined`);await wait(140);
 assert.equal(await run(`document.querySelectorAll('.ai-reference-picker .ai-reference-tab').length`),3);
 await run(`Array.from(document.querySelectorAll('.ai-reference-picker button')).find(b=>b.textContent==='Focus group').click();undefined`);await wait(140);
 assert.deepEqual(await run('window.fixtureFocused'),['work-one']);
 await run(`document.querySelector('.ai-log .ai-inline-reference').click();undefined`);await wait(140);assert(await run(`!!document.querySelector('.ai-reference-picker')`),'Chat references reopen after dismissal');
 await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));undefined`);await wait(100);
 // A sent file stays visible after renderer reconnect and has Save/Forget actions.
 await win.reload();await wait(250);assert(await run(`document.querySelector('.ai-sent-files').textContent.includes('resume.txt')`));
 for(const theme of ['light','dark'])for(const width of [480,240]){
  win.setSize(width+48,720);await run(`window.fixtureTheme('${theme}');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');undefined`);await input('@wo');
  assert.equal(await run(`document.querySelectorAll('.ai-mentions [role="option"]').length`),1,'Groups first, no flood of pages');await shot(`${theme}-${width}-mentions`);
  await run(`document.querySelector('.ai-mentions button').click();undefined`);await wait(150);await input('**Review** @work and this resume.');await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Preview')?.click();undefined`);await wait(120);assert(await run(`!!document.querySelector('.ai-draft-preview strong')`));await shot(`${theme}-${width}-markdown`);
  await run(`document.querySelector('.ai-draft-references .ai-reference-link').click();undefined`);await wait(150);await shot(`${theme}-${width}-group-picker`);
  const bounds=await run(`(()=>{const r=document.querySelector('.ai-reference-picker').getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`);assert(bounds.left>=0&&bounds.right<=bounds.width&&bounds.bottom<=bounds.height,'Picker bounds '+JSON.stringify(bounds));
  await run(`(()=>{const e=document.querySelector('.ai-reference-picker input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Resume');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(120);assert.equal(await run(`document.querySelectorAll('.ai-reference-tab').length`),1);await shot(`${theme}-${width}-tab-search`);
  await run(`document.querySelector('[aria-label="Use Resume application as AI context"]').click();undefined`);await wait(140);assert(await run(`!!document.querySelector('[aria-label="Tab: Resume application"]')`),'Selecting a tab narrows group context');
  await input('');await run(`document.querySelector('[aria-label="Remove Resume application context"]').click();undefined`);await wait(100);
  const layout=await run(`(()=>{const composer=document.querySelector('.ai-composer').getBoundingClientRect();const send=document.querySelector('[aria-label="Send AI task"]').getBoundingClientRect();return {left:composer.left,right:composer.right,bottom:send.bottom,width:innerWidth,height:innerHeight}})()`);assert(layout.left>=0&&layout.right<=layout.width&&layout.bottom<=layout.height,'Footer reachable');
 }
 for(const theme of ['light','dark'])for(const width of [480,240]){
  win.setSize(width+48,720);await run(`window.fixtureTheme('${theme}');document.querySelector('.ai-sidebar').style.setProperty('--ai-sidebar-width','${width}px');document.querySelector('.ai-sent-files details').open=true;undefined`);await wait(100);
  approval=-2;await run(`document.querySelector('.ai-sent-files button[title="Save to Personal Data"]').click();undefined`);await wait(150);assert(await run(`document.querySelector('.ai-sent-files button[title="Save to Personal Data"]').disabled`));await shot(`${theme}-${width}-saving`);await wait(750);
  approval=-1;await run(`document.querySelector('.ai-sent-files button[title="Save to Personal Data"]').click();undefined`);await wait(160);assert(await run(`document.querySelector('.ai-error').textContent.includes('Unable to save')`));await shot(`${theme}-${width}-save-error`);
 }
 approval=1;
 // Menu-equivalent context requests allow multiple references and keep access unchanged.
 await run(`window.fixtureContext({kind:'tab',id:'work-one'});undefined`);await wait(150);await run(`window.fixtureContext({kind:'tab',id:'other'});undefined`);await wait(150);assert.equal(await run(`document.querySelectorAll('.ai-context-attachment').length`),2);assert.equal((await run('window.electron.ai.groups()')).groupId,null);
 await run(`window.electron.ai.removeAttachment('${attachment.id}')`);await assert.rejects(()=>run(`window.electron.ai.saveAttachment('${attachment.id}')`),/expired/);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({verified:['original bytes uploaded with website review','upload does not submit application','separate multipart submission reads original and navigation releases cache','encrypted Personal Data save without secret grant','private save and cancellation','follow-up opaque catalog','exact group count and filtered tab list','multiple context requests','Markdown and group/tab search','light/dark at 480/240 sidebar widths'],nativeApprovalStubbed:true},null,2));
 console.log('PASS: AI references, retained originals, approved upload, encrypted save and rendered composer. Evidence: '+out);dispose();win.destroy();site.close();provider.close();fs.rmSync(root,{recursive:true,force:true});app.exit(0);
})().catch(error=>{console.error(error, String(error), error?.stack);site.close();provider.close();fs.rmSync(root,{recursive:true,force:true});app.exit(1);});
