const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),assert=require('node:assert/strict');
const css=fs.readFileSync('src/renderer/index.css','utf8');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false});try{
for(const width of [420,1000]){
w.setContentSize(width,600);
const html=`<style>${css}</style><div id="root"><div class="workspace"><div class="browser-shell"><header class="browser-chrome"><div class="pane-tab-strips"><div class="session-tab-strip"><div class="horizontal-tabs"><button class="horizontal-tab" style="flex:0 0 190px">First</button></div></div></div></header><button id="clipped" style="position:absolute;left:1800px;top:900px">Offscreen focus</button></div></div></div>`;
await w.loadURL('data:text/html,'+encodeURIComponent(html));
const r=await w.webContents.executeJavaScript(`(()=>{const root=document.getElementById('root'),button=document.getElementById('clipped');root.style.overflow='hidden';button.focus();const control=root.scrollLeft>0||root.scrollTop>0;button.blur();root.scrollLeft=0;root.scrollTop=0;root.style.overflow='';button.focus();return{control,rootX:root.scrollLeft,rootY:root.scrollTop,bodyX:document.body.scrollLeft,htmlX:document.documentElement.scrollLeft};})()`);
assert(r.control,'Hidden-overflow control must reproduce app movement');
assert.equal(r.rootX,0);assert.equal(r.rootY,0);assert.equal(r.bodyX,0);assert.equal(r.htmlX,0);
}
console.log('PASS Electron: reproduced focus-driven shell scrolling; production root remains fixed at 420/1000px.');
}finally{w.destroy()}}).then(()=>app.quit()).catch(e=>{console.error(e);app.exit(1)});
