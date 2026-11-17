const fs = require('fs'), path = require('path'), assert = require('assert/strict');
module.exports = async ({ main, evaluate, out, runtimeDir, url, dialog }) => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(main, expression)) return; await wait(50); }
    throw new Error('Group toolbar timed out: ' + expression);
  };
  const tabs = [{ id: 'terminal-fixture', sessionId: 'terminal-group', sessionName: 'Terminal fixture', name: 'Home', url: url + '/theme-fixture', icon: '', spaceId: 'default', sessionMode: 'collection', groupDisplay: 'folder' }];
  await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('user_last_app_id','terminal-fixture');localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify([{ id: 'default', name: 'Personal', color: 'iris', folders: [], selectedAppId: 'terminal-fixture', useWebsiteColors: true }]))});undefined`);
  await main.reload();
  await until(`!!document.querySelector('.sidebar-app-terminal')`);
  await until(`getComputedStyle(document.querySelector('.workspace')).getPropertyValue('--kudium-primary').trim()==='#fcd72b'`);
  const folder = path.join(runtimeDir, 'terminal-project'); fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'README.md'), 'Disposable terminal acceptance fixture.');
  const originalDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  try { await evaluate(main, `window.electron.siteDeveloper.project('terminal-fixture','link')`); }
  finally { dialog.showOpenDialog = originalDialog; }
  await evaluate(main, `document.querySelector('.workspace-sidebar').style.width='240px';undefined`);
  await wait(300);
  const point = await evaluate(main, `(()=>{const b=document.querySelector('.sidebar-app-terminal'),r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  main.focus(); main.webContents.focus();
  main.webContents.sendInputEvent({ type: 'mouseMove', ...point });
  await evaluate(main, `document.querySelector('.sidebar-app-terminal').focus();undefined`);
  await wait(250);
  fs.writeFileSync(path.join(out, 'group-terminal-hover.png'), (await main.capturePage()).toPNG());
  const metrics = await evaluate(main, `(()=>{const row=document.querySelector('.sidebar-app-terminal').closest('.sidebar-app-row'),t=row.querySelector('.sidebar-app-terminal'),a=row.querySelector('.sidebar-app-add'),c=row.querySelector('.sidebar-group-chevron');return {opacity:getComputedStyle(t).opacity,terminal:{left:t.getBoundingClientRect().left,right:t.getBoundingClientRect().right},add:{left:a.getBoundingClientRect().left,right:a.getBoundingClientRect().right},collapse:c?{left:c.getBoundingClientRect().left,right:c.getBoundingClientRect().right}:null}})()`);
  assert(Number(metrics.opacity)>.99&&metrics.terminal.right<=metrics.add.left+2&&(!metrics.collapse||metrics.collapse.right<=metrics.terminal.left+2), 'Hover actions fit and put terminal between collapse and add: '+JSON.stringify(metrics));
  fs.writeFileSync(path.join(out, 'group-terminal-hover.png'), (await main.capturePage()).toPNG());
  main.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
  main.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
  await until(`!!document.querySelector('[aria-label="Project terminal"]')`);
  const group = JSON.stringify(['terminal-group', 'default']);
  await until(`window.electron.siteDeveloper.terminal(${JSON.stringify(group)},{action:'list'}).then(state=>state.tabs.some(tab=>tab.running))`);
  assert(await evaluate(main, `document.querySelector('[aria-label=\"Project terminal\"]').getBoundingClientRect().height>0`), 'Shortcut opens the Developer pane');
  fs.writeFileSync(path.join(out, 'group-terminal-open.png'), (await main.capturePage()).toPNG());
  await evaluate(main, `window.electron.browser.command({id:'terminal-fixture',action:'navigate',url:${JSON.stringify(url + '/ai-stalled-new-tab')}})`);
  await until(`!!document.querySelector('[aria-label="Stop loading"] svg.lucide-x')`);
  assert(await evaluate(main, `!document.querySelector('[aria-label="Stop loading"] svg.lucide-square')`), 'Loading uses X instead of a square');
  await evaluate(main, `document.querySelector('[aria-label="Stop loading"]').click();undefined`);
  await until(`!document.querySelector('[aria-label="Stop loading"]')`);
  console.log('PASS: native website header color propagation, narrow group hover actions, terminal order, real click and built-in group terminal. Evidence: ' + out);
};
