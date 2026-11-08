// Actual favicon callback source, Electron Session.fetch, real native image decoding.
const { app, session, nativeImage } = require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert'),ts=require('typescript');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'touchbox-favicon-'));app.setPath('userData',root);
const source=fs.readFileSync(process.env.TOUCHBOX_FAVICON_SOURCE || 'src/main/electronBrowser.ts','utf8');
const parsed=ts.createSourceFile('electronBrowser.ts',source,ts.ScriptTarget.Latest,true);let callback;
function find(node){if(ts.isCallExpression(node)&&node.expression.name?.text==='on'&&node.arguments[0]?.text==='page-favicon-updated'&&node.arguments[1]?.getText(parsed).includes('nativeImage'))callback=node.arguments[1];ts.forEachChild(node,find);}find(parsed);assert(callback);
const callbackProgram=ts.transpileModule('const handler='+callback.getText(parsed)+';', {compilerOptions:{target:ts.ScriptTarget.ES2022},transformers:{before:[context=>node=>{
 const visit=node=>ts.isVoidExpression(node)?ts.factory.createCallExpression(ts.factory.createIdentifier('track'),undefined,[ts.visitNode(node.expression,visit)]):ts.visitEachChild(node,visit,context);return ts.visitNode(node,visit);
}]}}).outputText;
require('esbuild').buildSync({entryPoints:['src/main/faviconLoader.ts'],bundle:true,platform:'node',outfile:path.join(root,'loader.cjs')});
const {FaviconLoader,validateFaviconDimensions}=require(path.join(root,'loader.cjs'));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVR4nO3OIQEAAAgDsOckJ/0gxs3E/JKdqxIQEBAQEBAQEBAQEBAQEGgHHuoPNHkTKkJmAAAAAElFTkSuQmCC','base64');
let largePNG,jpg;let server,active=0,peak=0,written=0,requests=0;
(async()=>{
 await app.whenReady();
 jpg=nativeImage.createFromBuffer(png).toJPEG(80);
 largePNG=nativeImage.createFromBuffer(png).resize({width:4096,height:4096}).toPNG();
 server=http.createServer((req,res)=>{
  requests++;active++;peak=Math.max(peak,active);let timer;res.on('close',()=>{active--;clearInterval(timer);clearTimeout(timer);});
  if(req.url.startsWith('/large-png')){written+=largePNG.length;res.end(largePNG);return;}
  if(req.url.startsWith('/healthy-jpg')){written+=jpg.length;res.end(jpg);return;}
  if(req.url.startsWith('/healthy')){timer=setTimeout(()=>{written+=png.length;res.end(png);},100);return;}
  const bytes=8*1024*1024;
  if(req.url.startsWith('/gzip')){const body=zlib.gzipSync(Buffer.alloc(bytes,1));res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',body.length);written+=body.length;res.end(body);return;}
  if(req.url.startsWith('/declared'))res.setHeader('Content-Length',bytes);
  let left=bytes;timer=setInterval(()=>{const size=Math.min(left,65536);written+=size;left-=size;res.write(Buffer.alloc(size,1));if(!left){clearInterval(timer);res.end();}},2);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;const results=[];
 for(const kind of ['declared','chunked','gzip','healthy-many','superseded','large-png','healthy-jpg']){
  active=0;peak=0;written=0;requests=0;let readBytes=0,arrayBufferBytes=0,decodes=0,published=0,activeFetches=0,peakFetches=0,maxReadChunkBytes=0;const tasks=[];const icons=new Map(),iconRequests=new Map(),loader=new FaviconLoader();
  const contents={isDestroyed:()=>false,session:{fetch:async(url,options)=>{
   activeFetches++;peakFetches=Math.max(peakFetches,activeFetches);let ended=false;const finish=()=>{if(!ended){ended=true;activeFetches--;}};
   let response;try{response=await session.defaultSession.fetch(url,options);}catch(error){finish();throw error;}
   return {ok:response.ok,headers:response.headers,arrayBuffer:async()=>{const buffer=await response.arrayBuffer();arrayBufferBytes+=buffer.byteLength;readBytes+=buffer.byteLength;finish();return buffer;},body:response.body&&{cancel:async()=>{await response.body.cancel();finish();},getReader:()=>{const reader=response.body.getReader();return {read:async()=>{const result=await reader.read();readBytes+=result.value?.byteLength||0;maxReadChunkBytes=Math.max(maxReadChunkBytes,result.value?.byteLength||0);if(result.done)finish();return result;},cancel:async()=>{await reader.cancel();finish();},releaseLock:()=>reader.releaseLock()};}}};
  }}};
  const build=new Function('contents','item','icons','iconRequests','faviconLoader','nativeImage','publish','browserView','validURL','track','validateFaviconDimensions',callbackProgram+'return handler;');
  const image={createFromBuffer:bytes=>{decodes++;return nativeImage.createFromBuffer(bytes);}};
  const count=['healthy-many','superseded'].includes(kind)?20:1;
  const started=performance.now();
  for(let index=0;index<count;index++){
   const id=kind==='superseded'?'same-tab':String(index);const handler=build(contents,{id},icons,iconRequests,loader,image,()=>{published++;},{},url=>/^http:/.test(url),task=>tasks.push(task),validateFaviconDimensions);
   handler({},[origin+'/'+(['healthy-many','superseded'].includes(kind)?'healthy':kind)+'?'+index]);
  }
  await Promise.all(tasks);
  const deadline=Date.now()+2000;while(active&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(active,0,'Previous fixture transports must stop before resetting counters');
  const baseline=process.env.TOUCHBOX_FAVICON_PHASE==='before';
  if(kind==='large-png'){assert.equal(decodes,baseline?1:0);assert.equal(published,baseline?1:0);}
  else if(kind==='healthy-jpg'){assert.equal(decodes,1);assert.equal(published,1);}
  else if(count===1){assert.equal(decodes,0);assert.equal(published,0);if(baseline)assert.equal(readBytes,8*1024*1024);else {assert.equal(arrayBufferBytes,0);assert(readBytes<=1024*1024+maxReadChunkBytes);}}
  else {assert.equal(published,kind==='superseded'?1:20);if(!baseline)assert(peak<=4);}
  results.push({case:kind,requests,peakClientFetches:peakFetches,peakServerRequests:peak,serverBytesWritten:written,decodedBodyBytesConsumed:readBytes,maxReadChunkBytes,arrayBufferBytesAllocated:arrayBufferBytes,nativeDecodes:decodes,published,elapsedMs:performance.now()-started});loader.clear();
 }
 const report={measuredAt:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,arch:process.arch,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),probeSHA256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),imageSizeVersion:JSON.parse(fs.readFileSync('node_modules/image-size/package.json','utf8')).version,loaderSHA256:crypto.createHash('sha256').update(fs.readFileSync('src/main/faviconLoader.ts')).digest('hex'),results,method:'Extracted actual production favicon event callback with its background promise tracked; actual Electron Session.fetch and nativeImage decoding. Synthetic HTTP responses, gzip decoding, 20 independent tabs or 20 superseding events. No personal profile.',limitations:['Server bytes written include network buffering; they are not exact bytes received by the client.','PNG/JPEG dimensions are preflighted, but a byte/header policy is not a hard bound on Chromium stream chunks, native decoder CPU, or whole-process RSS.','No whole-app CPU/RSS or tab-switch improvement is claimed.']};
 const file='docs/benchmarks/favicon-resources.json';const saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};const phase=process.env.TOUCHBOX_FAVICON_PHASE||'after';if(saved[phase])saved.confirmations=[...(saved.confirmations||[]),{phase,...report}];else saved[phase]=report;fs.writeFileSync(file,JSON.stringify(saved,null,2)+'\n');console.log('PASS favicon resources',JSON.stringify(report));server.close();fs.rmSync(root,{recursive:true,force:true});app.exit(0);
})().catch(error=>{console.error(error);server?.close();app.exit(1);});
