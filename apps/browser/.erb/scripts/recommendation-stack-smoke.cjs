// Exercise the real recommendation component and app CSS in a disposable renderer.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-stack-test-'));
const output = process.env.KUDIUM_STACK_EVIDENCE || path.join(temporary, 'evidence');
app.setPath('userData', temporary);
const build = require('esbuild').build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {Theme} from '@radix-ui/themes';import {BrowserRecommendations} from './src/components/UI/BrowserRecommendations';import {appThemeStyle,resolveAppTheme} from './src/utils/appTheme';const root=createRoot(document.getElementById('root'));window.renderStack=appearance=>root.render(<Theme appearance={appearance} accentColor="teal" style={appThemeStyle(resolveAppTheme({color:"iris"}))}><div className="stack-fixture"><BrowserRecommendations onMarketplace={()=>true}/></div></Theme>);window.renderStack('light');`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'browser', outfile: path.join(temporary, 'fixture.js'), define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'fixture-boundaries', setup(build) {
    build.onLoad({ filter: /AccountSyncSuggestion\.tsx$/ }, () => ({ contents: 'export function useSyncSuggestionEligibility(){return true;}', loader: 'js' }));
    build.onLoad({ filter: /browser\/client\.ts$/ }, () => ({ contents: 'export const browser={preferences:async()=>({})};', loader: 'js' }));
  } }],
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  await build; fs.mkdirSync(output, { recursive: true });
  const css = fs.readFileSync('src/renderer/index.css', 'utf8').replace(/^@import[^;]+;/, '');
  const theme = fs.readFileSync(require.resolve('@radix-ui/themes/styles.css'), 'utf8');
  fs.writeFileSync(path.join(temporary, 'index.html'), `<style>${theme}\n${css}\nhtml,body{margin:0}.stack-fixture{padding:18px 8px;background:var(--sidebar-material);box-sizing:border-box;min-height:100vh}</style><div id="root"></div><script src="fixture.js"></script>`);
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await window.loadFile(path.join(temporary, 'index.html')); await wait(150);
    for (const appearance of ['light', 'dark']) {
      await window.webContents.executeJavaScript(`renderStack(${JSON.stringify(appearance)})`); await wait(80);
      for (const width of [240, 300, 360]) {
        window.setContentSize(width, 520); await wait(80);
        const targets = ['Supercharge websites with hooks','Bring your browser with you','Sync your account'];
        for (let selected = 0; selected < 3; selected++) {
          await window.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('.recommendation-select')].find(button=>button.dataset.title===${JSON.stringify(targets[selected])});button?.click();})()`);await wait(60);
          const metrics = await window.webContents.executeJavaScript(`(()=>{const cards=[...document.querySelectorAll('.recommendation-card')];return cards.map(card=>{const r=card.getBoundingClientRect(),button=card.querySelector('.recommendation-select'),t=card.querySelector('strong').getBoundingClientRect();return {front:card.hasAttribute('data-front'),width:r.width,left:r.left,right:r.right,titleLeft:t.left,titleRight:t.right,buttonHeight:button?.getBoundingClientRect().height,scroll:card.scrollWidth,client:card.clientWidth};})})()`);
          assert.equal(metrics.length, 3, 'Three cards remain visible');
          assert.equal(metrics.filter(card => card.front).length, 1, 'Only one card expands');
          for (const card of metrics) { assert(card.titleLeft >= card.left && card.titleRight <= card.right, 'Titles fit their card'); assert(card.scroll <= card.client + 1, 'No horizontal overflow'); if (!card.front) assert(card.buttonHeight >= 44, 'Collapsed cards are usable, not squeezed strips'); }
          const filename = `stack-${appearance}-${width}-${selected}.png`;
          fs.writeFileSync(path.join(output, filename), (await window.capturePage()).toPNG());
          const title = await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.recommendation-select');const title=button.dataset.title;button.click();return title;})()`); await wait(60);
          assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-front] strong').textContent`), title, 'Clicking a card brings its content forward');
        }
      }
    }
    console.log('PASS: three cards, one expanded, 44px targets, no clipping, and card switching at 240/300/360px in light/dark. Evidence: ' + output);
  } finally { window.destroy(); }
}).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => fs.rmSync(temporary, { recursive: true, force: true }));
