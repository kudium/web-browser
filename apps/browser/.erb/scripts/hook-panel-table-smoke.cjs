const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const code=require(process.cwd()+'/node_modules/esbuild').buildSync({entryPoints:['src/main/hookPanelDocument.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const compiled=new module.constructor();compiled._compile(code,process.cwd()+'/table-fixture.cjs');
const {hookPanelDocument,hookPanelPresentation}=compiled.exports;
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false});try{for(const width of [280,368,640,1000]){
w.setContentSize(width,700);
const output={id:'url',title:'URL',content:{type:'table',columns:['Part','Value'],rows:[['Full URL','https://example.com/'+ 'long-url-segment'.repeat(80)],['Hostname','example.com'],['Fragment','(none)']]}};
const html=hookPanelDocument(output).replace('const bridge=window.kudiumHookPanel;',`const bridge={onThemeChanged(){},onUpdate(fn){fn(${JSON.stringify(hookPanelPresentation(output))})}};`);
await w.loadURL('data:text/html,'+encodeURIComponent(html));
const r=await w.webContents.executeJavaScript(`(()=>{const t=document.querySelector('table'),l=t.rows[2].cells[0],v=t.rows[1].cells[1];return{width:innerWidth,scroll:document.documentElement.scrollWidth,labelWidth:l.getBoundingClientRect().width,labelHeight:l.getBoundingClientRect().height,valueWidth:v.clientWidth,valueScroll:v.scrollWidth}})()`);
assert(r.labelWidth>=111&&r.labelHeight<40&&r.scroll<=r.width&&r.valueScroll<=r.valueWidth,JSON.stringify(r));
}
for(const width of [280,640]) for(const scheme of ['light','dark']){
w.setContentSize(width,700);
const output={id:'form',title:'Form',content:{type:'html',html:`<div class="kudium-form"><label class="kudium-field">Search<input placeholder="Keyword"></label><label class="kudium-field">Format<select><option>Summary</option></select></label><label class="kudium-field">Notes<textarea></textarea></label><button class="kudium-button">Refresh</button><button class="kudium-button" disabled>Disabled</button></div>`,css:`html{color-scheme:${scheme}}`}};
const html=hookPanelDocument(output).replace('const bridge=window.kudiumHookPanel;',`const bridge={onThemeChanged(){},onUpdate(){}};`);
await w.loadURL('data:text/html,'+encodeURIComponent(html));
w.show();w.focus();
const r=await w.webContents.executeJavaScript(`(()=>{const input=document.querySelector('input');input.focus();const controls=[...document.querySelectorAll('input,select,textarea,button')];return{width:innerWidth,scroll:document.documentElement.scrollWidth,outline:getComputedStyle(input).outlineStyle,disabled:getComputedStyle(document.querySelector('button:disabled')).opacity,borders:controls.map(x=>getComputedStyle(x).borderTopWidth)};})()`);
assert(r.scroll<=r.width&&r.outline==='solid'&&Number(r.disabled)<1&&r.borders.every(x=>x==='0px'),JSON.stringify(r));
}
console.log('PASS Electron: readable labels and wrapped long URLs at 280, 368, 640 and 1000px.');}finally{w.destroy()}}).then(()=>app.quit()).catch(e=>{console.error(e);app.exit(1)});
