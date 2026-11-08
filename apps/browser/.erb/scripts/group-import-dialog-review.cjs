const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const esbuild = require('esbuild');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-import-dialog-'));
const out = path.join(project, 'docs/evidence/group-import-dialog');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',root);
esbuild.buildSync({entryPoints:[path.join(project,'src/main/dialogs.ts')],bundle:true,platform:'node',external:['electron'],outfile:path.join(root,'dialogs.cjs')});
const {dialogDocument} = require(path.join(root,'dialogs.cjs'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:true,width:540,height:640,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
 const pages=[{name:'Hocasa: Find a home, or fill one, without the back and forth.',url:'hocasa.app/',hooks:true},{name:'Hocasa: Find a home, or fill one, without the back and forth.',url:'hocasa.app/',hooks:true},{name:'Download Hocasa | Hocasa',url:'hocasa.app/download',hooks:true},{name:'Example Domain',url:'example.com',hooks:false},{name:'Just a moment…',url:'jiji.ng/',hooks:true}];
 const hooks=[{origin:'https://hocasa.app',source:'Before page load\nconsole.log("Loading Hocasa");\n\nStyles\nbody { color: #333; }\n\nNotify me · /download\nAfter page load\n'+ 'console.log("Download page loaded");\n'.repeat(20)},{origin:'https://jiji.ng',source:'After page load\nconsole.log("Ready");'}];
 for(const width of [540,360]) for(const theme of ['light','dark']){
  nativeTheme.themeSource=theme;win.setContentSize(width,640);
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(dialogDocument({message:'Import “hocafy2”?',detail:'5 tabs will be added as a new group. Logins and private data are not included.',buttons:['Import & Review','Cancel'],cancelId:1,importReview:{pages,hooks}})));
  for(const expanded of [false,true]){
   if(expanded)await win.webContents.executeJavaScript(`document.querySelector('.hook-review').open=true`);
   await pause(180);
   const check=await win.webContents.executeJavaScript(`(()=>{const f=document.querySelector('footer').getBoundingClientRect(),c=document.querySelector('.content');return {noOverflow:document.body.scrollWidth<=innerWidth&&c.scrollWidth<=c.clientWidth,footer:f.bottom<=innerHeight&&f.top>=0,pages:document.querySelectorAll('.import-pages li').length===5,preview:document.querySelectorAll('.hook-sources pre').length===2}})()`);
   assert(Object.values(check).every(Boolean),JSON.stringify({width,theme,expanded,check}));
   fs.writeFileSync(path.join(out,`${width}-${theme}-${expanded?'hooks':'pages'}.png`),(await win.webContents.capturePage()).toPNG());
  }
  const answer=win.webContents.executeJavaScript('window.dialogResult');
  await win.webContents.executeJavaScript(`document.getElementById('cancel').click()`);assert.equal(await answer,1);
 }
 win.destroy();fs.rmSync(root,{recursive:true,force:true});app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
