/* eslint-disable no-await-in-loop, no-restricted-syntax, promise/catch-or-return */
// Disposable Electron fixture for the production address-bar settings dialog.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-site-settings-'));
const out = path.resolve('docs/evidence/site-settings');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(root, 'profile'));
fs.writeFileSync(
  path.join(root, 'preview.tsx'),
  `
import React from ${JSON.stringify(require.resolve('react'))};
import {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};
import {Theme} from '@radix-ui/themes';
import {SiteSettingsDialog} from ${JSON.stringify(
    path.resolve('src/components/UI/SiteSettingsDialog')
  )};
import ${JSON.stringify(path.resolve('src/renderer/index.css'))};
const params=new URLSearchParams(location.search);const scenario=params.get('scenario');
function Preview(){const [muted,setMuted]=React.useState(false);const [permissions,setPermissions]=React.useState({geolocation:'block'});const state=scenario==='empty'?undefined:{id:'page',url:'https://example.com/page',title:'Example',loading:scenario==='loading',canGoBack:false,canGoForward:false,muted,siteSettings:{origin:scenario==='insecure'?'http://a-long-website-name.example.com:8080':'https://example.com',permissions,blocked:scenario==='blocked'}};return <Theme appearance={params.get('theme')}><SiteSettingsDialog open onOpenChange={()=>{}} state={state} onCapture={()=>{}} command={request=>{if(request.action==='toggle-mute')setMuted(!muted);if(request.action==='set-permission')setPermissions({...permissions,[request.permission]:request.choice});if(request.action==='reset-permissions')setPermissions({});}}/></Theme>;}createRoot(document.getElementById('root')).render(<Preview/>);`
);
require('esbuild').buildSync({
  entryPoints: [path.join(root, 'preview.tsx')],
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  nodePaths: [path.resolve('node_modules')],
  outfile: path.join(root, 'preview.js'),
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
});
fs.writeFileSync(
  path.join(root, 'index.html'),
  '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="preview.css"></head><body><div id="root"></div><script src="preview.js"></script></body></html>'
);
const wait = () => new Promise((resolve) => setTimeout(resolve, 180));
const checks = [];
app
  .whenReady()
  .then(async () => {
    const w = new BrowserWindow({
      width: 800,
      height: 600,
      useContentSize: true,
      show: true,
      webPreferences: { backgroundThrottling: false },
    });
    for (const width of [800, 400])
      for (const theme of ['light', 'dark'])
        for (const scenario of [
          'default',
          'expanded',
          'capture-menu',
          'permission-menu',
          'muted',
          'loading',
          'blocked',
          'empty',
          'insecure',
        ]) {
          w.setContentSize(width, 600);
          await w.loadFile(path.join(root, 'index.html'), {
            query: { theme, scenario },
          });
          await wait();
          if (scenario === 'expanded' || scenario === 'insecure')
            await w.webContents.executeJavaScript(
              `document.querySelector('.site-connection').open=true`
            );
          if (scenario === 'muted')
            await w.webContents.executeJavaScript(
              `document.querySelector('[role=switch]').click()`
            );
          if (scenario === 'capture-menu' || scenario === 'permission-menu') {
            await w.webContents.executeJavaScript(
              `(()=>{const b=document.querySelector(${JSON.stringify(
                scenario === 'capture-menu'
                  ? '[aria-label="Capture page"]'
                  : '[role=combobox]'
              )});b.focus();b.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));})()`
            );
          }
          await wait();
          const layout = await w.webContents.executeJavaScript(
            `(()=>{const d=document.querySelector('.site-settings-dialog').getBoundingClientRect();const f=document.querySelector('.site-settings-footer').getBoundingClientRect();const s=document.querySelector('.site-settings-scroll');const panels=[...document.querySelectorAll('[data-radix-popper-content-wrapper]')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}});const content=document.querySelector('.site-connection-content');const p=[...content.children].map(e=>e.getBoundingClientRect());return {dialog:{left:d.left,right:d.right,top:d.top,bottom:d.bottom},footer:f.bottom,scroll:s.scrollHeight>s.clientHeight,panels,detailsGap:p[1].top-p[0].bottom,expanded:document.querySelector('.site-connection').open,menu:!!document.querySelector('[role=menu], [role=listbox]')};})()`
          );
          assert(
            layout.dialog.left >= 0 && layout.dialog.right <= width,
            'dialog width'
          );
          assert(layout.footer <= 600, 'footer reachability');
          for (const panel of layout.panels)
            assert(
              panel.left >= 0 &&
                panel.right <= width &&
                panel.top >= 0 &&
                panel.bottom <= 600,
              'popup bounds'
            );
          if (layout.expanded)
            assert(layout.detailsGap >= 8, 'connection details spacing');
          if (scenario.endsWith('menu')) assert(layout.menu, 'menu opens');
          checks.push({ width, theme, scenario, ...layout });
          fs.writeFileSync(
            path.join(out, `${width}-${theme}-${scenario}.png`),
            (await w.webContents.capturePage()).toPNG()
          );
          if (scenario === 'default') {
            await w.webContents.executeJavaScript(
              `document.querySelector('.site-settings-scroll').scrollTop=9999`
            );
            await wait();
            fs.writeFileSync(
              path.join(out, `${width}-${theme}-scrolled.png`),
              (await w.webContents.capturePage()).toPNG()
            );
          }
        }
    fs.writeFileSync(
      path.join(out, 'layout-checks.json'),
      JSON.stringify(checks, null, 2)
    );
    console.log(`${checks.length} site settings layout states passed`);
    w.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
