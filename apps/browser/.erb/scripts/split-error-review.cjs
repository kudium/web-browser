const { app, BrowserWindow } = require('electron');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  assert = require('assert');
const project = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-split-error-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
fs.writeFileSync(
  path.join(root, 'entry.tsx'),
  `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@radix-ui/themes';
import '${project}/src/renderer/index.css';
import { PageStatus } from '${project}/src/components/UI/PageStatus';
const query = new URLSearchParams(location.search);
const status = <PageStatus state={{error:'ERR_CONNECTION_REFUSED',errorCode:-102,canGoBack:true} as any} url="http://127.0.0.1:61131" retry={()=>{window.retries=(window.retries||0)+1}} back={()=>{}}/>;
window.retries=0;
createRoot(document.getElementById('root')).render(<Theme appearance={query.get('theme') as any}>
<div className="browser-viewport" data-split-dragging={query.has('drag') || undefined} style={{position:'absolute',inset:0}}>
{query.has('split') ? <>{(['left','right'] as const).map((side)=><div key={side} className="split-pane-frame" style={{left:side==='left'?0:'50%',width:'50%'}}>{status}</div>)}</> : status}
{query.has('drag') && <div className="split-drop-targets">{['left','right'].map(side=><div key={side} className="split-drop-target"><span>Open on {side}</span></div>)}</div>}
</div></Theme>);
`
);
fs.writeFileSync(
  path.join(root, 'index.html'),
  '<html><head><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>'
);
app.whenReady().then(async () => {
  try {
    await require(project + '/node_modules/esbuild').build({
      entryPoints: [path.join(root, 'entry.tsx')],
      bundle: true,
      outfile: path.join(root, 'preview.js'),
      platform: 'browser',
      jsx: 'automatic',
      nodePaths: [project + '/node_modules'],
    });
    let checks = 0;
    for (const theme of ['light', 'dark'])
      for (const width of [480, 840])
        for (const mode of ['drag', 'split']) {
          const win = new BrowserWindow({
            width,
            height: 650,
            useContentSize: true,
            show: false,
            webPreferences: { contextIsolation: false },
          });
          await win.loadFile(path.join(root, 'index.html'), {
            query: { theme, [mode]: '1' },
          });
          await new Promise((resolve) => setTimeout(resolve, 180));
          const run = (code) => win.webContents.executeJavaScript(code);
          if (mode === 'drag') {
            assert(
              await run(
                `Array.from(document.querySelectorAll('.terminal-status-error')).every(e=>getComputedStyle(e).visibility==='hidden')`
              ),
              'Error obscures split targets'
            );
            assert(
              await run(
                `document.querySelectorAll('.split-drop-target').length===2`
              ),
              'Missing split targets'
            );
            await run(
              `window.targetsHTML=document.querySelector('.split-drop-targets').outerHTML;document.querySelector('.browser-viewport').removeAttribute('data-split-dragging');document.querySelector('.split-drop-targets').remove()`
            );
            assert(
              await run(
                `getComputedStyle(document.querySelector('.terminal-status-error')).visibility==='visible'`
              ),
              'Error did not return after drag'
            );
            // Capture the drag state, after also checking restoration.
            await run(
              `document.querySelector('.browser-viewport').setAttribute('data-split-dragging','true');document.querySelector('.browser-viewport').insertAdjacentHTML('beforeend',window.targetsHTML)`
            );
          } else {
            assert(
              await run(`Array.from(document.querySelectorAll('.split-pane-frame')).every(p=>{
          const r=p.getBoundingClientRect();return Array.from(p.querySelectorAll('h1,button,summary')).every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right});
        })`),
              'Error content escapes its split pane'
            );
            assert(
              await run(
                `Array.from(document.querySelectorAll('.terminal-status-actions button')).every(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b})`
              ),
              'Recovery controls do not receive pointer input'
            );
            await run(
              `document.querySelector('.terminal-status-actions button').click()`
            );
            assert(await run(`window.retries===1`), 'Retry action failed');
          }
          fs.writeFileSync(
            path.join(root, `${theme}-${width}-${mode}.png`),
            (await win.webContents.capturePage()).toPNG()
          );
          checks++;
          win.destroy();
        }
    console.log(JSON.stringify({ checks, screenshots: root }));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
