// Verify that selection reveals only the tab strip, never its scrollable ancestors.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kudium-tab-scroll-'));
app.setPath('userData',temporary);
const code=require('esbuild').buildSync({entryPoints:['src/utils/horizontalTabScroll.ts'],bundle:true,platform:'browser',format:'iife',globalName:'tabs',write:false}).outputFiles[0].text;
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false});
 try{
  for(const width of [420,1000]){
   window.setContentSize(width,600);
   await window.loadURL('data:text/html,'+encodeURIComponent(`<style>body{margin:0}.workspace{height:140px;overflow:auto}.horizontal-tabs{width:300px;height:36px;overflow:auto;margin-top:220px}.track{display:flex;width:max-content}.horizontal-tab{flex:0 0 150px;height:32px}</style><div class="workspace"><div class="horizontal-tabs" data-overflow="scroll"><div class="track">${Array.from({length:6},(_,i)=>`<button class="horizontal-tab" id="tab-${i}">Tab ${i}</button>`).join('')}</div></div><div style="height:300px"></div></div><script>${code}</script>`));
   const result=await window.webContents.executeJavaScript(`(()=>{
    const parent=document.querySelector('.workspace'),list=document.querySelector('.horizontal-tabs'),last=document.getElementById('tab-5');
    last.scrollIntoView({block:'nearest',inline:'nearest'});
    const oldMovedParent=parent.scrollTop>0;
    parent.scrollTop=0;list.scrollLeft=0;
    tabs.revealHorizontalTab(last);
    const newLeft=list.scrollLeft,unchangedParent=parent.scrollTop===0;
    tabs.revealHorizontalTab(document.getElementById('tab-4'));
    const stableVisible=list.scrollLeft===newLeft;
    tabs.revealHorizontalTab(document.getElementById('tab-0'));
    const returnedLeft=list.scrollLeft===0;
    list.dataset.overflow='dropdown';tabs.revealHorizontalTab(last);
    return{oldMovedParent,newLeft,unchangedParent,stableVisible,returnedLeft,dropdownStill: list.scrollLeft===0};
   })()`);
   assert(result.oldMovedParent,'Control reproduces ancestor scroll with scrollIntoView');
   assert(result.newLeft>0&&result.unchangedParent&&result.stableVisible&&result.returnedLeft&&result.dropdownStill,'Selection stays local and stable: '+JSON.stringify(result));
  }
  console.log('PASS Chromium: reproduced ancestor movement, verified strip-only reveal, stable visible clicks and dropdown behavior at two widths.');
 }finally{window.destroy()}
}).then(()=>app.quit()).catch(error=>{console.error(error);app.exit(1)});
app.on('will-quit',()=>fs.rmSync(temporary,{recursive:true,force:true}));
