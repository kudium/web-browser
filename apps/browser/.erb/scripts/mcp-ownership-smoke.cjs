/* Native document identities, real loopback MCP clients and disposable agent files. */
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict'),net=require('net');
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const root=path.resolve(__dirname,'../..'),phase=process.argv[2]||'after';assert(['before','after'].includes(phase));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kudiumbrowser-mcp-ownership-')),userData=path.join(temporary,'user-data');
app.setPath('userData',userData);process.env.HERMES_HOME=path.join(temporary,'hermes');
const files=['src/main/ai.ts','src/main/mcp.ts','src/main/personalAgentConnections.ts'];
const source=file=>fs.readFileSync(path.join(root,phase==='before'?'docs/benchmarks/baselines/mcp-ownership/'+path.basename(file)+'.txt':file),'utf8');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const handlers=new Map(),handle=ipcMain.handle.bind(ipcMain);ipcMain.handle=(name,fn)=>{handlers.set(name,fn);return handle(name,fn)};
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}};
let host,settings,dispose,ai,listenHold,executed=0;
const originalListen=net.Server.prototype.listen;
net.Server.prototype.listen=function(...args){
 if(!listenHold)return originalListen.apply(this,args);
 const held=listenHold,callback=args.pop();assert.equal(typeof callback,'function');
 return originalListen.call(this,...args,()=>{held.entered.resolve();held.release.promise.then(callback)});
};
async function port(){const server=net.createServer();await new Promise(resolve=>originalListen.call(server,0,'127.0.0.1',resolve));const selected=server.address().port;await new Promise(resolve=>server.close(resolve));return selected;}
const settingsFile=()=>path.join(userData,'mcp-settings.json'),registry=()=>path.join(userData,'personal-agent-connections.json'),agentFile=()=>path.join(process.env.HERMES_HOME,'config.yaml');
const initial='model: fixture\nmcp_servers:\n  kudiumbrowser:\n    url: https://previous.test/mcp\n';
async function run(){
 await app.whenReady();fs.mkdirSync(userData,{recursive:true});fs.mkdirSync(process.env.HERMES_HOME,{recursive:true});
 const bundle=path.join(temporary,'fixture.cjs');
 const contents=source(files[0]).replace('mcp = createMCPController({','mcp = fixtureMCP = createMCPController({')+"\nexport let fixtureMCP:any;export function fixtureShutdown(p:Promise<void>){externalShutdown=p;}";
 const build=await require('esbuild').build({stdin:{contents,resolveDir:path.join(root,'src/main'),sourcefile:path.join(root,files[0]),loader:'ts'},bundle:true,minify:true,platform:'node',external:['electron'],outfile:bundle,metafile:true,plugins:[{name:'exact-config-sources',setup(builder){for(const file of files.slice(1)){builder.onLoad({filter:new RegExp('/'+file.replaceAll('.','\\.')+'$')},()=>({contents:source(file),loader:'ts',resolveDir:path.dirname(path.join(root,file))}));}}}]});
 ai=require(bundle);const page=path.join(temporary,'host.html');fs.writeFileSync(page,'<!doctype html><title>MCP fixture</title>');
 const create=async()=>{const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await window.loadFile(page);return window;};
 host=await create();settings=await create();
 const event=(window=host)=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 const call=(name,args=[],window=host)=>handlers.get(name)(event(window),...args);
 const outcome=pending=>Promise.resolve(pending).then(value=>({accepted:true,value}),error=>({accepted:false,error:error.message}));
 const reload=async window=>{const frame=window.webContents.mainFrame;await window.loadFile(page);assert.equal(window.webContents.mainFrame,frame,'native same-URL frame identity');};
 const fresh=async delayed=>{
  listenHold=undefined;if(dispose){dispose();dispose=undefined;await ai.fixtureMCP.dispose();}
  fs.rmSync(settingsFile(),{force:true});fs.rmSync(registry(),{force:true});fs.rmSync(path.join(userData,'ai-external-paused'),{force:true});
  for(const name of fs.readdirSync(process.env.HERMES_HOME))fs.rmSync(path.join(process.env.HERMES_HOME,name),{force:true});
  const selected=await port();fs.writeFileSync(settingsFile(),JSON.stringify({enabled:false,port:selected}));
  fs.writeFileSync(agentFile(),initial);ai.fixtureShutdown(delayed||Promise.resolve());
  await ai.initializeLocalStorage();
  dispose=ai.registerAI(host,{tabs:()=>[],focused:()=>undefined,contents:()=>undefined,settingsWindow:contents=>contents===settings.webContents});
  if(!delayed)await ai.fixtureMCP.ready;
  return selected;
 };
 const observations=[];
 // Delayed controller readiness cannot authorize a new configuration document.
 for(const[name,channel,args,window]of[
  ['mcpReadyReload','ai-mcp',selected=>['update',{enabled:true,port:selected}],host],
  ['agentReadyReload','ai-personal-agents',()=>[{action:'connect',id:'hermes'}],settings],
 ]){
  const held=defer(),selected=await fresh(held.promise);dialog.showMessageBox=async()=>({response:1});
  const pending=outcome(call(channel,args(selected),window));await reload(window);held.resolve();const result=await pending;
  assert.equal(result.accepted,phase==='before',name+': '+JSON.stringify(result));
  assert.equal(ai.fixtureMCP.status().running,phase==='before',name);
  const changed=fs.readFileSync(agentFile(),'utf8')!==initial;
  if(channel==='ai-personal-agents')assert.equal(changed,phase==='before');
  observations.push({name,accepted:result.accepted,running:ai.fixtureMCP.status().running,agentConfigChanged:changed,error:result.error});
 }
 // Hold actual listen completion while the socket is already bound. Send real
 // SDK initialize/list-tools traffic during that hold, then revoke the request.
 for(const[name,window,change]of[
  ['mcpListeningHostReload',host,()=>reload(host)],
  ['mcpListeningSettingsReload',settings,()=>reload(settings)],
  ['mcpListeningHumanTakeover',settings,()=>call('ai-takeover')],
 ]){
  const selected=await fresh();listenHold={entered:defer(),release:defer()};const held=listenHold;
  const pending=outcome(call('ai-mcp',['update',{enabled:true,port:selected}],window));await held.entered.promise;
  const config=JSON.parse(fs.readFileSync(settingsFile(),'utf8'));
  const client=new Client({name:'ownership-fixture',version:'1'});let clientAccepted=false;
  try{await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+selected+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+config.token}}}));await client.listTools();const toolResult=await client.callTool({name:'list_tabs',arguments:{}});assert.equal(toolResult.isError,undefined);clientAccepted=true;executed+=1;}catch{}finally{await client.close().catch(()=>{});}
  assert.equal(clientAccepted,phase==='before',name+' pending listener access');
  await change();held.release.resolve();const result=await pending;listenHold=undefined;
  assert.equal(result.accepted,phase==='before',name+': '+JSON.stringify(result));assert.equal(ai.fixtureMCP.status().running,phase==='before',name);
  const saved=JSON.parse(fs.readFileSync(settingsFile(),'utf8'));assert.equal(saved.enabled,phase==='before',name+' persisted enablement');
  if(phase==='after'){assert.equal(saved.token===config.token,false);assert.deepEqual(saved.agentTokens,{});}
  const paused=fs.existsSync(path.join(userData,'ai-external-paused'));if(name.includes('Takeover'))assert.equal(paused,phase==='after');
  observations.push({name,accepted:result.accepted,pendingClientAccepted:clientAccepted,running:ai.fixtureMCP.status().running,persistedEnabled:saved.enabled,paused,error:result.error});
 }
 // Picker and explicit replace/remove reviews retain the requesting document.
 for(const[name,action,window,serviceDisposal]of[
  ['agentPickerReload','locate',settings],['agentPickerServiceDisposed','locate',settings,true],['agentConnectReviewReload','connect',host],['agentDisconnectReviewReload','disconnect',settings],
 ]){
  await fresh();const held={entered:defer(),release:defer()};
  if(action==='locate')dialog.showOpenDialog=()=>{held.entered.resolve();return held.release.promise;};
  else dialog.showMessageBox=()=>{held.entered.resolve();return held.release.promise;};
  const pending=outcome(call('ai-personal-agents',[{action,id:'hermes'}],window));await held.entered.promise;if(serviceDisposal){dispose();dispose=undefined;}else await reload(window);
  held.release.resolve(action==='locate'?{canceled:false,filePaths:[agentFile()]}:{response:1});const result=await pending;
  assert.equal(result.accepted,phase==='before',name+': '+JSON.stringify(result));
  const changed=fs.readFileSync(agentFile(),'utf8')!==initial,registered=fs.existsSync(registry());
  if(action==='locate')assert.equal(registered,phase==='before');else assert.equal(changed,phase==='before');
  if(phase==='after'){assert.equal(ai.fixtureMCP.status().running,false);assert.equal(ai.fixtureMCP.agentConnection('hermes'),undefined);assert.equal(fs.readdirSync(process.env.HERMES_HOME).length,1);}
  observations.push({name,accepted:result.accepted,agentConfigChanged:changed,registryCreated:registered,running:ai.fixtureMCP.status().running,error:result.error});if(serviceDisposal)await ai.fixtureMCP.dispose();
 }
 // Competing token rotation cannot write an already-revoked agent credential.
 const selected=await fresh();const held={entered:defer(),release:defer()};dialog.showMessageBox=()=>{held.entered.resolve();return held.release.promise;};
 const connecting=outcome(call('ai-personal-agents',[{action:'connect',id:'hermes'}]));await held.entered.promise;
 const competing=await outcome(call('ai-mcp',['update',{enabled:true,port:selected,rotate:true}],settings));
 assert.equal(competing.accepted,phase==='before');held.release.resolve({response:1});const connected=await connecting;assert.equal(connected.accepted,true);
 const expected=ai.fixtureMCP.agentConnection('hermes'),configText=fs.readFileSync(agentFile(),'utf8');
 const liveCredential=!!expected&&configText.includes(expected.mcpServers.kudiumbrowser.headers.Authorization);assert.equal(liveCredential,phase==='after');
 observations.push({name:'competingTokenRotation',competingAccepted:competing.accepted,agentConfigHasLiveCredential:liveCredential});
 // Normal update/agent disconnect/locate remain usable, including a settings
 // window after the browser host closes.
 const normal=[];await fresh();dialog.showMessageBox=async()=>({response:1});
 const enabled=await call('ai-mcp',['update',{enabled:true,port:await port()}]);assert.equal(enabled.running,true);normal.push('enable');
 await call('ai-personal-agents',[{action:'connect',id:'hermes'}]);assert.ok(ai.fixtureMCP.agentConnection('hermes'));normal.push('connect');
 await call('ai-personal-agents',[{action:'disconnect',id:'hermes'}]);assert.equal(ai.fixtureMCP.agentConnection('hermes'),undefined);normal.push('disconnect');
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[agentFile()]});host.destroy();
 await call('ai-personal-agents',[{action:'locate',id:'hermes'}],settings);normal.push('settingsAfterHostClose');
 const output=path.join(root,'docs/benchmarks/mcp-ownership.json'),report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};
 report[phase]={recordedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,electron:process.versions.electron,probeSha256:hash(fs.readFileSync(__filename)),runtimeBundleSha256:hash(fs.readFileSync(bundle)),sourceHashes:Object.fromEntries(files.map(file=>[file,hash(source(file))])),dependencyHashes:Object.fromEntries(Object.keys(build.metafile.inputs).filter(file=>file.startsWith('src/')&&!files.includes(file)).map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),normal,cases:observations,scope:'Actual AI/controller/agent handlers, native same-URL main-frame reloads, real loopback listener/SDK initialize and list-tools, isolated configuration/registry/backups. Test-only exports expose the real controller and schedule beforeStart; Node listen completion and native dialog results are held. No stubs for controller/config mutation. Not production preload serialization, actual external agent integration, model tool/private-data traffic, physical human-input/OS-auth, signed distribution or whole-app performance.'};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase,normal,cases:observations}));
 dispose();dispose=undefined;await ai.fixtureMCP.dispose();settings.destroy();app.exit(0);
}
const timeout=setTimeout(()=>{console.error('MCP ownership test timed out');app.exit(1)},45000);
run().catch(error=>{console.error(error);listenHold?.release.resolve();dispose?.();host?.destroy();settings?.destroy();app.exit(1)});
app.on('will-quit',()=>{clearTimeout(timeout);net.Server.prototype.listen=originalListen;fs.rmSync(temporary,{recursive:true,force:true})});
