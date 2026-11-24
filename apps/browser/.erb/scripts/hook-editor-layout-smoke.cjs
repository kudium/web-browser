// Measure production React editor layouts in Chromium; mock only CodeMirror content.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kudium-hook-layout-'));
app.setPath('userData',temporary);
const build = require('esbuild').build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {Theme} from '@radix-ui/themes';import {HookEditor} from './src/components/UI/HookEditor';export function render(action){return renderToStaticMarkup(<Theme><main className="site-developer-page"><div className="site-developer-code-pane"><HookEditor disabled={false} onChange={()=>{}} code={{before:'',after:action?'':'log("Ready");',css:'',actions:[{id:'page',name:'Page action',contexts:['page'],source:'return context.title;'},{id:'other',name:'Other action',contexts:['selection'],source:'return context.selection;'}]}}/></div></main></Theme>);}`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',outfile:path.join(temporary,'render.cjs'),plugins:[{name:'editor-fixture',setup(build){build.onLoad({filter:/CodeEditor\.tsx$/},()=>({contents:`import React from 'react';export function CodeEditor(){return <div className="site-hook-code"><div className="cm-editor"><div className="cm-scroller">CodeMirror content</div></div></div>}`,loader:'tsx'}));build.onLoad({filter:/HookPresets\.tsx$/},()=>({contents:`import React from 'react';export function HookPresets(){return <button>Examples</button>}`,loader:'tsx'}));}}]});

const css=fs.readFileSync('src/renderer/index.css','utf8').replace(/^@import[^;]+;/,'');
const theme=fs.readFileSync(require.resolve('@radix-ui/themes/styles.css'),'utf8');
app.whenReady().then(async()=>{
 await build;
 const {render}=require(path.join(temporary,'render.cjs'));
 const window=new BrowserWindow({show:false});
 try{
  for(const width of [420,1000]){
   const results=[];
   for(const height of [650,950])for(const action of [false,true]){
    window.setContentSize(width,height);
    await window.loadURL('data:text/html,'+encodeURIComponent(`<style>${theme}\n${css}\nhtml,body,#root,.radix-themes{height:100%;margin:0}.site-developer-page{height:100%;display:flex;flex-direction:column}.site-developer-code-pane{height:100%;min-height:0}</style>${render(action)}`));
    const result=await window.webContents.executeJavaScript(`(()=>{const code=document.querySelector('.site-hook-editor-body:not([hidden]):not([data-state="inactive"]) .site-hook-code'),r=code.getBoundingClientRect();return{bottom:r.bottom,height:r.height,cardHeight:document.querySelector('.hook-action-list-item')?.getBoundingClientRect().height||0,innerHeight}})()`);
    results.push({action,windowHeight:height,...result});
   }
   console.log(width,JSON.stringify(results));
   for(const height of [650,950]){
    const plain=results.find(r=>!r.action&&r.windowHeight===height),actions=results.find(r=>r.action&&r.windowHeight===height);
    assert(Math.abs(plain.bottom-actions.bottom)<=2,'Actions and script editor bottom edges align');
    assert(actions.cardHeight<85,'Action cards keep content height');
   }
   const small=results.filter(r=>r.innerHeight===650),large=results.filter(r=>r.innerHeight===950);
   for(let i=0;i<2;i++)assert(Math.abs((large[i].height-small[i].height)-300)<=2,'Both editors grow with window height');
  }
  console.log('PASS editor bottom alignment, responsive growth and compact action cards at narrow and wide widths.');
 }finally{window.destroy()}
}).then(()=>app.quit()).catch(error=>{console.error(error);app.exit(1)});
app.on('will-quit',()=>fs.rmSync(temporary,{recursive:true,force:true}));
