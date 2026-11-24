// Real Chromium layout check for the app's reserved window-drag area.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-window-drag-'));
app.setPath('userData', temporary);
const css = fs.readFileSync('src/renderer/index.css', 'utf8').replace(/^@import[^;]+;/, '');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, titleBarStyle: 'hiddenInset' });
  try {
    for (const width of [520, 1160]) {
      window.setContentSize(width, 700);
      for (const layout of ['tabs', 'address', 'empty']) {
        const content = layout === 'tabs' ? '<div class="pane-tab-strips"><div class="session-tab-strip"><div class="horizontal-tabs"><button style="width:1200px;flex-shrink:0">Tabs</button></div></div></div>' : layout === 'address' ? '<div class="browser-address-header"><div class="address-bar"><input></div></div>' : '<div class="browser-drag-region"></div>';
        await window.loadURL('data:text/html,' + encodeURIComponent(`<style>${css}</style><main class="browser-shell" data-address-placement="${layout === 'address' ? 'header' : 'sidebar'}"><div class="browser-chrome" ${layout === 'address' ? 'data-inline-address' : ''}><div class="sidebar-header-control"><button>Sidebar</button></div>${content}<div class="browser-window-drag-handle" aria-hidden="true"></div><div class="browser-actions"><button>Tools</button></div></div></main>`));
        const result = await window.webContents.executeJavaScript(`(() => {
          const element = document.querySelector('.browser-window-drag-handle');
          const rect = element.getBoundingClientRect();
          return { width:rect.width, height:rect.height, inside:rect.left>=0 && rect.right<=innerWidth && rect.bottom<=innerHeight,
            region:getComputedStyle(element).getPropertyValue('-webkit-app-region'),
            hit:document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)===element,
            controls:getComputedStyle(document.querySelector('.browser-actions')).getPropertyValue('-webkit-app-region') };
        })()`);
        assert.deepStrictEqual(result, { width:16, height:36, inside:true, region:'drag', hit:true, controls:'no-drag' }, `${width}px ${layout}`);
      }
    }
    console.log('PASS six Chromium layouts: visible 16px drag area, no overlapping element, controls remain no-drag.');
  } finally { window.destroy(); }
}).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => fs.rmSync(temporary, { recursive:true, force:true }));
