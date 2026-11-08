const {app,BrowserWindow,nativeTheme}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {buildSync}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-input-hooks-'));
app.setPath('userData',path.join(root,'profile'));
const out=path.resolve('docs/evidence/ai-input-hooks');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(root,'main.ts'),`export {requestAIInput,aiInputHTML} from ${JSON.stringify(path.resolve('src/main/aiUserInput'))};`);
buildSync({entryPoints:[path.join(root,'main.ts')],bundle:true,platform:'node',external:['electron'],outfile:path.join(root,'main.cjs')});
fs.writeFileSync(path.join(root,'preview.tsx'),`import React from ${JSON.stringify(require.resolve('react'))};import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};import {Theme} from '@radix-ui/themes';import {SiteDeveloperPanel} from ${JSON.stringify(path.resolve('src/components/UI/SiteDeveloperPanel'))};import ${JSON.stringify(path.resolve('src/renderer/index.css'))};const config={enabled:true,before:'',after:'',css:'',hooks:[{id:'account',name:'Account helper',enabled:true,path:'/account/*',before:'',after:"log('Account ready', url)",css:''}]};function Preview(){const [theme,setTheme]=React.useState('light');window.setTheme=setTheme;return <Theme appearance={theme}><div className="site-developer-page" style={{height:'100vh',width:'100%'}}><SiteDeveloperPanel origin="https://example.com/account/settings" developer={{config,status:'waiting',logs:[]}} disabled={false} send={()=>{}}/></div></Theme>};createRoot(document.getElementById('root')).render(<Preview/>);`);
buildSync({entryPoints:[path.join(root,'preview.tsx')],bundle:true,platform:'browser',jsx:'automatic',nodePaths:[path.resolve('node_modules')],outfile:path.join(root,'preview.js'),loader:{'.svg':'dataurl','.png':'dataurl','.woff2':'dataurl'}});
fs.writeFileSync(path.join(root,'index.html'),'<link rel="stylesheet" href="preview.css"><div id="root"></div><script src="preview.js"></script>');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const {requestAIInput}=require(path.join(root,'main.cjs'));
 const host=new BrowserWindow({width:820,height:740,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 await host.loadFile(path.join(root,'index.html'));await wait(400);
 await host.webContents.executeJavaScript(`document.querySelector('[aria-label="Selected hook"]').click()`);await wait(120);await host.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role=option]')).find(el=>el.textContent==='Account helper').click()`);await wait(120);
 for(const theme of ['light','dark'])for(const width of [360,820]){
  host.setContentSize(width,740);await host.webContents.executeJavaScript(`window.setTheme('${theme}');`);await wait(250);
  fs.writeFileSync(path.join(out,`hooks-${width}-${theme}.png`),(await host.webContents.capturePage()).toPNG());
  await host.webContents.executeJavaScript(`document.querySelector('[aria-label="Choose pages"]').click()`);await wait(150);fs.writeFileSync(path.join(out,`target-${width}-${theme}.png`),(await host.webContents.capturePage()).toPNG());
  await host.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(100);
  await host.webContents.executeJavaScript(`document.querySelector('[aria-label="Hook settings"]').click()`);await wait(150);fs.writeFileSync(path.join(out,`hook-settings-${width}-${theme}.png`),(await host.webContents.capturePage()).toPNG());
  await host.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(100);
 }
 await host.webContents.executeJavaScript(`document.querySelector('[aria-label="Choose pages"]').click()`);await wait(120);
 await host.webContents.executeJavaScript(`document.querySelector('[aria-label="Pages to match"]').click()`);await wait(120);
 fs.writeFileSync(path.join(out,'target-menu.png'),(await host.webContents.capturePage()).toPNG());
 await host.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role=option]')).find(el=>el.textContent==='All pages on this website').click()`);await wait(120);
 assert.equal(await host.webContents.executeJavaScript(`!!document.querySelector('input[placeholder="/account/"]')`),false);
 fs.writeFileSync(path.join(out,'target-all-pages.png'),(await host.webContents.capturePage()).toPNG());
 await host.webContents.executeJavaScript(`document.querySelector('[aria-label="Pages to match"]').click()`);await wait(100);
 await host.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role=option]')).find(el=>el.textContent==='Selected pages').click()`);await wait(120);
 assert.equal(await host.webContents.executeJavaScript(`document.querySelector('input[placeholder="/account/"]').value`),'/account/settings');
 await host.webContents.executeJavaScript(`document.querySelector('[aria-label="Path matching"]').click()`);await wait(100);
 fs.writeFileSync(path.join(out,'target-rule-menu.png'),(await host.webContents.capturePage()).toPNG());
 await host.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role=option]')).find(el=>el.textContent==='Path starts with').click()`);await wait(100);
 await host.webContents.executeJavaScript(`const input=document.querySelector('input[placeholder="/account/"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'account');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();`);await wait(100);
 assert.equal(await host.webContents.executeJavaScript(`document.querySelector('[role=alert]').textContent`),'Start the path with /.');
 await host.webContents.executeJavaScript(`document.querySelector('input[placeholder="/account/"]').focus()`);await wait(100);
 fs.writeFileSync(path.join(out,'target-invalid-focused.png'),(await host.webContents.capturePage()).toPNG());
 await host.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(100);
 console.log('Page targeting interactions completed');
 const pending=requestAIInput(host,{title:'Which account should I use?',reason:'Two accounts match this task.',options:['Work account','Personal account']},new AbortController().signal);
 await wait(350);let form=BrowserWindow.getAllWindows().find(win=>win!==host);assert(form);
 for(const theme of ['light','dark'])for(const width of [360,600]){nativeTheme.themeSource=theme;form.setContentSize(width,650);await wait(100);fs.writeFileSync(path.join(out,`feedback-${width}-${theme}.png`),(await form.webContents.capturePage()).toPNG());}
 await form.webContents.executeJavaScript(`document.querySelector('.choice').click();document.querySelector('form').requestSubmit();`);
 assert.equal((await pending).answer,'Work account');
 console.log('Feedback completed');
 const secure=requestAIInput(host,{title:'Website login',reason:'Enter the missing login details for this task.',origin:'https://example.com',fields:['username','password']},new AbortController().signal);
 await wait(350);form=BrowserWindow.getAllWindows().find(win=>win!==host);
 for(const theme of ['light','dark'])for(const width of [360,600]){nativeTheme.themeSource=theme;form.setContentSize(width,650);await wait(100);fs.writeFileSync(path.join(out,`secure-${width}-${theme}.png`),(await form.webContents.capturePage()).toPNG());}
 assert.equal(await form.webContents.executeJavaScript(`document.querySelector('[name="field-1"]').type`),'password');
 await form.webContents.executeJavaScript(`document.querySelector('#cancel').click()`);assert.equal(await secure,null);
 console.log('Secure form completed');
 const controller=new AbortController();const stopped=requestAIInput(host,{title:'Feedback',reason:'Stop should close this request.'},controller.signal);await wait(150);controller.abort();await assert.rejects(stopped,/stopped/);
 host.destroy();console.log('PASS rendered hooks, feedback selection, secure form masking/cancel, Stop cleanup');
 app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
