// Local deterministic provider + real Electron pages; no external API key required.
const { app, BrowserWindow, WebContentsView, ipcMain, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-ai-smoke-'));
app.setPath('userData', root);
require('esbuild').buildSync({ entryPoints: ['src/main/ai.ts'], bundle: true, minify: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'ai.cjs') });
fs.writeFileSync(path.join(root, 'preload.cjs'), `const { contextBridge, ipcRenderer } = require('electron');contextBridge.exposeInMainWorld('ai',{models:p=>ipcRenderer.invoke('ai-models',p),settings:p=>ipcRenderer.invoke('ai-settings',p),run:p=>ipcRenderer.invoke('ai-run',p),continue:()=>ipcRenderer.invoke('ai-resume'),status:()=>ipcRenderer.invoke('ai-task-status'),mcpStatus:()=>ipcRenderer.invoke('ai-mcp','status'),queue:p=>ipcRenderer.invoke('ai-queue',p||{action:'list'}),stop:()=>ipcRenderer.invoke('ai-stop'),takeOver:()=>ipcRenderer.invoke('ai-takeover'),resume:()=>ipcRenderer.invoke('ai-resume-external'),listen:()=>ipcRenderer.on('ai-event',(_,e)=>{window.events.push(e)})});window.events=[];ipcRenderer.on('ai-event',(_,e)=>{ipcRenderer.send('test-event',e)});ipcRenderer.on('browser-tab-request',(_,r)=>ipcRenderer.send('test-tab',r));`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const recoveryTest = process.argv.includes('--provider-recovery');
const visionTest = process.argv.includes('--vision');
const extractionTest = process.argv.includes('--extraction');
let extractionCaptured=false;let extractionVerified=false;
const handoffTest = process.argv.includes('--handoff');let handoffIssued=false;
let windowRecoveryStep=0;let windowRecoveryPaused=false;
let visionCaptured = false; let visionVerified = false;
let retryFaults=0;let retryBody;let recoveryStage=0;
const recoveryPlans=[['click',{tabId:'first',elementId:1}],['list_tabs',{}],['click',{tabId:'first',elementId:1}],['read_page',{tabId:'first'}]];
let step = 0; let port; let done; let approvals = 0;
let discoveryCalls = 0;
const plans = [
  ['list_tabs', {}], ['read_page', { tabId: 'first' }],
  ['type', { tabId: 'first', elementId: 0, text: 'KudiumBrowser test' }],
  ['click', { tabId: 'first', elementId: 1 }],
  ['read_page', { tabId: 'first' }],
  ['new_tab', {}], ['navigate', { tabId: 'first' }],
];
const server = http.createServer(async (req, res) => {
  if (req.url === '/v1/chat/completions') {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    // Chat-title generation is a separate non-tool request.
    if (!request.tools?.length) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'Fixture task'}}]}));
      return;
    }
    // Advanced tools are deferred. Exercise actual discovery before asserting
    // their schemas or issuing calls; preserve the action/retry step counters.
    const screenshot = request.tools.find(tool => tool.function.name === 'screenshot');
    if (!screenshot || (extractionTest && !request.tools.some(tool => tool.function.name === 'extract_rows'))) {
      assert(request.tools.some(tool => tool.function.name === 'discover_tools'));
      discoveryCalls += 1;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[{
        id:`discover-${discoveryCalls}`,type:'function',function:{name:'discover_tools',
          arguments:JSON.stringify(extractionTest ? {family:'advanced_interaction'} : {query:'screenshot'})}
      }]}}]}));
      return;
    }
    assert(request.messages.some(message => message.role === 'tool' && message.content.includes('screenshot')),
      'Deferred screenshot schema must follow a successful discovery result');
    assert.deepEqual(Object.keys(screenshot.function.parameters.properties),['tabId']);
    assert.deepEqual(request.tools.find(tool=>tool.function.name==='type').function.parameters.required,['elementId','text']);
    assert(!request.tools.find(tool=>tool.function.name==='read_page').function.parameters.properties.text);
    assert(['Bearer local-test-key', ...(windowRecoveryPaused ? ['Bearer new-session-key'] : [])].includes(req.headers.authorization));
    if(request.messages.some(message=>message.role==='user' && message.content==='Window recovery test')) {
      const recoveryPlans=windowRecoveryPaused ? [['list_tabs',{}],['read_page',{tabId:'first'}],['type',{tabId:'first',elementId:0,text:'Window recovered'}],['click',{tabId:'first',elementId:1}],['read_page',{tabId:'first'}]] : [['hand_off',{reason:'Reopen the browser window, then continue.'}]];
      const plan=recoveryPlans[windowRecoveryStep++];
      if(!windowRecoveryPaused) {windowRecoveryPaused=true;windowRecoveryStep=0;}
      if(windowRecoveryStep===5) assert(request.messages.some(message=>message.role==='tool' && message.content.includes('Entered text')));
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:plan?{role:'assistant',content:null,tool_calls:[{id:'window-'+windowRecoveryStep,type:'function',function:{name:plan[0],arguments:JSON.stringify(plan[1])}}]}:{role:'assistant',content:'Window recovery finished'}}]}));return;
    }
    if (request.messages.some((message) => message.role === 'user' && message.content === 'Stop test')) return;
    if (step === 3) assert(request.messages.some((message) => message.role === 'tool' && message.content.includes('Entered text')));
    if(step===3){
      if(retryBody===undefined)retryBody=body;else if(retryFaults < (recoveryTest ? 3 : 2)) assert.equal(body,retryBody,'Retry must preserve the latest successful tool results exactly');
      if(recoveryTest && retryFaults===3) assert(request.messages.some(message=>message.role==='user' && message.content.startsWith('Continue the original task')), 'Resume must require fresh browser observation');
      if(retryFaults<(recoveryTest ? 3 : 2)){retryFaults+=1;if(retryFaults===1){res.writeHead(503);res.end('Temporary provider failure');}else{req.socket.destroy();}return;}
    }

    if((recoveryTest || handoffTest) && step===3 && recoveryStage===1) assert(request.messages.some(message=>message.role==='tool' && message.content.includes('call list_tabs')), 'Stale click must be refused before approval');
    if((recoveryTest || handoffTest) && step===3 && recoveryStage===3) assert(request.messages.some(message=>message.role==='tool' && message.content.includes('read_page for this tab')), 'Listing alone must not authorize stale target');
    if(handoffTest && step===3 && handoffIssued && recoveryStage>0) assert(request.messages.some(message=>message.role==='tool' && message.content.includes('This action was not executed')), 'Actions after handoff must be recorded as unexecuted');
    if(handoffTest && step===3 && recoveryStage===4) assert(request.messages.some(message=>message.role==='tool' && message.content.includes('Human completed login')), 'Resume must observe the changed human-completed page');
    if (step === 5) assert(request.messages.some((message) => message.role === 'tool' && message.content.includes('Done KudiumBrowser test')));
    if(visionTest && visionCaptured) {
      const imageMessage=request.messages.find(message=>message.role==='user' && Array.isArray(message.content));
      assert(imageMessage,'Screenshot must reach provider as a multimodal message');
      const image=imageMessage.content.find(block=>block.type==='image_url');
      assert(image);const png=Buffer.from(image.image_url.url.split(',')[1],'base64');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      assert(request.messages.some(message=>message.role==='tool' && message.content.includes('captured')));visionVerified=true;
    }
    if(extractionTest && extractionCaptured) {assert(request.messages.some(message=>message.role==='tool' && message.content.includes('\"status\":\"Ready\"')),'Provider must receive structured extraction');extractionVerified=true;}
    const plan = extractionTest && step===3 && !extractionCaptured ? (extractionCaptured=true,['extract_rows',{tabId:'first',selector:'p',columns:[{name:'status'}]}]) : handoffTest && step===3 && !handoffIssued ? (handoffIssued=true,['hand_off',{reason:'Complete the login in this tab, then continue.'}]) : visionTest && step===3 && !visionCaptured ? (visionCaptured=true,['screenshot',{tabId:'first'}]) : (recoveryTest || handoffTest) && step===3 && recoveryStage<recoveryPlans.length ? recoveryPlans[recoveryStage++] : plans[step++];
    res.setHeader('Content-Type', 'application/json');
    const calls=plan?[{id:`call-${step}-${recoveryStage}`,type:'function',function:{name:plan[0],arguments:JSON.stringify({...plan[1],...(['new_tab','navigate'].includes(plan[0])?{url:`http://127.0.0.1:${port}/second`}:{})})}}]:[];
    if(plan?.[0]==='hand_off')calls.push({id:'must-not-run',type:'function',function:{name:'click',arguments:JSON.stringify({tabId:'first',elementId:1})}});
    res.end(JSON.stringify({choices:[{message:plan?{role:'assistant',content:null,tool_calls:calls}:{role:'assistant',content:'Completed local browser task.'}}]}));
    return;
  }
  if (req.url === '/v1/models') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'test'},{id:'test-other'}]}));return;}
  res.setHeader('Content-Type', 'text/html');
  res.end('<input aria-label="Name"><button onclick="document.querySelector(\'p\').textContent=\'Done \'+document.querySelector(\'input\').value">Apply</button><p>Ready</p>');
});
(async () => {
  await app.whenReady();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); port = server.address().port;
  const host = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'preload.cjs'), contextIsolation: true } });
  const views = new Map(); const tabs = [{ id: 'first', name: 'Test', url: `http://127.0.0.1:${port}/`, icon: '', sessionId: 'shared-test' }];
  const view = new WebContentsView({ webPreferences: { partition: 'persist:shared-test' } }); views.set('first', view);
  if(visionTest) { host.contentView.addChildView(view); view.setBounds({x:0,y:0,width:760,height:500}); }
  await view.webContents.loadURL(tabs[0].url);
  let focused = 'first';
  let settingsContents;
  await require(path.join(root, 'ai.cjs')).initializeLocalStorage();
  const dispose = require(path.join(root, 'ai.cjs')).registerAI(host, { settingsWindow: (contents) => contents === settingsContents, tabs: () => tabs, focused: () => focused, contents: (id) => views.get(id)?.webContents });
  ipcMain.on('test-tab', async (_event, request) => {
    if (request.action === 'create') {
      tabs.push(request.app); focused = request.app.id;
      const created = new WebContentsView({ webPreferences: { partition: 'persist:shared-test' } });
      views.set(focused, created); await created.webContents.loadURL(request.app.url);
    }
  });
  const completed = new Promise((resolve) => { done = resolve; });
  const events = []; ipcMain.on('test-event', (_event, event) => { events.push(event); if (event.type === 'done') done(); });
  dialog.showMessageBox = async () => { approvals += 1; return { response: 1 }; };
  await host.loadURL('data:text/html,<h1>AI smoke</h1>');
  const evaluate = (code) => host.webContents.executeJavaScript(code);
  await evaluate(`ai.settings({endpoint:'http://127.0.0.1:${port}/v1',model:'test',key:'local-test-key',remember:false})`);
  assert(!fs.readFileSync(path.join(root, 'ai-settings.json'), 'utf8').includes('local-test-key'));
  assert.deepEqual(await evaluate(`ai.models()`),['test','test-other']);
  await evaluate(`ai.run('Complete the local test')`);
  await Promise.race([completed, sleep(15000).then(() => { throw new Error('AI run timed out'); })]);
  if(recoveryTest || handoffTest) {
    assert.equal(approvals,1,'Exhaustion must not execute the next browser action');
    assert(events.some(event=>(event.type===(handoffTest?'handoff':'error')) && event.resumable));
    if(handoffTest) {
      const beforeReload=await evaluate('ai.status()');assert(beforeReload.resumable && !beforeReload.busy);
      await host.loadURL('data:text/html,<h1>Reloaded AI sidebar host</h1>');
      assert.deepEqual(await evaluate('ai.status()'),beforeReload,'Renderer reload must preserve task status without exposing conversation or key');
    }
    if(handoffTest) await view.webContents.executeJavaScript(`document.querySelector('p').textContent='Human completed login';undefined`);
    const recovered=new Promise(resolve=>{done=resolve;});
    await evaluate('ai.continue()');
    await Promise.race([recovered,sleep(15000).then(()=>{throw new Error('Recovery timed out');})]);
  }
  // The provider assertions above inspect both refused stale calls; its later
  // read_page assertion verifies the actual eventual click changed the DOM.
  if(recoveryTest || handoffTest) assert.equal(recoveryStage,4);
  if(visionTest) {assert(visionVerified);assert(!events.some(event=>event.text?.includes('data:image/png;base64')),'Sidebar must not receive raw image payloads');}
  if(extractionTest) assert(extractionVerified);
  assert(discoveryCalls > 0, 'Provider must discover deferred tools');
  assert.equal(approvals, 2); assert.equal(tabs.length, 2);
  assert.equal(retryFaults,recoveryTest ? 3 : 2);assert.equal(events.filter(event=>event.text?.startsWith('Retrying AI connection')).length,2,'Transient provider errors must recover within the original task');
  assert.equal(views.get(tabs[1].id).webContents.session, view.webContents.session);
  assert(events.some((event) => event.text === 'Completed local browser task.'));
  assert.equal(events.filter(event=>event.type==='error').length,recoveryTest ? 1 : 0,JSON.stringify(events));
  assert(await evaluate('ai.continue().then(()=>false,()=>true)'), 'Consumed checkpoint must not replay the task');
  const stopped = new Promise((resolve) => { done = resolve; });
  await evaluate(`ai.run('Stop test')`);
  assert.equal(await evaluate(`ai.run('Concurrent test')`),false,'Busy chat accepts the second task into its queue');
  const queued = await evaluate('ai.queue()');
  assert.equal(queued.messages.length,1);
  assert(!events.some(event=>event.text==='Concurrent test'),'Queued task must not execute concurrently');
  await evaluate(`ai.takeOver()`);
  await Promise.race([stopped, sleep(3000).then(() => { throw new Error('Stop timed out'); })]);
  assert(events.some((event) => event.text === 'Task paused. Continue when ready.' && event.resumable));
  assert((await evaluate('ai.status()')).resumable, 'Takeover must preserve a checkpoint');
  assert((await evaluate('ai.queue()')).paused,'Takeover must pause queued messages');
  await evaluate(`ai.queue({action:'remove',id:${JSON.stringify(queued.messages[0].id)}})`);
  // Foreign frames/windows cannot access the key or run tasks.
  const outsider = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'preload.cjs') } });
  await outsider.loadURL('data:text/html,outsider');
  assert(await outsider.webContents.executeJavaScript(`ai.settings().then(()=>false,()=>true)`));
  assert(await outsider.webContents.executeJavaScript(`ai.status().then(()=>false,()=>true)`),'Foreign windows cannot inspect task status');
  assert(await outsider.webContents.executeJavaScript(`ai.takeOver().then(()=>false,()=>true)`),'Foreign window cannot take over');
  assert(await outsider.webContents.executeJavaScript(`ai.resume().then(()=>false,()=>true)`),'Foreign window cannot resume external control');
  assert(await outsider.webContents.executeJavaScript(`ai.continue().then(()=>false,()=>true)`),'Foreign window cannot continue a task');
  settingsContents=outsider.webContents;
  assert(await outsider.webContents.executeJavaScript(`ai.continue().then(()=>false,()=>true)`),'Preferences cannot continue browser tasks');
  assert((await outsider.webContents.executeJavaScript(`ai.settings()`)).hasKey);
  assert(await outsider.webContents.executeJavaScript(`ai.run('no').then(()=>false,()=>true)`),'Preferences cannot run the browser');
  settingsContents=undefined;
  if(handoffTest) {
    const pausedForWindow=new Promise(resolve=>{done=resolve;});
    await evaluate(`ai.run('Window recovery test')`);await pausedForWindow;
    assert((await evaluate('ai.status()')).resumable);
  }
  await evaluate(`ai.settings({endpoint:'http://127.0.0.1:${port}/v1',model:'test',clear:true})`);
  assert(await evaluate(`ai.run('test').then(()=>false,()=>true)`));
  dispose(); views.forEach((item) => item.webContents.close()); host.destroy();
  settingsContents=outsider.webContents;
  await outsider.webContents.executeJavaScript(`ai.settings({endpoint:'http://127.0.0.1:${port}/v1',model:'test',key:'new-session-key',remember:false})`);
  assert((await outsider.webContents.executeJavaScript(`ai.settings()`)).hasKey,'Preferences must work after browser close');
  const replacement = new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'preload.cjs')}});
  const restored=new WebContentsView({webPreferences:{partition:'persist:shared-test'}});
  await restored.webContents.loadURL(`http://127.0.0.1:${port}/`);
  const restoredTabs=[{id:'first',name:'Restored',url:`http://127.0.0.1:${port}/`,sessionId:'shared-test'}];
  await require(path.join(root,'ai.cjs')).initializeLocalStorage();
  const disposeReplacement=require(path.join(root,'ai.cjs')).registerAI(replacement,{settingsWindow:(contents)=>contents===settingsContents,tabs:()=>restoredTabs,focused:()=> 'first',contents:()=>restored.webContents});
  await replacement.loadURL('data:text/html,replacement');
  assert((await replacement.webContents.executeJavaScript(`ai.settings()`)).hasKey,'Session-only key must survive browsing window recreation');
  if(handoffTest) {
    const restoredStatus=await replacement.webContents.executeJavaScript('ai.status()');assert(restoredStatus.resumable && !restoredStatus.busy);
    assert((await replacement.webContents.executeJavaScript('ai.mcpStatus()')).paused,'Human handoff pause must survive window recreation');
    const windowCompleted=new Promise(resolve=>{done=resolve;});await replacement.webContents.executeJavaScript('ai.continue()');
    await Promise.race([windowCompleted,sleep(10000).then(()=>{throw new Error('Window continuation timed out');})]);
    assert.equal(await restored.webContents.executeJavaScript(`document.querySelector('p').textContent`),'Done Window recovered');
    assert(events.some(event=>event.text==='Window recovery finished'));assert(!(await replacement.webContents.executeJavaScript('ai.status()')).resumable);
    assert((await replacement.webContents.executeJavaScript('ai.mcpStatus()')).paused,'Built-in continuation must not silently resume external AI');
    await replacement.webContents.executeJavaScript('ai.resume()');assert(!(await replacement.webContents.executeJavaScript('ai.mcpStatus()')).paused);
  }
  restored.webContents.close();disposeReplacement();replacement.destroy();outsider.destroy();
  console.log('PASS: real Electron page read/type/click, approval, navigation, shared-session new tab, local provider tool loop, session-only key, IPC isolation and key removal.');
  server.close(); fs.rmSync(root, { recursive: true, force: true }); app.exit(0);
})().catch((error) => { console.error(error); server.close(); app.exit(1); });
