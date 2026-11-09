// Real Electron product photography with a disposable profile. Fictional demo content.
process.on('warning', (warning) => console.error(warning.stack));
// Requires the renderer dev server on localhost:1212. See demo/README.md.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path'),
  fs = require('fs'),
  ts = require('typescript'),
  http = require('http');
const runtimeDir = fs.mkdtempSync(
  path.join(require('os').tmpdir(), 'kudiumbrowser-desktop-smoke-')
);
const out = path.resolve('../web/public/product/demo');
fs.mkdirSync(out, { recursive: true });
for (const [source, target] of [
  ['src/main/browser.ts', 'browser.js'],

  ['src/main/dialogs.ts', 'dialogs.js'],
  ['src/main/siteSettings.ts', 'siteSettings.js'],
  ['src/utils/EventBus.ts', 'EventBus.js'],
  ['src/utils/constant.ts', 'constant.js'],
])
  fs.writeFileSync(
    path.join(runtimeDir, target),
    ts.transpileModule(fs.readFileSync(source, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
  );
require('esbuild').buildSync({
  entryPoints: ['src/main/dialogs.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(runtimeDir, 'dialogs.js'),
});
require('esbuild').buildSync({
  entryPoints: ['src/main/siteSettings.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(runtimeDir, 'siteSettings.js'),
});
require('esbuild').buildSync({
  entryPoints: ['src/main/downloads.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron', './preferences'],
  outfile: path.join(runtimeDir, 'downloads.js'),
});
require('esbuild').buildSync({
  entryPoints: ['src/main/websitePermissions.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron', './preferences', './dialogs', './siteSettings'],
  outfile: path.join(runtimeDir, 'websitePermissions.js'),
});
fs.writeFileSync(
  path.join(runtimeDir, 'browser-entry.ts'),
  `export * from ${JSON.stringify(
    path.resolve('src/main/electronBrowser')
  )};export * from ${JSON.stringify(path.resolve('src/main/groupLocks'))};export * from ${JSON.stringify(path.resolve('src/main/browserWindows'))};`
);
require('esbuild').buildSync({
  entryPoints: [path.join(runtimeDir, 'browser-entry.ts')],
  bundle: true,
  platform: 'node',
  external: [
    'electron',
    './extensions',
    './preferences',
    './downloads',
    './dialogs',
    './siteSettings',
    './history',
    'node-pty',
  ],
  outfile: path.join(runtimeDir, 'electronBrowser.js'),
});
require('fs').copyFileSync(
  require.resolve('electron-chrome-extensions/preload'),
  path.join(runtimeDir, 'chrome-extension-api.preload.js')
);
require('fs').copyFileSync(
  require.resolve('electron-chrome-web-store/preload'),
  path.join(runtimeDir, 'chrome-web-store.preload.js')
);
require('esbuild').buildSync({
  entryPoints: ['src/main/extensions.ts'],
  bundle: true,
  platform: 'node',
  external: [
    'electron',
    './dialogs',
    require.resolve('electron-chrome-extensions'),
    require.resolve('electron-chrome-web-store'),
  ],
  alias: {
    'electron-chrome-extensions': require.resolve('electron-chrome-extensions'),
    'electron-chrome-web-store': require.resolve('electron-chrome-web-store'),
  },
  outfile: path.join(runtimeDir, 'extensions.js'),
});
require('esbuild').buildSync({
  entryPoints: ['src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(runtimeDir, 'preload.js'),
});
require('esbuild').buildSync({
  entryPoints: ['src/main/preferences.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron', './extensions', './dialogs'],
  outfile: path.join(runtimeDir, 'preferences.js'),
});
require('esbuild').buildSync({
  entryPoints: ['src/main/nativeUi.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron', './dialogs'],
  outfile: path.join(runtimeDir, 'nativeUi.js'),
});
require(path.join(runtimeDir, 'nativeUi.js')).registerNativeUi((contents) =>
  Object.values(windows).some((window) => window.webContents === contents)
);
require(path.join(runtimeDir, 'dialogs.js')).showBrowserDialog = async () => ({
  response: 1,
});
require(path.join(runtimeDir, 'preferences.js')).registerPreferences(
  (section) => {
    if (windows.settings) {
      windows.settings.show();
      windows.settings.webContents.send('preferences-section', section);
    }
  },
  (contents) =>
    Object.values(windows).some(
      (win) => !win.isDestroyed() && win.webContents === contents
    ),
  (contents) => windows.settings?.webContents === contents
);
require('esbuild').buildSync({
  entryPoints: ['src/main/history.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(runtimeDir, 'history.js'),
});
require(path.join(runtimeDir, 'history.js')).registerHistory((contents) =>
  Object.values(windows).some((win) => win.webContents === contents)
);
const { registerBrowser } = require(path.join(runtimeDir, 'browser.js'));
const { eventBus } = require(path.join(runtimeDir, 'EventBus.js'));
app.setPath('userData', path.join(runtimeDir, 'user-data'));
app.on('window-all-closed', () => {});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const windows = {};
require(path.join(runtimeDir, 'electronBrowser.js')).registerGroupLocks(
  (contents) =>
    Object.values(windows).some(
      (win) => !win.isDestroyed() && win.webContents === contents
    ),
  {
    available: async () => false,
    authenticate: async () => {
      throw new Error('OS authentication is outside demo photography.');
    },
  }
);
// Photography owns a disposable profile; storage is ready before rendering.
ipcMain.handle('browser-storage-ready', () => ({available:true,needsRecovery:false}));
const demoWindows = require(path.join(runtimeDir, 'electronBrowser.js')).registerBrowserWindows(async () => { throw new Error('Additional windows are outside demo photography.'); });
eventBus.registerOnMain(ipcMain, windows);
const evaluate = async (win, code) => {
  try {
    return await win.webContents.executeJavaScript(code);
  } catch (error) {
    console.error('Failed UI expression:', code);
    throw error;
  }
};
const demoProject = path.resolve('demo/atlas-studio');
require('electron').dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [demoProject],
});
process.env.NODE_PATH =
  path.resolve('release/app/node_modules') +
  path.delimiter +
  path.resolve('node_modules');
require('module').Module._initPaths();
let demoTerminals;
process.env.SHELL = '/bin/sh';
process.env.PS1 = 'atlas-studio $ ';
ipcMain.handle('demo-terminal', (_event, group, request) =>
  demoTerminals.request(group, request)
);
const build = require('esbuild').buildSync;
build({
  entryPoints: ['src/main/projectFiles.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(runtimeDir, 'demo-files.cjs'),
});
build({
  entryPoints: ['src/main/projectTerminal.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron', 'node-pty'],
  outfile: path.join(runtimeDir, 'demo-terminal.cjs'),
});
const { ProjectTerminals } = require(path.join(
  runtimeDir,
  'demo-terminal.cjs'
));
const { projectFiles } = require(path.join(runtimeDir, 'demo-files.cjs'));
ipcMain.handle('demo-files', (_event, request) =>
  projectFiles(demoProject, request, () => {})
);
fs.writeFileSync(
  path.join(runtimeDir, 'demo-preload.cjs'),
  `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('demoFiles',{request:r=>ipcRenderer.invoke('demo-files',r),terminal:(group,r)=>ipcRenderer.invoke('demo-terminal',group,r),onTerminal:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('site-developer-terminal-data',listener);return()=>ipcRenderer.removeListener('site-developer-terminal-data',listener)}});`
);
const imp = (name) => JSON.stringify(path.resolve(name));
fs.writeFileSync(
  path.join(runtimeDir, 'demo.tsx'),
  `
import React from 'react';import {createRoot} from 'react-dom/client';import {Theme} from '@radix-ui/themes';import '@radix-ui/themes/styles.css';import ${imp(
    'src/renderer/index.css'
  )};
import {DeveloperTerminal} from ${imp('src/components/UI/DeveloperTerminal')};
import {DeveloperFiles} from ${imp(
    'src/components/UI/DeveloperFiles'
  )};import {DeveloperScripts} from ${imp(
    'src/components/UI/DeveloperScripts'
  )};import {SiteDeveloperPanel} from ${imp(
    'src/components/UI/SiteDeveloperPanel'
  )};
const p=new URLSearchParams(location.search);const theme=p.get('theme')||'light';localStorage.setItem('kudiumbrowser-appearance',theme);for(const key of Object.keys(localStorage))if(key.startsWith('kudiumbrowser-file-position:'))localStorage.removeItem(key);
const scripts=[{id:'dev',name:'Start development server',command:'bun run dev',scope:'project'},{id:'check',name:'Check project',command:'bun run check',scope:'project'},{id:'build',name:'Build for production',command:'bun run build',scope:'project'}];
window.electron={siteDeveloper:{files:(_id,r)=>window.demoFiles.request(r),scripts:async()=>({scripts}),terminal:window.demoFiles.terminal,onTerminal:window.demoFiles.onTerminal}};
const initial={config:{enabled:true,before:'',after:"const heading = document.querySelector('h1');\\nlog('Project page ready', heading?.textContent);\\n\\n// Keep the collection title accessible.\\nheading?.setAttribute('aria-label', 'Atlas Studio overview');",css:'button:focus-visible {\\n  outline: 3px solid #5aaca8;\\n  outline-offset: 4px;\\n}'},status:'success',logs:[{time:Date.now(),level:'info',message:'Project page ready Good morning, Alex.'},{time:Date.now(),level:'info',message:'After load completed'}]};
function Preview(){const [developer,setDeveloper]=React.useState(initial);return <Theme appearance={theme}><div style={{height:'100vh',padding:24,boxSizing:'border-box',background:theme==='dark'?'#151718':'#fafafa'}}><header style={{display:'flex',gap:16,alignItems:'center',marginBottom:16}}><strong>{p.get('view')==='hooks'?'Website Developer · Atlas Studio':p.get('view')==='terminal'?'Atlas Studio · Terminal':'Atlas Studio · Project files'}</strong><span style={{marginLeft:'auto',fontSize:12,opacity:.55}}>Demonstration workspace</span>{p.get('view')==='files'&&<DeveloperScripts sourceId="atlas" disabled={false}/>}</header>{p.get('view')==='terminal'?<div className="ai-sidebar" style={{width:'100%',height:'calc(100vh - 82px)',border:0}}><DeveloperTerminal group="atlas" active openRequest={1} onHide={()=>{}}/></div>:p.get('view')==='files'?<aside className="ai-sidebar" style={{width:'100%',height:'calc(100vh - 82px)',border:0}}><DeveloperFiles sourceId="atlas" projectName="atlas-studio" projectPath=${JSON.stringify(
    demoProject
  )}/></aside>:<div className="site-settings-dialog site-developer-dialog" style={{height:'calc(100vh - 82px)'}}><SiteDeveloperPanel origin="http://127.0.0.1:4178" developer={developer} disabled={false} send={(action,patch)=>{if(patch?.developer)setDeveloper({...developer,config:patch.developer})}}/></div>}</div></Theme>}createRoot(document.getElementById('root')).render(<Preview/>);
`
);
build({
  entryPoints: [path.join(runtimeDir, 'demo.tsx')],
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  outfile: path.join(runtimeDir, 'demo.js'),
  nodePaths: [path.resolve('node_modules')],
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
});
fs.writeFileSync(
  path.join(runtimeDir, 'demo.html'),
  '<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="demo.css"><body><div id="root"></div><script src="demo.js"></script></body></html>'
);
const checks = [];
async function photograph(contents) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await contents.capturePage();
    } catch (error) {
      if (attempt === 2) throw error;
      await wait(700);
    }
  }
}
app
  .whenReady()
  .then(async () => {
    const html = fs.readFileSync(path.join(demoProject, 'public/index.html'));
    const server = http
      .createServer((req, res) => {
        if (req.url === '/v1/models') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: [{ id: 'gpt-4.1' }] }));
          return;
        }
        const route = req.url.split('?')[0].slice(1);
        const filename = [
          'brief',
          'research',
          'accessibility',
          'journal',
          'reading',
        ].includes(route)
          ? route + '.html'
          : 'index.html';
        res.setHeader('Content-Type', 'text/html');
        res.end(fs.readFileSync(path.join(demoProject, 'public', filename)));
      })
      .listen(4178, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const main = new BrowserWindow({
      width: 1440,
      height: 940,
      useContentSize: true,
      show: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 13 },
      webPreferences: {
        preload: path.join(runtimeDir, 'preload.js'),
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    windows.main = main;
    demoWindows.register(main);
    registerBrowser(main);
    await main.loadURL('http://localhost:1212/?view=main');
    await wait(900);
    const groups = [
      [
        'Social',
        [
          [
            'YouTube',
            'https://www.youtube.com/results?search_query=creative+desk+setup',
          ],
          ['Reddit', 'https://www.reddit.com/'],
          ['Instagram', 'https://www.instagram.com/'],
          ['LinkedIn', 'https://www.linkedin.com/'],
        ],
      ],
      [
        'Work',
        [
          ['Notion', 'https://www.notion.com/'],
          ['Linear', 'https://linear.app/'],
          ['Google Calendar', 'https://calendar.google.com/'],
          ['Slack', 'https://slack.com/'],
        ],
      ],
      [
        'Design',
        [
          ['Figma', 'https://www.figma.com/'],
          ['Dribbble', 'https://dribbble.com/'],
          ['Unsplash', 'https://unsplash.com/'],
          ['Apple', 'https://www.apple.com/ca/'],
        ],
      ],
      [
        'Development',
        [
          ['GitHub', 'https://github.com/'],
          ['Bun', 'https://bun.sh/'],
          ['React', 'https://react.dev/'],
          ['Atlas Studio', 'http://127.0.0.1:4178/'],
        ],
      ],
      [
        'Reading',
        [
          ['Hacker News', 'https://news.ycombinator.com/'],
          ['MDN', 'https://developer.mozilla.org/en-US/'],
          ['Wikipedia', 'https://en.wikipedia.org/wiki/Design'],
          ['The Verge', 'https://www.theverge.com/'],
        ],
      ],
    ];
    const { net } = require('electron');
    const entries = [
      ...groups.flatMap(([group, pages]) =>
        pages.map(([name, url]) => ({ group, name, url, favorite: false }))
      ),
      ...[
        ['ChatGPT', 'https://chatgpt.com/'],
        ['Perplexity', 'https://www.perplexity.ai/'],
        ['Gemini', 'https://gemini.google.com/'],
        ['Google Translate', 'https://translate.google.com/'],
      ].map(([name, url]) => ({ group: name, name, url, favorite: true })),
    ];
    const tabs = await Promise.all(
      entries.map(async ({ group, name, url, favorite }, index) => {
        const host = new URL(url).hostname;
        const iconHost = host === '127.0.0.1' ? 'bun.sh' : host;
        const response = await net.fetch(
          'https://www.google.com/s2/favicons?domain=' + iconHost + '&sz=64'
        );
        if (!response.ok) throw Error('Could not load favicon for ' + name);
        const icon =
          'data:' +
          (response.headers.get('content-type') || 'image/png') +
          ';base64,' +
          Buffer.from(await response.arrayBuffer()).toString('base64');
        return {
          id: 'demo-' + index,
          name,
          url,
          icon:
            host === '127.0.0.1'
              ? 'data:image/png;base64,' +
                fs
                  .readFileSync('../web/public/product/origin-logo.png')
                  .toString('base64')
              : icon,
          sessionName: group,
          sessionSlug: group.toLowerCase(),
          sessionId: group.toLowerCase(),
          spaceId: 'default',
          folderId: ['Work','Design'].includes(group) ? 'product-studio' : group === 'Development' ? 'engineering' : undefined,
          groupDisplay: ['Work','Development'].includes(group) ? 'stack' : 'folder',
          pinned: true,
          favorite,
        };
      })
    );
    await evaluate(
      main,
      `localStorage.setItem('user_apps',${JSON.stringify(
        JSON.stringify(tabs)
      )});localStorage.setItem('user_last_app_id','demo-13');localStorage.setItem('kudiumbrowser-appearance','light');localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(
        JSON.stringify([
          {
            id: 'default',
            name: 'Studio',
            color: 'iris',
            icon: 'work',
            folders: [{id:'product-studio',name:'Product Studio'},{id:'engineering',name:'Engineering'}],
            selectedAppId: 'demo-13',
          },
          { id: 'personal', name: 'Personal', color: 'amber', icon: 'home', folders: [] },
        ])
      )});undefined`
    );
    await main.reload();
    await wait(2500);
    const capture = async (win, name, expected) => {
      await wait(450);
      const text = await evaluate(
        win,
        "document.body.innerText+' '+[...document.querySelectorAll('[aria-label]')].map(el=>el.getAttribute('aria-label')).join(' ')"
      );
      if (expected && !text.includes(expected))
        throw Error(
          'Missing ' + expected + ' in ' + name + '; ' + text.slice(0, 1600)
        );
      fs.writeFileSync(
        path.join(out, name + '.png'),
        (await photograph(win)).toPNG()
      );
      if (win === main) {
        const layers = [];
        for (const view of main.contentView.children) {
          if (!view.webContents || !view.getVisible()) continue;
          const bounds = view.getBounds();
          if (!bounds.width || !bounds.height) continue;
          await view.webContents.executeJavaScript('document.fonts.ready');
          const file = path.join(
            runtimeDir,
            name + '-page-' + layers.length + '.png'
          );
          fs.writeFileSync(file, (await photograph(view.webContents)).toPNG());
          layers.push({ file, bounds });
        }
        const config = path.join(runtimeDir, 'composite.json');
        fs.writeFileSync(
          config,
          JSON.stringify({
            target: path.join(out, name + '.png'),
            width: 1440,
            layers,
          })
        );
        const result = require('child_process').spawnSync(
          'python3',
          [
            '-c',
            "import sys,json; from PIL import Image; c=json.load(open(sys.argv[1])); im=Image.open(c['target']).convert('RGB'); ratio=im.width/c['width'];\nfor layer in c['layers']:\n b=layer['bounds']; pic=Image.open(layer['file']).convert('RGB').resize((round(b['width']*ratio),round(b['height']*ratio))); im.paste(pic,(round(b['x']*ratio),round(b['y']*ratio)))\nim.save(c['target'])",
            config,
          ],
          { encoding: 'utf8' }
        );
        if (result.status !== 0) throw Error(result.stderr);
      }
      checks.push({
        image: name + '.png',
        expectedText: expected,
        verified: true,
      });
    };
    await wait(6500);
    await evaluate(
      main,
      'Promise.all([...document.images].map(img=>img.decode().catch(()=>{})))'
    );
    await capture(main, 'workspace-light', 'Development');
    await evaluate(
      main,
      "localStorage.setItem('kudiumbrowser-appearance','dark');window.dispatchEvent(new Event('storage'));undefined"
    );
    await main.reload();
    await wait(1800);
    await capture(main, 'workspace-dark', 'Development');
    await evaluate(
      main,
      "localStorage.setItem('kudiumbrowser-ai-page-open','true');localStorage.setItem('kudiumbrowser-ai-page-pane','\"assistant\"');undefined"
    );
    await main.reload();
    await wait(1000);
    await evaluate(
      main,
      "window.electron.ai.settings({endpoint:'http://127.0.0.1:4178/v1',model:'gpt-4.1',key:'demo-only',remember:false})"
    );
    await evaluate(
      main,
      `(()=>{const data=new DataTransfer();data.items.add(new File([${JSON.stringify(
        fs.readFileSync(path.join(demoProject, 'docs/brief.md'), 'utf8')
      )}],'project-brief.md',{type:'text/markdown'}));document.querySelector('.ai-composer').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})();undefined`
    );
    await wait(400);
    await evaluate(
      main,
      "(()=>{const el=document.querySelector('.ai-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Help me plan this build. Use the project brief and React documentation to suggest an accessible component structure.');el.dispatchEvent(new Event('input',{bubbles:true}));})();undefined"
    );
    await capture(main, 'ai-context', 'project-brief.md');
    await evaluate(main, `(()=>{const el=document.querySelector('.ai-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Review the project brief with @w');el.focus();el.setSelectionRange(el.value.length,el.value.length);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('select',{bubbles:true}));})();undefined`);
    await wait(300);
    await capture(main, 'ai-mentions', 'Work');
    if (process.env.KUDIUM_PHOTO_AI_ONLY === '1') { demoTerminals?.dispose(); server.close(); app.quit(); return; }
    await evaluate(main, `(()=>{const el=document.querySelector('.ai-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Help me plan this build using the attached project brief.');el.dispatchEvent(new Event('input',{bubbles:true}));})();undefined`);

    await evaluate(
      main,
      "window.electron.siteDeveloper.project('demo-13','link')"
    );
    await evaluate(
      main,
      "localStorage.setItem('kudiumbrowser-ai-page-pane','\"developer\"');undefined"
    );
    await main.reload();
    await wait(1800);
    await capture(main, 'developer-workspace', 'atlas-studio');
    await evaluate(
      main,
      'document.querySelector(\'[aria-label="Files"]\').click()'
    );
    await wait(900);
    await capture(main, 'developer-files', 'README.md');
    await evaluate(
      main,
      "(()=>{const el=document.querySelector('[aria-label=\"Terminal\"]');el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));el.click();})()"
    );
    await wait(1000);
    await evaluate(
      main,
      "[...document.querySelectorAll('[role=menuitem]')].find(el=>el.innerText==='Open here').click()"
    );
    await wait(1000);
    const groupId = JSON.stringify(['development', 'default']);
    const integrated = await evaluate(
      main,
      `window.electron.siteDeveloper.terminal(${JSON.stringify(
        groupId
      )},{action:'open',cols:80,rows:14})`
    );
    await evaluate(
      main,
      `window.electron.siteDeveloper.terminal(${JSON.stringify(
        groupId
      )},{action:'write',tab:${JSON.stringify(
        integrated.selected
      )},data:"export PS1='atlas-studio $ '; clear; bun run check\\r"})`
    );
    await wait(1800);
    await capture(main, 'developer-terminal', '1 pass');
    const component = new BrowserWindow({
      width: 1280,
      height: 800,
      useContentSize: true,
      show: true,
      webPreferences: {
        preload: path.join(runtimeDir, 'demo-preload.cjs'),
        contextIsolation: true,
      },
    });
    demoTerminals = new ProjectTerminals(
      component,
      () => demoProject,
      path.join(runtimeDir, 'demo-terminals.json')
    );
    for (const theme of ['light', 'dark']) {
      await component.loadFile(path.join(runtimeDir, 'demo.html'), {
        query: { view: 'files', theme },
      });
      await wait(1200);
      await capture(component, 'project-files-' + theme, 'README.md');
      await evaluate(
        component,
        "(()=>{const el=document.querySelector('[title=\"src\"]');el.click();el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));})();undefined"
      );
      await wait(600);
      await evaluate(
        component,
        'document.querySelector(\'[title="src/app.ts"]\').click()'
      );
      await wait(600);
      await capture(component, 'project-editor-' + theme, 'completion');
    }
    await component.loadFile(path.join(runtimeDir, 'demo.html'), {
      query: { view: 'files', theme: 'light' },
    });
    await wait(700);
    await evaluate(
      component,
      "(()=>{const el=document.querySelector('[aria-label=\"Filter files\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'README');el.dispatchEvent(new Event('input',{bubbles:true}));})();undefined"
    );
    await capture(component, 'file-filter', 'README.md');
    await evaluate(
      component,
      "(()=>{const el=document.querySelector('[aria-label=\"Scripts\"]');el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));el.click();})();undefined"
    );
    await capture(component, 'project-scripts', 'Start development server');
    for (const theme of ['light', 'dark']) {
      await component.loadFile(path.join(runtimeDir, 'demo.html'), {
        query: { view: 'hooks', theme },
      });
      await wait(600);
      await capture(component, 'site-hooks-' + theme, 'Project page ready');
    }
    component.setContentSize(1100, 620);
    demoTerminals.request('atlas', { action: 'preferences', height: 440 });
    await component.loadFile(path.join(runtimeDir, 'demo.html'), {
      query: { view: 'terminal', theme: 'dark' },
    });
    await wait(1200);
    const state = demoTerminals.request('atlas', { action: 'list' });
    demoTerminals.request('atlas', {
      action: 'write',
      tab: state.selected,
      data: "export PS1='atlas-studio $ '; clear; bun run check\r",
    });
    await wait(1800);
    const terminalOutput = demoTerminals.request('atlas', {
      action: 'read',
      tab: state.selected,
    }).data;
    if (!terminalOutput.includes('1 pass'))
      throw Error('Demo terminal tests did not pass: ' + terminalOutput);
    await capture(component, 'project-terminal', '1 pass');
    for (const [id, name] of [
      ['demo-11', 'design-workspace'],
      ['demo-0', 'social-workspace'],
    ]) {
      await evaluate(
        main,
        `localStorage.setItem('user_last_app_id',${JSON.stringify(
          id
        )});const spaces=JSON.parse(localStorage.getItem('kudiumbrowser-spaces'));spaces.find(s=>s.id==='default').selectedAppId=${JSON.stringify(
          id
        )};localStorage.setItem('kudiumbrowser-spaces',JSON.stringify(spaces));localStorage.setItem('kudiumbrowser-ai-page-open','false');localStorage.setItem('kudiumbrowser-appearance','light');undefined`
      );
      await main.reload();
      await wait(7000);
      await capture(main, name, 'Social');
    }
    // The same real workspace in expanded and hidden sidebar modes.
    await evaluate(
      main,
      `localStorage.setItem('user_last_app_id','demo-11');const spaces=JSON.parse(localStorage.getItem('kudiumbrowser-spaces'));spaces.find(s=>s.id==='default').selectedAppId='demo-11';localStorage.setItem('kudiumbrowser-spaces',JSON.stringify(spaces));localStorage.setItem('kudiumbrowser-sidebar-hidden','false');undefined`
    );
    await main.reload();
    await wait(6500);
    await capture(main, 'sidebar-expanded', 'Product Studio');
    await evaluate(
      main,
      "localStorage.setItem('kudiumbrowser-sidebar-hidden','true');undefined"
    );
    await main.reload();
    await wait(6500);
    await capture(main, 'sidebar-collapsed', 'Switch group');
    await evaluate(
      main,
      `(()=>{const el=document.querySelector('[aria-label="Switch group"]');el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));el.click();})();undefined`
    );
    await wait(600);
    await capture(main, 'address-group-picker', 'Search switch group');
    demoTerminals.dispose();
    fs.writeFileSync(
      path.join(out, 'manifest.json'),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          source:
            'Production React components in Electron; real projectFiles service and real WebContentsView pages. Public popular websites with five groups of four tabs and fetched site favicons. Atlas Studio is a fictional linked local project. Script list and hook activity are seeded fixtures. AI shows an unsent draft with a real reference attachment; no fabricated assistant answer. Terminal output is from a real demo test run. Browser page layers are captured and placed at their actual native view bounds.',
          checks,
        },
        null,
        2
      )
    );
    console.log(
      'Captured ' + checks.length + ' verified screenshots in ' + out
    );
    component.destroy();
    main.destroy();
    server.close();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
