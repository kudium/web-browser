// Captures production native toast overlays over the fictional Atlas Studio fixture.
const {app,BrowserWindow,nativeTheme}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {execFileSync}=require('child_process');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kudium-toast-photo-'));
app.setPath('userData',temporary);
require('esbuild').buildSync({entryPoints:['src/main/appToast.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(temporary,'toast.cjs')});
const {showAppToast}=require(path.join(temporary,'toast.cjs'));
const out=path.resolve('../web/public/product/demo');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  nativeTheme.themeSource='light';
  const owner=new BrowserWindow({show:true,width:820,height:580,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const checks=[];
  try {
    await owner.loadFile(path.resolve('demo/atlas-studio/public/index.html'));
    owner.focus();await wait(500);
    async function capture(name,expected){
      const windows=owner.getChildWindows().filter(w=>w.isVisible());
      const texts=await Promise.all(windows.map(w=>w.webContents.executeJavaScript('document.body.innerText')));
      for(const text of expected)assert(texts.some(body=>body.includes(text)),`Missing ${text}`);
      for(const w of windows)assert.equal(await w.webContents.executeJavaScript('document.documentElement.scrollHeight>innerHeight'),false,'No clipped toast');
      await wait(250);
      const b=owner.getContentBounds();
      const target=path.join(out,name+'.png');
      fs.writeFileSync(target,(await owner.webContents.capturePage()).toPNG());
      const layers=[];
      for(const w of windows){
        const file=path.join(temporary,name+'-'+layers.length+'.png');
        fs.writeFileSync(file,(await w.webContents.capturePage()).toPNG());
        const bounds=w.getBounds();
        layers.push({file,x:bounds.x-b.x,y:bounds.y-b.y,width:bounds.width,height:bounds.height});
      }
      const config=path.join(temporary,'layers.json');
      fs.writeFileSync(config,JSON.stringify({target,width:b.width,layers}));
      execFileSync('python3',['-c',"import json,sys; from PIL import Image; c=json.load(open(sys.argv[1])); im=Image.open(c['target']).convert('RGBA'); scale=im.width/c['width'];\nfor layer in c['layers']:\n pic=Image.open(layer['file']).convert('RGBA').resize((round(layer['width']*scale),round(layer['height']*scale))); im.alpha_composite(pic,(round(layer['x']*scale),round(layer['y']*scale)))\nim.convert('RGB').save(c['target'])",config]);
      checks.push({image:name+'.png',expectedText:expected,verified:true,source:'Production native appToast overlays, fictional Atlas Studio local fixture, disposable profile; Electron renderer captures composited at actual native window bounds; system backdrop blur is not represented by renderer capture.'});
    }
    for(const toast of [
      {id:'info',type:'info',title:'Information',message:'Atlas Studio preview is ready.'},
      {id:'warn',type:'warn',title:'Low battery',message:'20% remaining. Connect your charger.',action:{label:'Save energy',run:()=>{}}},
      {id:'success',type:'success',title:'Saved',message:'Your launch checklist was saved.'}
    ])await showAppToast(owner,{...toast,durationMs:60000});
    await capture('toast-stack',['Information','Low battery','Saved','Dismiss all','Save energy']);
    for(const w of owner.getChildWindows())w.destroy();
    await showAppToast(owner,{id:'error',type:'error',title:'Could not save',message:'Try saving your Atlas Studio checklist again.',durationMs:60000,action:{label:'Try again',run:()=>{}}});
    await capture('toast-error',['Could not save','Try again']);
    for(const name of ['toast-stack','toast-error'])execFileSync('python3',['-c',"from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2],quality=93)",path.join(out,name+'.png'),path.join(out,name+'.webp')]);
    const manifestPath=path.join(out,'manifest.json');
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    manifest.checks=manifest.checks.filter(check=>!['toast-stack.png','toast-error.png'].includes(check.image)).concat(checks);
    manifest.toastUpdatedAt=new Date().toISOString();
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    console.log('PASS photographed toast stack and error/action; verified text, clipping and WebP derivatives');
  }finally{owner.destroy();}
}).then(()=>app.quit()).catch(error=>{console.error(error);app.exit(1)});
app.on('will-quit',()=>fs.rmSync(temporary,{recursive:true,force:true}));
