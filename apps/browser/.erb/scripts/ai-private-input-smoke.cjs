/* Actual sandboxed secure-input forms; synthetic secrets and website Request bodies. */
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),net=require('net'),assert=require('assert/strict');
const {app,BrowserWindow,WebContentsView,dialog,session,powerMonitor}=require('electron');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const root=path.resolve(__dirname,'../..'),phase=process.argv[2]||'after';assert(['before','after'].includes(phase));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-private-input-'));app.setPath('userData',temporary);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const source=fs.readFileSync(path.join(root,phase==='before'?'docs/benchmarks/baselines/private-input/ai.ts.txt':'src/main/ai.ts'),'utf8');
const url='https://private-input.fixture.test/',fact='synthetic-temporary-secret-21937';
const page=`<title>Temporary input fixture</title><input name="occupation"><script>document.querySelector('input').addEventListener('input',event=>fetch('/receive',{method:'POST',body:event.target.value}));</script>`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const content=result=>JSON.parse(result.content.find(block=>block.type==='text').text);
let host,view,client,dispose,vault,scenario,received=[],formFailure,formFinished,replySent,requestResult,tabs,watchdog;
(async()=>{
 await app.whenReady();
 const build=await require('esbuild').build({stdin:{contents:source+"\nexport {personalDataScope};export {passwordVault,registerPasswordManager} from './passwordManager';",resolveDir:path.join(root,'src/main'),sourcefile:'ai.ts',loader:'ts'},bundle:true,minify:true,platform:'node',external:['electron'],outfile:path.join(temporary,'ai.cjs'),metafile:true});
 session.defaultSession.protocol.handle('https',async request=>{if(new URL(request.url).pathname==='/receive'){received.push(await request.text());return new Response('received');}return new Response(page,{headers:{'Content-Type':'text/html'}});});
 fs.writeFileSync(path.join(temporary,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('test',{mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p),permissions:m=>ipcRenderer.invoke('ai-permissions',m),stop:()=>ipcRenderer.invoke('ai-stop')});`);
 host=new BrowserWindow({show:false,width:700,height:500,webPreferences:{sandbox:true,contextIsolation:true,preload:path.join(temporary,'preload.cjs')}});await host.loadURL('data:text/html,Temporary input host');
 view=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});host.contentView.addChildView(view);view.setBounds({x:0,y:0,width:650,height:400});await view.webContents.loadURL(url);
 const ai=require(path.join(temporary,'ai.cjs'));vault=ai.passwordVault();vault.unlock('disposable temporary input credential',true);ai.registerPasswordManager(()=>false,{authenticateOS:async()=>{}});
 tabs=[{id:'first',name:'Fixture',url,icon:'',sessionId:'fixture'}];dispose=ai.registerAI(host,{tabs:()=>tabs,focused:()=> 'first',contents:id=>id==='first'?view.webContents:undefined});
 const evaluate=code=>host.webContents.executeJavaScript(code);
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 await evaluate(`test.mcp('update',{enabled:true,port:${port}})`);const connection=(await evaluate("test.mcp('connection')")).mcpServers.touchbox;
 client=new Client({name:'private-input-fixture',version:'1'},{capabilities:{}});await client.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
 app.on('browser-window-created',(_event,win)=>{
   win.webContents.once('did-finish-load',async()=>{
     try{
       assert.equal(await win.webContents.executeJavaScript('typeof inputForm'), 'object');
       if(scenario.collect)await scenario.collect(win);
       if(!win.isDestroyed()){await win.webContents.executeJavaScript(`inputForm.respond(${JSON.stringify(scenario.cancel?null:{'field-0':fact,...(scenario.save?{save:'on'}:{})})})`);replySent=true;}
       formFinished=true;
     }catch(error){formFailure=error;if(!win.isDestroyed())win.destroy();}
   });
 });
 dialog.showMessageBox=async()=>({response:1});
 const cases=[
   {name:'normal temporary collection and fill'},
   {name:'Cancel secure input',cancel:true,alreadyBlocked:true},
   {name:'document reload during secure collection',collect:async()=>view.webContents.loadURL(url),newlyBlocked:true},
   {name:'host reload during secure collection',collect:async()=>host.loadURL('data:text/html,Replacement host'),newlyBlocked:true},
   {name:'profile reassigned during secure collection',collect:async()=>{tabs[0].sessionProfileId='replacement';},newlyBlocked:true},
   {name:'document reload before temporary reuse',reuse:async()=>view.webContents.loadURL(url),newlyBlocked:true},
   {name:'host reload before temporary reuse',reuse:async()=>host.loadURL('data:text/html,Replacement host'),newlyBlocked:true},
   {name:'permissions changed and restored before reuse',reuse:async()=>{await evaluate("test.permissions('ask')");await evaluate("test.permissions('full')");},newlyBlocked:true},
   {name:'OS screen lock before temporary reuse',reuse:async()=>powerMonitor.emit('lock-screen'),newlyBlocked:true},
   {name:'Stop before temporary reuse',reuse:async()=>evaluate('test.stop()'),alreadyBlocked:true},
   {name:'normal explicitly saved secure input',save:true},
   {name:'document reload during explicitly saved input',save:true,collect:async()=>view.webContents.loadURL(url),newlyBlocked:true},
 ];
 const results=[];
 for(scenario of cases){
   clearTimeout(watchdog);watchdog=setTimeout(()=>{console.error("Timed out: "+scenario.name);app.exit(1);},15000);
   delete tabs[0].sessionProfileId;if(vault.status().locked)vault.unlock('disposable temporary input credential');await view.webContents.loadURL(url);await evaluate("test.permissions('full')");received=[];formFailure=undefined;formFinished=false;replySent=false;
   const beforeRecords=vault.status(ai.personalDataScope(tabs[0])).items.length;
   requestResult=await client.callTool({name:'request_personal_data',arguments:{tabId:'first',title:'Synthetic temporary input',reason:'The user requested local filling.',fieldNames:['occupation']}});
   for(let count=0;count<30&&!formFinished&&!formFailure;count++)await pause(20);
   if(formFailure)throw formFailure;
   assert(formFinished,'Secure form did not respond');
   assert(!JSON.stringify(requestResult).includes(fact),'Secure values escaped in request result');
   let result=requestResult;const answer=requestResult.isError?undefined:content(requestResult);
   if(answer?.recordId){assert.equal(answer.saved,!!scenario.save);if(scenario.save)assert(vault.edit(answer.recordId,ai.personalDataScope(tabs[0])).fields.some(field=>field.value===fact));if(scenario.reuse)await scenario.reuse();result=await client.callTool({name:'fill_personal_data',arguments:{tabId:'first',recordId:answer.recordId}});}
   for(let count=0;count<30&&!received.length&&!result.isError&&answer?.recordId;count++)await pause(20);
   const sent=received.filter(body=>body.includes(fact)).length;
   const expected=!scenario.alreadyBlocked&&(phase==='before'||!scenario.newlyBlocked);
   assert.equal(sent>0,expected,JSON.stringify({case:scenario.name,requestResult,result,received}));
   assert(!JSON.stringify(result).includes(fact),'Private values escaped in fill result');
   if(scenario.newlyBlocked&&phase==='after')assert(result.isError,JSON.stringify(result));
   results.push({case:scenario.name,requestAccepted:!requestResult.isError,fillAccepted:answer?.recordId?!result.isError:false,privateWebsiteBodies:sent,newSavedRecords:vault.status(ai.personalDataScope(tabs[0])).items.length-beforeRecords,secureFormSettled:formFinished,formClosedBeforeReply:!replySent,saved:answer?.saved||false,error:result.isError?JSON.stringify(result).slice(0,450):undefined});
   await evaluate('test.stop()');
 }
 const report={recordedAt:new Date().toISOString(),phase,mainSourceSha256:hash(source),probeSha256:hash(fs.readFileSync(__filename)),dependencyHashes:Object.fromEntries(Object.keys(build.metafile.inputs).filter(file=>fs.existsSync(file)).map(file=>[file,hash(fs.readFileSync(file))])),electron:process.versions.electron,platform:process.platform,arch:process.arch,results,scope:'Actual sandboxed requestAIInput native form, official MCP client, registerAI, disposable encrypted vault and Chromium Request bodies at a synthetic HTTPS protocol endpoint. Automated inputForm replies contain only synthetic secrets. No external providers, TLS socket server or signed-release claim.'};
 const output=path.join(root,'docs/benchmarks/ai-private-input.json');const reports=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};reports[phase]=report;fs.writeFileSync(output,JSON.stringify(reports,null,2)+'\n');console.log('PASS: '+phase+' native temporary private input',JSON.stringify(results));
 clearTimeout(watchdog);await client.close();client=undefined;dispose();view.webContents.close();host.destroy();vault.lock();fs.rmSync(temporary,{recursive:true,force:true});app.exit(0);
})().catch(async error=>{console.error(error);try{await client?.close();dispose?.();view?.webContents.close();host?.destroy();}catch{}app.exit(1);});
