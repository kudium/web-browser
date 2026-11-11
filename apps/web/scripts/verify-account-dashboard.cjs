// Run with apps/browser/node_modules/.bin/electron apps/web/scripts/verify-account-dashboard.cjs.
// Fictional records exercise production markup, styles and interactions without a server.
const {app,BrowserWindow}=require('electron');const fs=require('fs'),assert=require('assert'),path=require('path'),os=require('os');
const {execFileSync}=require('child_process');
const base=path.resolve(__dirname,'..');
const output=process.env.DASHBOARD_PREVIEW_DIR || fs.mkdtempSync(path.join(os.tmpdir(),'kudium-dashboard-'));
fs.mkdirSync(output,{recursive:true});
app.whenReady().then(async()=>{
const win=new BrowserWindow({width:1440,height:1120,show:false,webPreferences:{backgroundThrottling:false}});
let html=execFileSync('bun',['-e',`import {accountPage} from './src/pages'; process.stdout.write(accountPage('Alex Morgan','alex@example.com',{usedBytes:1048576,recordCount:3,quotas:{bytes:67108864}}));`],{cwd:base,encoding:'utf8'}).replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,'');
const css=fs.readFileSync(base+'/public/site.css','utf8');
html=html.replace('</head>',`<style>${css}</style></head>`);
html=html.replace('src="/assets/product/origin-logo.png"',`src="data:image/png;base64,${fs.readFileSync(base+'/public/product/origin-logo.png').toString('base64')}"`);
await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
const js=async code=>{
  const result=await win.webContents.executeJavaScript(`(()=>{try{return eval(${JSON.stringify(code)});}catch(error){return {fixtureError:error.stack};}})()`);
  if(result?.fixtureError)throw new Error(result.fixtureError+'\nFixture script: '+code);
  return result;
};
const settle=()=>new Promise(r=>setTimeout(r,100));
await js(`window.demoRecords=[{id:'notes_studio',revision:1,category:'notes',value:{version:1,deviceId:'device_studio',createdAt:1794384000000,items:[{id:'note',title:'A calmer morning',notes:'A little space to think before the day begins.\\n\\n• Read for twenty minutes\\n• Capture one idea worth exploring\\n• Make room for a walk\\n\\nThe best days begin with a clear head, not a longer to-do list.',sensitive:false},{id:'note2',title:'Studio — November ideas',notes:'A place for the small ideas that might become something.\\n\\nWarm materials. Quiet typography. More space between things.\\n\\nStart with what people need, and let the design follow.',sensitive:false},{id:'note3',title:'Weekend in Copenhagen',notes:'Coffee at the corner bakery. A walk by the harbor.\\n\\nKeep Saturday open for whatever we find.',sensitive:true},{id:'note4',title:'Reading list',notes:'The Creative Act\\nA Pattern Language\\nWays of Seeing',sensitive:false}]}},{id:'device_studio',revision:2,category:'workspace',value:{version:1,deviceId:'device_studio',createdAt:1794384000000,workspace:{spaces:[{id:'studio',name:'Studio'}],apps:[{id:'tab',spaceId:'studio',sessionId:'research',name:'Design references',homeUrl:'https://www.figma.com',sessionName:'Design studio'},{id:'tab2',spaceId:'studio',sessionId:'research',name:'Project notes',homeUrl:'https://www.notion.so',sessionName:'Design studio'},{id:'tab3',spaceId:'studio',sessionId:'reading',name:'Reading room',homeUrl:'https://www.are.na',sessionName:'Inspiration'}],developer:[{spaceId:'studio',sessionId:'research',origin:'https://www.figma.com',config:{enabled:true,css:'body { font-family: system-ui; }',hooks:[{id:'hook',name:'Quiet workspace',css:'.promotion-banner { display: none; }',after:'// Keep the page focused\\nconsole.log("Workspace ready");',enabled:true}]}}]}}}];window.demoWrites=[];window.failSave=false;window.fetch=async(url,options={})=>{if(options.method==='PATCH'){if(window.failSave)return {ok:false,status:409,json:async()=>({})};const body=JSON.parse(options.body);window.demoWrites.push(body);return {ok:true,json:async()=>({revision:body.revision+1})};}return {ok:true,json:async()=>({records:window.demoRecords})};};void 0;`);
await js(fs.readFileSync(base+'/public/account-data.js','utf8'));await settle();
await js(`document.querySelector('[data-account-sessions]').innerHTML='<div class="account-session"><div class="account-session-icon">▣</div><div class="account-session-info"><div class="account-session-title">Mac<span class="account-current-device">This device</span></div><p class="account-session-meta">Kudium Browser · Connected today</p></div><div class="account-session-actions"><button class="account-button">Sign out</button></div></div>';document.querySelector('[data-account-session-count]').textContent='1 session';`);
// The site header and workspace share their left and right layout edges at every breakpoint.
for(const width of [1920,1440,1100,1024,768,700,390,320]){
  win.setSize(width,1120);await settle();
  const edges=await js(`(()=>{const brand=document.querySelector('header .brand').getBoundingClientRect(),nav=document.querySelector('header nav').getBoundingClientRect(),workspace=document.querySelector('.cloud-workspace').getBoundingClientRect(),heading=document.querySelector('.account-heading').getBoundingClientRect();return {left:Math.abs(brand.left-workspace.left),right:Math.abs(nav.right-workspace.right),heading:Math.abs(heading.left-workspace.left)};})()`);
  assert.ok(edges.left<=1 && edges.right<=1 && edges.heading<=1,`Header alignment at ${width}: ${JSON.stringify(edges)}`);
}
win.setSize(1440,1120);await settle();
assert.equal(await js("document.querySelectorAll('.cloud-item').length"),4);
assert.equal(await js("document.querySelector('.cloud-note-content').textContent.includes('clear head')"),true);
await settle();fs.writeFileSync(path.join(output,'desktop.png'),(await win.capturePage()).toPNG());
await js(`document.querySelector('.cloud-item').focus();document.querySelector('.cloud-item').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));`);
assert.equal(await js(`document.activeElement.textContent.includes('Studio')`),true);
// Account tools share the workspace shell and keep their session controls mounted.
assert.equal(await js(`document.querySelector('[data-workspace-panel="storage"]').hidden`),true);
await js(`document.querySelector('[data-data-category="storage"]').click();`);
assert.equal(await js(`document.querySelector('[data-workspace-panel="storage"]').hidden`),false);
assert.equal(await js(`getComputedStyle(document.querySelector('.cloud-browser')).display`),'none');
await settle();fs.writeFileSync(path.join(output,'storage.png'),(await win.capturePage()).toPNG());
await js(`document.querySelector('[data-data-category="devices"]').click();`);
assert.equal(await js(`document.querySelector('[data-workspace-panel="devices"]').hidden`),false);
assert.equal(await js(`document.querySelector('[data-account-sessions]').textContent.includes('This device')`),true);
await settle();fs.writeFileSync(path.join(output,'devices.png'),(await win.capturePage()).toPNG());
await js(`document.querySelector('[data-data-category="notes"]').click();document.querySelector('.cloud-item').click();`);
// Edit, protect the draft on navigation, keep editing, then save with its revision.
await js(`document.querySelector('.cloud-preview-actions button').click();document.querySelector('.account-data-editor input').value='A calmer morning — updated';document.querySelector('.account-data-editor input').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-data-category="workspace"]').click();`);
assert.equal(await js("document.querySelector('.cloud-unsaved').hidden"),false);
await js(`document.querySelector('.cloud-unsaved button:last-child').click();document.querySelector('.account-data-editor').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));`);await settle();
assert.equal((await js('window.demoWrites'))[0].title,'A calmer morning — updated');assert.equal((await js('window.demoWrites'))[0].revision,1);
// Search across note contents and clear without losing data.
await js(`document.querySelector('[data-data-search]').value='Copenhagen';document.querySelector('[data-data-search]').dispatchEvent(new Event('input'));`);
assert.equal(await js("document.querySelectorAll('.cloud-item').length"),1);
await js(`document.querySelector('[data-data-search]').value='';document.querySelector('[data-data-search]').dispatchEvent(new Event('input'));document.querySelector('[data-data-category="workspace"]').click();document.querySelector('.cloud-item').click();`);
assert.equal(await js("document.querySelectorAll('.cloud-item').length"),3);
assert.equal(await js("document.querySelector('.cloud-website-link').getAttribute('rel')"),'noopener noreferrer');
await settle();fs.writeFileSync(path.join(output,'apps.png'),(await win.capturePage()).toPNG());
await js(`document.querySelector('[data-data-category="hooks"]').click();document.querySelector('.cloud-item').click();`);
assert.equal(await js("document.querySelectorAll('.cloud-code').length"),3);
assert.equal(await js("document.querySelectorAll('.account-data-editor').length"),0);
await js(`document.querySelector('.cloud-code:last-child').open=true;`);await settle();
await settle();fs.writeFileSync(path.join(output,'hooks.png'),(await win.capturePage()).toPNG());
// A failed save must preserve the draft; discard allows navigation.
await js(`document.querySelector('[data-data-category="notes"]').click();document.querySelector('.cloud-item').click();document.querySelector('.cloud-preview-actions button').click();document.querySelector('.account-data-editor textarea').value='A draft to keep';document.querySelector('.account-data-editor textarea').dispatchEvent(new Event('input',{bubbles:true}));window.failSave=true;document.querySelector('.account-data-editor').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));`);await settle();
assert.equal(await js("document.querySelector('.account-data-editor textarea').value"),'A draft to keep');assert.equal(await js("document.querySelector('.cloud-editor-feedback').textContent.includes('changed')"),true);
await js(`window.failSave=false;document.querySelector('[data-data-category="workspace"]').click();document.querySelector('.cloud-unsaved button').click();document.querySelector('.cloud-item').click();document.querySelector('.cloud-delete').click();`);
assert.equal((await js('window.demoWrites')).length,1);
await js(`document.querySelector('.cloud-delete-confirm button:last-child').click();`);
assert.equal(await js("document.querySelector('.cloud-delete-confirm').hidden"),true);
await js(`document.querySelector('.cloud-delete').click();document.querySelector('.cloud-delete-confirm button').click();`);await settle();
assert.equal((await js('window.demoWrites'))[1].remove,true);assert.equal(await js("document.querySelectorAll('.cloud-item').length"),2);
// List and detail fit compact screens without horizontal scroll.
await js(`document.querySelector('[data-data-category="notes"]').click();window.demoRecords[0].value.items[0].title='A calmer morning';document.querySelector('[data-data-refresh]').click();`);await settle();
for(const width of [1024,768,390,320]){win.setSize(width,1000);await settle();assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false,`overflow at ${width}`);}
win.setSize(390,1000);await settle();await settle();fs.writeFileSync(path.join(output,'mobile.png'),(await win.capturePage()).toPNG());
await js(`document.querySelector('.cloud-item').click();`);await settle();assert.equal(await js("getComputedStyle(document.querySelector('.cloud-detail')).display"),'block');
await settle();fs.writeFileSync(path.join(output,'mobile-detail.png'),(await win.capturePage()).toPNG());
await js(`document.querySelector('.cloud-back').click();`);assert.equal(await js("document.querySelector('.cloud-workspace').classList.contains('cloud-detail-open')"),false);
await js(`window.demoRecords[1].value.openTabs=[{id:'tab2',title:'Duplicate app',url:'https://www.notion.so',spaceId:'studio',sessionId:'research'},{id:'open-only',title:'Open tab only',url:'https://example.com',spaceId:'studio',sessionId:'research'}];window.demoRecords.push({id:'notes_second',category:'notes',revision:1,value:{deviceId:'second',items:[{id:'other',title:'Another device',notes:'Other source'}]}});document.querySelector('[data-data-refresh]').click();`);await settle();
await js(`document.querySelector('[data-data-category="workspace"]').click();`);
assert.equal(await js(`document.querySelectorAll('.cloud-item').length`),3);
await js(`document.querySelector('[data-data-category="notes"]').click();document.querySelector('[data-data-source]').value='second';document.querySelector('[data-data-source]').dispatchEvent(new Event('change'));`);
assert.equal(await js(`document.querySelectorAll('.cloud-item').length`),1);
assert.equal(await js(`document.querySelector('.cloud-item strong').textContent`),'Another device');
for(const key of ['storage','devices']){
  await js(`document.querySelector('[data-data-category="${key}"]').click();`);
  assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);
  assert.equal(await js(`document.querySelector('[data-workspace-panel="${key}"]').hidden`),false);
}
// Mobile navigation exposes every view without horizontal clipping.
await js(`const menu=document.querySelector('[data-workspace-navigation]');menu.value='notes';menu.dispatchEvent(new Event('change'));`);
assert.equal(await js(`document.querySelector('[data-data-heading]').textContent`),'Notes');
assert.equal(await js(`getComputedStyle(document.querySelector('.cloud-mobile-navigation')).display`),'flex');
// A native menu change protects a draft and keeps the actual selected option consistent.
await js(`document.querySelector('[data-data-source]').value='all';document.querySelector('[data-data-source]').dispatchEvent(new Event('change'));document.querySelector('.cloud-item').click();document.querySelector('.cloud-preview-actions button').click();document.querySelector('.account-data-editor input').value='Draft';document.querySelector('.account-data-editor input').dispatchEvent(new Event('input',{bubbles:true}));const menu=document.querySelector('[data-workspace-navigation]');menu.value='storage';menu.dispatchEvent(new Event('change'));`);
assert.equal(await js(`document.querySelector('[data-workspace-navigation]').value`),'notes');
assert.equal(await js(`document.querySelector('.cloud-unsaved').hidden`),false);
await js(`document.querySelector('.cloud-unsaved button').click();`);
assert.equal(await js(`document.querySelector('[data-workspace-navigation]').value`),'storage');
// Narrow tablets use a focused list/detail flow, and long content stays inside the pane.
win.setSize(768,1000);await settle();
await js(`document.querySelector('[data-data-category="notes"]').click();document.querySelector('.cloud-item').click();`);
assert.equal(await js(`getComputedStyle(document.querySelector('.cloud-list')).display`),'none');
assert.equal(await js(`getComputedStyle(document.querySelector('.cloud-detail')).display`),'block');
await js(`window.scrollTo(0,0);`);await settle();fs.writeFileSync(path.join(output,'tablet.png'),(await win.capturePage()).toPNG());
win.setSize(1180,1000);await settle();
await js(`document.querySelector('.cloud-preview-actions button').click();`);await settle();
await js(`window.scrollTo(0,0);`);await settle();fs.writeFileSync(path.join(output,'editor.png'),(await win.capturePage()).toPNG());
// Invalid URL input gives field-level feedback and never reaches the data API.
await js(`document.querySelector('.account-data-editor button[type="button"]').click();document.querySelector('[data-data-category="workspace"]').click();document.querySelector('.cloud-item').click();document.querySelector('.cloud-preview-actions button').click();window.writeCountBefore=window.demoWrites.length;const url=document.querySelector('.account-data-editor input[type="url"]');url.value='javascript:alert(1)';url.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.account-data-editor').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));`);
assert.equal(await js(`window.demoWrites.length===window.writeCountBefore`),true);
assert.equal(await js(`document.querySelector('input[type="url"]').validity.valid`),false);
await js(`document.querySelector('[data-data-category="hooks"]').click();document.querySelector('.cloud-unsaved button').click();document.querySelector('[data-data-source]').value='all';document.querySelector('[data-data-search]').value='quiet';document.querySelector('[data-data-search]').dispatchEvent(new Event('input'));`);
assert.equal(await js(`document.querySelectorAll('.cloud-item').length`),1);
// Empty and failed loads offer useful actions and retain the error across view changes.
await js(`window.savedRecords=window.demoRecords;window.demoRecords=[];document.querySelector('[data-data-category="notes"]').click();document.querySelector('[data-data-refresh]').click();`);await settle();
assert.equal(await js(`document.querySelector('.cloud-list a').textContent`),'Set up sync ↗');
win.setSize(390,1000);await settle();fs.writeFileSync(path.join(output,'empty.png'),(await win.capturePage()).toPNG());
await js(`window.fetch=async()=>({ok:false,status:503,json:async()=>({error:'managed_sync_not_configured'})});document.querySelector('[data-data-refresh]').click();`);await settle();
assert.equal(await js(`document.querySelector('.cloud-list button').textContent`),'Try again');
await js(`document.querySelector('[data-data-category="workspace"]').click();`);
assert.equal(await js(`document.querySelector('[data-data-status]').textContent.includes('not available')`),true);
await settle();fs.writeFileSync(path.join(output,'error.png'),(await win.capturePage()).toPNG());
await js(`window.fetch=async()=>({ok:false,status:401,json:async()=>({error:'unauthorized'})});document.querySelector('[data-data-refresh]').click();`);await settle();
assert.equal(await js(`document.querySelector('.cloud-list a').getAttribute('href')`),'/sign-in');
await js(`window.fetch=async()=>({ok:false,status:409,json:async()=>({error:'recovery_key_required'})});document.querySelector('[data-data-refresh]').click();`);await settle();
assert.equal(await js(`document.querySelector('[data-data-recovery]').hidden`),false);
assert.equal(await js(`document.querySelector('[data-data-recovery] input').type`),'password');
await js(`document.querySelector('[data-data-category="storage"]').click();`);
assert.equal(await js(`getComputedStyle(document.querySelector('[data-data-recovery]')).display`),'none');
// Sensitive note text and hook sources are displayed literally, with no evaluation.
await js(`window.demoRecords=window.savedRecords;window.demoRecords[0].value.items[0].title='<img src=x onerror=alert(1)>';window.demoRecords[0].value.items[0].notes='A long note. '.repeat(7000);window.fetch=async()=>({ok:true,json:async()=>({records:window.demoRecords})});document.querySelector('[data-data-category="notes"]').click();document.querySelector('[data-data-refresh]').click();`);await settle();
await js(`document.querySelector('.cloud-item').click();`);
assert.equal(await js(`document.querySelector('.cloud-detail-title').querySelector('img')===null`),true);
assert.equal(await js(`document.documentElement.scrollWidth>innerWidth`),false);
// Deleting on mobile returns to the list instead of trapping the user in an empty preview.
await js(`document.querySelector('.cloud-delete').click();document.querySelector('.cloud-delete-confirm button').click();`);await settle();
assert.equal(await js(`document.querySelector('.cloud-workspace').classList.contains('cloud-detail-open')`),false);
assert.equal(await js(`getComputedStyle(document.querySelector('.cloud-list')).display!=='none'`),true);
console.log('Preview screenshots: '+output);
console.log('Passed: notes/tab/hook previews, search, draft protection, revision-checked save, failed-save draft retention, confirmed deletion, mobile menus, validation, recovery/error actions, literal content, and 320–1920px layouts.');win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
