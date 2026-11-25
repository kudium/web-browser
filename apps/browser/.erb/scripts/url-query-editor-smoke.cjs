const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('docs/examples/url-query-editor.js','utf8');
const compiled=new module.constructor();compiled._compile(require('esbuild').buildSync({entryPoints:['src/main/hookPanelDocument.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,process.cwd()+'/panel-fixture.cjs');
app.whenReady().then(async()=>{
let output,handler,navigate;
const location={href:'https://example.com/path?a=one&a=two&empty=&city=New%20York#details',assign:value=>{location.href=value;}};
const context={panel:{onAction:(_,callback)=>{handler=callback;},show:async value=>{output=value;}},setTimeout:callback=>{navigate=callback;}};
await new (Object.getPrototypeOf(async function(){}).constructor)('context','location',source)(context,location);
assert.deepEqual(output.content.data.params,[['a','one'],['a','two'],['empty',''],['city','New York']]);
assert.throws(()=>handler({baseUrl:'https://changed.example',params:[]}),/changed/);
const result=handler({baseUrl:location.href,params:[['a','changed'],['a','again'],['new name','a&b'],['empty','']]});
const expected='https://example.com/path?a=changed&a=again&new+name=a%26b&empty=#details';
assert.equal(result.updatedUrl,expected);assert.equal(location.href,output.content.data.baseUrl);navigate();assert.equal(location.href,expected);
const w=new BrowserWindow({show:false});
try{
 const html=compiled.exports.hookPanelDocument(output).replace(/<style>[\s\S]*?<\/style>/, '<style>'+output.content.css+'</style>').replace('const bridge=window.kudiumHookPanel;',`window.kudiumHookPanel={onThemeChanged(){},onUpdate(fn){fn(${JSON.stringify(output)})},invoke:async(id,payload)=>{window.applied=payload;return{updatedUrl:'updated'}}};const bridge=window.kudiumHookPanel;`);
 await w.loadURL('data:text/html,'+encodeURIComponent(html));
 for(const width of [280,360,640,1000]){
 w.setContentSize(width,800);
 await w.webContents.executeJavaScript(`document.dispatchEvent(new Event('resize'));`);
 const layout=await w.webContents.executeJavaScript(`(()=>{const preview=document.getElementById('url-preview'),form=document.querySelector('.kudium-form');return{width:innerWidth,scroll:document.documentElement.scrollWidth,previewWidth:preview.getBoundingClientRect().width,formWidth:form.getBoundingClientRect().width,inputHeights:[...document.querySelectorAll('#query-rows input')].map(e=>e.getBoundingClientRect().height),labels:[...document.querySelectorAll('.kudium-field')].map(e=>getComputedStyle(e).display),applyDisabled:document.getElementById('apply-url').disabled}})()`);
 assert(layout.scroll<=layout.width&&layout.previewWidth>=layout.formWidth-33&&layout.inputHeights.every(h=>h===36)&&layout.labels.every(d=>d==='grid')&&layout.applyDisabled,JSON.stringify(layout));
 if(width===360)fs.writeFileSync('/tmp/kudium-query-editor-360.png',(await w.webContents.capturePage()).toPNG());
 }
 const r=await w.webContents.executeJavaScript(`(async()=>{const rows=document.getElementById('query-rows');rows.children[1].querySelector('button').click();document.getElementById('add-param').click();const last=rows.lastElementChild;last.querySelector('.param-name').value='new name';last.querySelector('.param-value').value='a&b';last.querySelector('input').dispatchEvent(new Event('input'));await document.getElementById('apply-url').onclick();return{payload:window.applied,preview:document.getElementById('url-preview').value,count:rows.children.length}})()`);
 assert.deepEqual(r.payload.params,[['a','one'],['empty',''],['city','New York'],['new name','a&b']]);assert(r.preview.endsWith('new+name=a%26b#details'));assert.equal(r.count,4);
 const reset=await w.webContents.executeJavaScript(`(()=>{document.getElementById('reset-params').click();return{count:document.getElementById('query-rows').children.length,disabled:document.getElementById('apply-url').disabled}})()`);assert.equal(reset.count,4);assert.equal(reset.disabled,true);
 console.log('PASS actual hook and native panel: decoded duplicates, edit/add/remove, encoding, fragment preservation, stale URL rejection Apply, Reset and self-contained responsive styles at 280/360/640/1000px.');
}finally{w.destroy();}
}).then(()=>app.quit()).catch(e=>{console.error(e);app.exit(1)});
