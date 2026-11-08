/* Native encrypted-vault actions and real synthetic website request bodies. */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), assert = require('assert/strict'), net = require('net');
const { app, BrowserWindow, WebContentsView, ipcMain, dialog, session } = require('electron');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const root = path.resolve(__dirname, '../..'), phase = process.argv[2] || 'after';
assert(['before', 'after'].includes(phase));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-private-fill-')); app.setPath('userData', temporary);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const source = fs.readFileSync(path.join(root, phase === 'before' ? 'docs/benchmarks/baselines/private-fill/ai.ts.txt' : 'src/main/ai.ts'), 'utf8');
const url = 'https://private-fill.fixture.test/', fact = 'synthetic-private-fill-73921';
const page = `<title>Private fill fixture</title><input name="occupation"><input type="file" id="document"><input type="file" id="chooserFile" style="display:none"><button onclick="if(confirm('Attach now?'))document.querySelector('#chooserFile').click()">Attach document</button><script>
document.querySelector('[name=occupation]').addEventListener('input', event => fetch('/receive', {method:'POST',body:event.target.value}));
document.querySelectorAll('[type=file]').forEach(input => input.addEventListener('change', async event => {if(event.target.files.length) await fetch('/receive', {method:'POST',body:await event.target.files[0].text()});}));
</script>`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let host, view, client, dispose, vault, received = [], scenario, reviews = 0, tabs;
const content = result => JSON.parse(result.content.find(block => block.type === 'text').text);
(async () => {
  await app.whenReady();
  const build = await require('esbuild').build({stdin:{contents:source+"\nexport {passwordVault,registerPasswordManager} from './passwordManager';",resolveDir:path.join(root,'src/main'),sourcefile:'ai.ts',loader:'ts'},bundle:true,minify:true,platform:'node',external:['electron'],outfile:path.join(temporary,'ai.cjs'),metafile:true});
  session.defaultSession.protocol.handle('https', async request => {
    if(new URL(request.url).pathname === '/receive') {received.push(await request.text()); return new Response('received');}
    return new Response(page, {headers:{'Content-Type':'text/html'}});
  });
  fs.writeFileSync(path.join(temporary,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('test',{mcp:(a,p)=>ipcRenderer.invoke('ai-mcp',a,p),permissions:m=>ipcRenderer.invoke('ai-permissions',m),stop:()=>ipcRenderer.invoke('ai-stop')});`);
  host = new BrowserWindow({show:false,width:700,height:500,webPreferences:{sandbox:true,contextIsolation:true,preload:path.join(temporary,'preload.cjs')}}); await host.loadURL('data:text/html,Private fill fixture');
  view = new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}); host.contentView.addChildView(view); view.setBounds({x:0,y:0,width:650,height:400}); await view.webContents.loadURL(url);
  const ai = require(path.join(temporary,'ai.cjs')); vault = ai.passwordVault(); vault.unlock('disposable private fill fixture credential',true);
  const record = {id:'private',title:'Synthetic profile',origin:'',kind:'profile',username:'',password:'',fields:[{name:'occupation',value:fact,secret:false}],notes:'',allowAI:true};
  const document = {...record,id:'document',kind:'knowledge',fields:[],document:{name:'synthetic-private.txt',mime:'text/plain',text:fact,content:Buffer.from(fact).toString('base64')}};
  vault.save(record); vault.save(document); ai.registerPasswordManager(()=>false,{authenticateOS:async()=>{}});
  tabs = [{id:'first',name:'Fixture',url,icon:'',sessionId:'fixture'}];
  await ai.initializeLocalStorage();
  dispose = ai.registerAI(host,{tabs:()=>tabs,focused:()=> 'first',contents:id=>id==='first'?view.webContents:undefined});
  const evaluate = code => host.webContents.executeJavaScript(code);
  const reserve = net.createServer(); await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve)); const port=reserve.address().port; await new Promise(resolve=>reserve.close(resolve));
  await evaluate(`test.mcp('update',{enabled:true,port:${port}})`); const connection=(await evaluate("test.mcp('connection')")).mcpServers.kudiumbrowser;
  client = new Client({name:'private-fill-fixture',version:'1'},{capabilities:{}}); await client.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
  const results = [];
  const cases = [
    {name:'normal approved fill',tool:'fill_personal_data',allow:true},
    {name:'declined fill',tool:'fill_personal_data',allow:false},
    {name:'fill same URL document replaced',tool:'fill_personal_data',mutate:async()=>view.webContents.loadURL(url)},
    {name:'fill consent changed and restored',tool:'fill_personal_data',mutate:async()=>{vault.save({...vault.edit('private'),allowAI:false});vault.save({...vault.edit('private'),allowAI:true});}},
    {name:'fill record changed',tool:'fill_personal_data',mutate:async()=>vault.save({...vault.edit('private'),fields:[{name:'occupation',value:fact+'-changed',secret:false}]})},
    {name:'fill profile replaced',tool:'fill_personal_data',mutate:async()=>{tabs[0].sessionProfileId='replacement';}},
    {name:'fill host document replaced',tool:'fill_personal_data',mutate:async()=>host.loadURL('data:text/html,Replacement host')},
    {name:'Stop during fill review',tool:'fill_personal_data',mutate:async()=>evaluate('test.stop()'),alreadyBlocked:true},
    {name:'normal approved document upload',tool:'attach_personal_document',allow:true},
    {name:'document consent changed and restored',tool:'attach_personal_document',mutate:async()=>{vault.save({...vault.edit('document'),allowAI:false});vault.save({...vault.edit('document'),allowAI:true});}},
    {name:'document host replaced',tool:'attach_personal_document',mutate:async()=>host.loadURL('data:text/html,Replacement host')},
    {name:'normal pending native document chooser',tool:'attach_personal_document',chooser:true},
    {name:'document revoked while native chooser action pending',tool:'attach_personal_document',chooser:true,pendingConsent:true},
    {name:'document revoked in second upload review',tool:'attach_personal_document',mode:'standard',at:2,mutate:async()=>vault.save({...vault.edit('document'),allowAI:false})},
  ];
  for(scenario of cases) {
    delete tabs[0].sessionProfileId; vault.save(record); vault.save(document); await view.webContents.loadURL(url); await evaluate(`test.permissions('${scenario.mode||'full'}')`); received=[]; reviews=0;
    dialog.showMessageBox = async (_owner,options) => { reviews++; if(reviews===(scenario.at||1)&&scenario.mutate) await scenario.mutate(); return {response:scenario.allow===false?0:1}; };
    let args={tabId:'first',recordId:scenario.tool==='fill_personal_data'?'private':'document'};
    if(scenario.tool==='attach_personal_document') {const snapshot=content(await client.callTool({name:'read_page',arguments:{tabId:'first',format:'detailed'}}));const element=snapshot.elements.find(item=>scenario.chooser?item.label==='Attach document':item.type==='file');assert(element,'File target missing');args={...args,elementId:element.id,snapshotId:snapshot.snapshotId};}
    let result=await client.callTool({name:scenario.tool,arguments:args});
    if(scenario.chooser){assert(!result.isError,JSON.stringify(result));const pending=content(result);assert(pending.pending&&pending.dialog.type==='confirm',JSON.stringify(pending));if(scenario.pendingConsent) vault.save({...vault.edit('document'),allowAI:false});result=await client.callTool({name:'handle_dialog',arguments:{tabId:'first',dialogId:pending.dialog.id,accept:true}});}
    // Wait for the website's real input/change handler to send its request body.
    for(let count=0;count<30 && !received.length && !result.isError;count++) await pause(20);
    const leaked=received.some(body=>body.includes(fact));
    const expected=scenario.allow!==false && !scenario.alreadyBlocked && (phase==='before'||(!scenario.mutate&&!scenario.pendingConsent));
    assert.equal(leaked,expected,JSON.stringify({case:scenario.name,result,received,reviews}));
    if(!expected) assert(result.isError,JSON.stringify(result));
    assert(!JSON.stringify(result).includes(fact),'Private values returned in tool output');
    results.push({case:scenario.name,reviews,accepted:!result.isError,privateWebsiteBodies:received.filter(body=>body.includes(fact)).length,error:result.isError?JSON.stringify(result).slice(0,500):undefined});
  }
  const dependencies=Object.keys(build.metafile.inputs).filter(file=>fs.existsSync(file));
  const report={recordedAt:new Date().toISOString(),phase,mainSourceSha256:hash(source),probeSha256:hash(fs.readFileSync(__filename)),dependencyHashes:Object.fromEntries(dependencies.map(file=>[file,hash(fs.readFileSync(file))])),electron:process.versions.electron,platform:process.platform,arch:process.arch,results,scope:'Actual registerAI through official local MCP client, encrypted disposable vault, real Electron DOM fill and native file selection. Synthetic HTTPS protocol website records actual input/change-handler request bodies; controlled native dialog responses reproduce revocations. No provider injection, signed-package or whole-app performance claim.'};
  const output=path.join(root,'docs/benchmarks/ai-private-fill.json');const reports=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};reports[phase]=report;fs.writeFileSync(output,JSON.stringify(reports,null,2)+'\n');console.log('PASS: '+phase+' native private-data fill/upload',JSON.stringify(results));
  await client.close();client=undefined;dispose();view.webContents.close();host.destroy();vault.lock();fs.rmSync(temporary,{recursive:true,force:true});app.exit(0);
})().catch(async error=>{console.error(error);try{await client?.close();dispose?.();view?.webContents.close();host?.destroy();}catch{}app.exit(1);});
