// Interactive native save-picker fixture. Drive only its titled window with CUA.
const {app,BrowserWindow,WebContentsView,ipcMain,dialog}=require('electron');
const fs=require('fs');const path=require('path');const os=require('os');const http=require('http');const assert=require('assert');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-save-dialog-'));app.setPath('userData',root);app.setName('TouchBox Save Test');
const build=require('esbuild').buildSync;
build({entryPoints:['src/main/ai.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(root,'ai.cjs')});
build({entryPoints:['src/main/downloads.ts'],bundle:true,platform:'node',external:['electron','./preferences'],outfile:path.join(root,'downloads.cjs')});
fs.writeFileSync(path.join(root,'preferences.js'),`exports.getBrowserPreferences=()=>({askDownloadLocation:true,downloadDirectory:${JSON.stringify(root)}});`);
fs.writeFileSync(path.join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{mcp:(action,patch)=>ipcRenderer.invoke('ai-mcp',action,patch)});`);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));const report=value=>fs.writeSync(1,JSON.stringify(value)+'\n');
const decode=result=>{assert(!result.isError,JSON.stringify(result));return JSON.parse(result.content.find(part=>part.type==='text').text)};
let server,host,dispose,client;let requests=0;
const deadline=setTimeout(()=>{report({error:'Native picker fixture timed out'});app.exit(1)},240000);deadline.unref();
(async()=>{
 await app.whenReady();
 server=http.createServer((req,res)=>{if(req.url==='/download'){requests+=1;res.setHeader('Content-Disposition','attachment; filename=suggested.txt');res.end('Native save artifact');return;}res.setHeader('Content-Type','text/html');res.end('<title>TouchBox Save Test</title><h1>TouchBox Save Test</h1><a href="/download">Download fixture</a><input type="file" aria-label="Reattach saved file">');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 host=new BrowserWindow({show:true,title:'TouchBox Save Test',webPreferences:{preload:path.join(root,'preload.cjs')}});
 await host.loadURL('data:text/html,<title>TouchBox Save Test</title><h1>Disposable native save test</h1>');
 const view=new WebContentsView();host.contentView.addChildView(view);view.setBounds({x:0,y:0,width:720,height:450});await view.webContents.loadURL(url);
 const downloads=require(path.join(root,'downloads.cjs'));downloads.bindDownloadSource(view.webContents,'save-test');downloads.trackDownloads(view.webContents.session);
 dispose=require(path.join(root,'ai.cjs')).registerAI(host,{tabs:()=>[{id:'first',url,name:'Save test'}],focused:()=> 'first',contents:id=>id==='first'?view.webContents:undefined,downloads:downloads.getDownloadsForContents});
 dialog.showMessageBox=async()=>({response:1});
 const evaluate=code=>host.webContents.executeJavaScript(code);
 await evaluate(`fixture.mcp('update',{enabled:true,port:${port}})`);const connection=(await evaluate(`fixture.mcp('connection')`)).mcpServers.touchbox;
 client=new Client({name:'native-save-test',version:'1'},{capabilities:{}});await client.connect(new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers:connection.headers}}));
 const trigger=async()=>{const found=decode(await client.callTool({name:'find_element',arguments:{tabId:'first',label:'Download fixture',role:'link'}}));return client.callTool({name:'click',arguments:{tabId:'first',elementId:found.elementId,snapshotId:found.snapshotId}})};
 host.focus();view.webContents.focus();
 const clicking=trigger();
 let record;
 for(let attempt=0;attempt<100&&!record;attempt+=1){record=downloads.getDownloadsForContents(view.webContents).find(item=>item.awaitingSaveLocation);if(!record)await sleep(50)}
 assert(record,'Native picker must be represented before a destination is selected');
 report({stage:'CHOOSE_SAVE',window:'TouchBox Save Test',defaultDirectory:root,saveName:'chosen-test.txt',downloadId:record.id});
 decode(await clicking);
 report({stage:'WAITING_ON_ORIGINAL_DOWNLOAD'});
 let artifact;
 for(let attempt=0;attempt<3;attempt+=1){artifact=decode(await client.callTool({name:'get_download',arguments:{tabId:'first',downloadId:record.id,timeoutMs:30000}}));if(artifact.available||!artifact.active)break;}
 assert(artifact.available,JSON.stringify(artifact));assert.equal(path.basename(artifact.file.path),'chosen-test.txt');assert.equal(fs.readFileSync(artifact.file.path,'utf8'),'Native save artifact');assert.equal(requests,1);
 const target=decode(await client.callTool({name:'find_element',arguments:{tabId:'first',label:'Reattach saved file'}}));
 const uploaded=decode(await client.callTool({name:'upload_files',arguments:{tabId:'first',elementId:target.elementId,snapshotId:target.snapshotId,paths:[artifact.file.path]}}));assert.equal(uploaded.files[0].name,'chosen-test.txt');
 assert.equal(await view.webContents.executeJavaScript(`document.querySelector('input').files[0].text()`),'Native save artifact');
 report({stage:'SAVED_AND_REATTACHED',sameDownloadId:record.id,requests});
 const cancelledClick=trigger();let cancelled;
 for(let attempt=0;attempt<100&&!cancelled;attempt+=1){cancelled=downloads.getDownloadsForContents(view.webContents).find(item=>item.id!==record.id&&item.awaitingSaveLocation);if(!cancelled)await sleep(50)}
 assert(cancelled);report({stage:'CANCEL_SAVE',window:'TouchBox Save Test'});decode(await cancelledClick);
 for(let attempt=0;attempt<1800&&downloads.getDownloadsForContents(view.webContents).find(item=>item.id===cancelled.id).active;attempt+=1)await sleep(50);
 const cancelledReceipt=decode(await client.callTool({name:'get_download',arguments:{tabId:'first',downloadId:cancelled.id}}));assert.equal(cancelledReceipt.state,'cancelled');assert(!cancelledReceipt.available&&!cancelledReceipt.awaitingSaveLocation);
 await client.close();dispose();host.destroy();server.close();clearTimeout(deadline);
 report({stage:'PASS',checks:'real native save destination, same-download wait, verified bytes, native reattachment, cancellation',electron:process.versions.electron,chrome:process.versions.chrome});fs.rmSync(root,{recursive:true,force:true});app.exit(0);
})().catch(error=>{report({error:error.stack});dispose?.();host?.destroy();server?.close();app.exit(1)});
