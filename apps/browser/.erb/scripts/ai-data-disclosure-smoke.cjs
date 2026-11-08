// Actual AI/vault + official MCP and deterministic local provider. Synthetic facts only.
const {app,BrowserWindow,WebContentsView,ipcMain,dialog,session}=require('electron');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),net=require('net'),crypto=require('crypto'),assert=require('assert');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-disclosure-'));app.setPath('userData',root);
const mainSource=fs.readFileSync(process.env.TOUCHBOX_DISCLOSURE_SOURCE||'src/main/ai.ts','utf8');
require('esbuild').buildSync({stdin:{contents:mainSource+"\nexport {passwordVault,registerPasswordManager} from './passwordManager';",resolveDir:path.resolve('src/main'),sourcefile:'ai.ts',loader:'ts'},bundle:true,minify:true,platform:'node',external:['electron'],outfile:path.join(root,'ai.cjs')});
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('test',{mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p),permissions:m=>ipcRenderer.invoke('ai-permissions',m),settings:p=>ipcRenderer.invoke('ai-settings',p),run:p=>ipcRenderer.invoke('ai-run',p),stop:()=>ipcRenderer.invoke('ai-stop')});ipcRenderer.on('ai-event',(_,event)=>ipcRenderer.send('fixture-event',event));`);
const content=result=>JSON.parse(result.content.find(item=>item.type==='text').text);
const fact='fixture-confidential-disclosure-7391';const username='fixture-private-account-8392';
let providerStep=0;let providerBodies=[];let providerFinished;let pendingDone;let site,provider,host,view,client,dispose;
(async()=>{
  await app.whenReady();
  site=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>Disclosure fixture</title><button>Continue</button>');});await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
  const url='https://disclosure.fixture.test/';
  await session.defaultSession.protocol.handle('https',()=>new Response('<title>Disclosure fixture</title><button>Continue</button>',{headers:{'Content-Type':'text/html'}}));
  provider=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);
    if(!request.tools?.length){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'Disclosure test'}}]}));return;}
    providerBodies.push(body);providerStep+=1;
    const message=providerStep===1?{role:'assistant',content:null,tool_calls:[{id:'read-fixture',type:'function',function:{name:'read_personal_data',arguments:JSON.stringify({tabId:'first',recordId:'private'})}}]}:{role:'assistant',content:providerBodies.some(body=>body.includes(fact))?`Approved fact: ${fact}`:'Disclosure fixture complete.'};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message}]}));
  });await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  host=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,preload:path.join(root,'preload.cjs')}});await host.loadURL('data:text/html,Disclosure fixture');
  view=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await view.webContents.loadURL(url);host.contentView.addChildView(view);view.setBounds({x:0,y:0,width:600,height:400});
  const ai=require(path.join(root,'ai.cjs'));const vault=ai.passwordVault();vault.unlock('disposable disclosure fixture credential',true);
  const record={id:'private',title:'Personal fixture',origin:'',kind:'profile',username:'',password:'',fields:[{name:'occupation',value:fact,secret:false},{name:'password',value:'never-disclose-protected-9831',secret:true}],notes:'',allowAI:true};vault.save(record);
  const login={...record,id:'login',kind:'login',username,origin:'',fields:[],password:'never-disclose-protected-9831'};vault.save(login);
  const tabs=[{id:'first',name:'Fixture',url,icon:'',sessionId:'fixture'}];
  ai.registerPasswordManager(()=>false,{authenticateOS:async()=>{}});
  dispose=ai.registerAI(host,{tabs:()=>tabs,focused:()=> 'first',contents:id=>id==='first'?view.webContents:undefined});
  const evaluate=code=>host.webContents.executeJavaScript(code);
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  await evaluate(`test.mcp('update',{enabled:true,port:${port}})`);const connection=(await evaluate("test.mcp('connection')")).mcpServers.touchbox;
  client=new Client({name:'disclosure-fixture',version:'1'},{capabilities:{}});await client.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
  const baseline=process.env.TOUCHBOX_DISCLOSURE_PHASE==='before';const results=[];
  for(const [mode,name,args,sentinel] of [['standard','read_personal_data',{recordId:'private'},fact],['full','search_personal_data',{query:'7391'},fact],['full','read_personal_data',{recordId:'private'},fact],['full','list_saved_logins',{},username]]){
    await evaluate(`test.permissions('${mode}')`);let reviews=0;dialog.showMessageBox=async()=>{reviews+=1;return {response:0};};
    const result=await client.callTool({name,arguments:{tabId:'first',...args}});const disclosed=JSON.stringify(result).includes(sentinel);
    results.push({case:mode+' '+name,reviews,disclosed});assert.equal(disclosed,baseline,JSON.stringify(result));assert.equal(reviews,baseline?0:1);if(!baseline)assert(result.isError);
  }
  if(!baseline){
    let reviews=0;dialog.showMessageBox=async(_owner,options)=>{reviews+=1;assert(options.detail.includes('Connected external AI client'));assert(options.detail.includes(fact));assert(!options.detail.includes('never-disclose-protected-9831'));return {response:1};};
    const allowed=await client.callTool({name:'read_personal_data',arguments:{tabId:'first',recordId:'private'}});assert(!allowed.isError&&JSON.stringify(allowed).includes(fact));assert.equal(reviews,1);results.push({case:'explicit external-client disclosure',reviews,disclosed:true});
    const revokeCases=[
      ['record consent changed and restored',async()=>{vault.save({...vault.edit('private'),allowAI:false});vault.save({...vault.edit('private'),allowAI:true});}],
      ['profile changed',async()=>{tabs[0].sessionProfileId='changed';}],
      ['same URL document replaced',async()=>{await view.webContents.loadURL(url);}],
      ['host document replaced',async()=>{await host.loadURL('data:text/html,Changed host');}],
      ['access change request refused while disclosure is pending',async()=>{await evaluate("test.permissions('ask')");}],
    ];
    for(const [label,mutate] of revokeCases){dialog.showMessageBox=async()=>{await mutate();return {response:1};};const result=await client.callTool({name:'read_personal_data',arguments:{tabId:'first',recordId:'private'}});assert(result.isError&&!JSON.stringify(result).includes(fact),JSON.stringify(result));delete tabs[0].sessionProfileId;results.push({case:label,blocked:true});}
    dialog.showMessageBox=(_owner,options)=>new Promise(resolve=>{options.signal.addEventListener('abort',()=>resolve({response:0}),{once:true});setTimeout(()=>{evaluate('test.stop()').catch(()=>{});},0);});
    const stopped=await client.callTool({name:'read_personal_data',arguments:{tabId:'first',recordId:'private'}});assert(stopped.isError&&!JSON.stringify(stopped).includes(fact));results.push({case:'Stop during disclosure review',blocked:true});
  }
  await client.close();client=undefined;await evaluate("test.mcp('update',{enabled:false})");
  await evaluate(`test.settings({endpoint:'http://127.0.0.1:${provider.address().port}/v1',model:'fixture',key:'local-fixture-key',remember:false})`);
  ipcMain.on('fixture-event',(_event,event)=>{if(event.type==='done')pendingDone?.();});
  for(const allow of [false,true]){
    providerStep=0;providerBodies=[];let reviews=0;dialog.showMessageBox=async(_owner,options)=>{reviews+=1;if(!baseline){assert(options.detail.includes(`http://127.0.0.1:${provider.address().port}/v1/chat/completions`));assert(options.detail.includes('fixture'));assert(options.detail.includes(fact));assert(!options.detail.includes('local-fixture-key'));}return {response:allow?1:0};};
    const done=new Promise(resolve=>{pendingDone=resolve;});await evaluate("test.run('Use full access. Read my saved profile for this task.')");await Promise.race([done,new Promise((_resolve,reject)=>{providerFinished=setTimeout(()=>reject(new Error('Provider disclosure fixture timed out')),10000);})]);clearTimeout(providerFinished);
    const disclosed=providerBodies.some(body=>body.includes(fact));assert.equal(disclosed,baseline||allow);assert(providerBodies.every(body=>!body.includes('never-disclose-protected-9831')));assert.equal(reviews,baseline?0:1);results.push({case:'provider '+(allow?'approved':'denied'),requests:providerBodies.length,reviews,disclosed});
  }
  // A fresh recipient must not inherit previously disclosed assistant context.
  const previousProvider=provider;provider=http.createServer(previousProvider.listeners('request')[0]);await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));previousProvider.close();
  await evaluate(`test.settings({endpoint:'http://127.0.0.1:${provider.address().port}/v1',model:'fixture',key:'different-local-fixture-key',remember:false})`);
  providerStep=0;providerBodies=[];let contextReviews=0;dialog.showMessageBox=async(_owner,options)=>{contextReviews+=1;assert(options.detail.includes(fact));assert(options.detail.includes(`http://127.0.0.1:${provider.address().port}/v1/chat/completions`));return {response:0};};
  const contextDone=new Promise(resolve=>{pendingDone=resolve;});await evaluate("test.run('Use full access. Continue the previous discussion.')");await Promise.race([contextDone,new Promise((_resolve,reject)=>{providerFinished=setTimeout(()=>reject(new Error('Context disclosure timed out')),10000);})]);clearTimeout(providerFinished);
  const contextDisclosed=providerBodies.some(body=>body.includes(fact));assert.equal(contextDisclosed,baseline);assert.equal(contextReviews,baseline?0:1);if(!baseline)assert.equal(providerBodies.length,0);results.push({case:'new recipient, prior private conversation declined',reviews:contextReviews,requests:providerBodies.length,disclosed:contextDisclosed});
  const report={measuredAt:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,arch:process.arch,mainSourceSHA256:crypto.createHash('sha256').update(mainSource).digest('hex'),method:'Actual Electron registerAI/encrypted vault, official local MCP client and deterministic local HTTP model provider. Synthetic facts only; native message-box responses controlled by the fixture.',results,limitations:['Approved provider/client disclosures are intentional and can remain in conversation/checkpoints.','Downstream navigation/form/hook containment and previously disclosed conversation revocation remain separate requirements.','No external accounts, production providers or packaged installer are used.']};
  const file='docs/benchmarks/ai-data-disclosure.json';const stored=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};const phase=process.env.TOUCHBOX_DISCLOSURE_PHASE||'after';if(stored[phase])stored.confirmations=[...(stored.confirmations||[]),{phase,...report}];else stored[phase]=report;fs.writeFileSync(file,JSON.stringify(stored,null,2)+'\n');
  console.log('PASS: '+phase+' private-data disclosure boundary',JSON.stringify(report));
  await dispose();view.webContents.close();host.destroy();site.close();provider.close();vault.lock();fs.rmSync(root,{recursive:true,force:true});app.exit(0);
})().catch(async error=>{console.error(error);clearTimeout(providerFinished);try{await client?.close();await dispose?.();}catch{}site?.close();provider?.close();host?.destroy();app.exit(1);});
