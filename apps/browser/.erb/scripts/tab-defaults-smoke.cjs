// Reuse the real browser fixture with disposable profiles and local websites.
const fs = require('fs');
const path = require('path');
process.argv.push('--group-close-only');
process.env.TOUCHBOX_SMOKE_OUTPUT = path.resolve('docs/evidence/tab-defaults');
let source = fs.readFileSync(path.resolve('.erb/scripts/browser-ui-smoke.cjs'), 'utf8');
source = source.replace("if (process.argv.includes('--tab-discard-only')) global.setInterval", 'if (true) global.setInterval');
source = source.replace('if (milliseconds === 60000) idleCheck = callback;', 'if (milliseconds === 60000 && callback.toString().includes("checkingIdle")) idleCheck = callback;');
const start = source.indexOf("    if (process.argv.includes('--group-close-only')) {");
const end = source.indexOf("    if (process.argv.includes('--group-home-only')) {", start);
if (start < 0 || end < 0) throw new Error('Browser fixture changed');
source = source.slice(0, start) + String.raw`
    {
      const waitFor = async test => {
        for (let i=0;i<100;i++) { if(await test()) return; await wait(100); }
        throw new Error('Tab default fixture timed out');
      };
      const saved = async id => evaluate(main, 'JSON.parse(localStorage.getItem("user_apps")).find(tab=>tab.id==='+JSON.stringify(id)+')');
      const page = suffix => main.contentView.children.find(view => view instanceof WebContentsView && !view.webContents.isDestroyed() && view.webContents.getURL()===url+suffix)?.webContents;
      const selectTab = async id => { await evaluate(main, 'document.getElementById("page-tab-'+id+'").click();undefined'); await wait(350); };
      const menu = async (id, label) => {
        await evaluate(main, 'document.getElementById("page-tab-'+id+'").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));undefined');
        await wait(120);
        const action = nativeContextMenu.items.find(item => item.label===label);
        assert(action && action.enabled, 'Missing enabled tab menu action: '+label);
        action.click(); nativeContextMenu.closePopup(main); await wait(250);
      };
      const unload = async () => {
        await evaluate(main, 'document.querySelector(\'.sidebar-app[aria-label="Facebook · Personal"]\').dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));undefined');
        await wait(120); nativeContextMenu.items.find(item=>item.label==='Unload Group').click();nativeContextMenu.closePopup(main);await wait(500);
      };
      const reopen = async () => { await evaluate(main, 'document.querySelector(\'.sidebar-app[aria-label="Facebook · Personal"]\').click();undefined');await wait(500); };
      await selectTab('personal-home');
      let home = page('/home');assert(home);
      const personalSession = home.session;
      await personalSession.cookies.set({url,name:'tab-default-cookie',value:'retained'});
      await home.loadURL(url+'/pinned-home');await wait(250);
      await menu('personal-home','Pin tab');
      assert.equal((await saved('personal-home')).tabDefaultURL,url+'/pinned-home');
      await home.loadURL(url+'/custom-home');await wait(250);
      await menu('personal-home','Set current URL as default');
      assert.equal((await saved('personal-home')).tabDefaultURL,url+'/custom-home');
      await menu('personal-home','Unpin tab');
      assert.equal((await saved('personal-home')).tabDefaultURL,url+'/custom-home','Unpin preserves the explicit default');
      await home.loadURL(url+'/away');await wait(250);
      assert(home.navigationHistory.canGoBack());
      await selectTab('personal-messages');
      let messages = page('/messages');assert(messages);
      await messages.loadURL(url+'/messages-away');await wait(250);
      assert(messages.navigationHistory.canGoBack());
      await unload();
      assert(home.isDestroyed() && messages.isDestroyed());
      assert.equal((await saved('personal-home')).url,url+'/custom-home');
      assert.equal((await saved('personal-messages')).url,url+'/messages-away');
      assert.equal((await saved('personal-home')).tabDefaultURL,url+'/custom-home');
      await reopen();await selectTab('personal-home');
      home=page('/custom-home');assert(home,'Wake must load saved default');
      assert.equal(home.navigationHistory.getAllEntries().length,1);
      assert(!home.navigationHistory.canGoBack() && !home.navigationHistory.canGoForward());
      assert.equal(home.session,personalSession);
      assert((await personalSession.cookies.get({name:'tab-default-cookie'})).length);
      await selectTab('personal-messages');messages=page('/messages-away');assert(messages);
      assert.equal(messages.navigationHistory.getAllEntries().length,1,'Ordinary group tabs also start with clean history');

      // Automatic sleep retains ordinary history, but group unload clears even sleeping tabs.
      await messages.loadURL(url+'/messages-sleep');await wait(250);
      await selectTab('personal-home');
      require(path.join(runtimeDir,'preferences.js')).updateBrowserPreferences({discardInactiveTabs:true,discardAfterMinutes:15,keepPinnedTabsAwake:false,keepFavoriteTabsAwake:false});
      const realNow=Date.now;Date.now=()=>realNow()+16*60000;
      try {await waitFor(()=>{idleCheck();return messages.isDestroyed();});} finally {Date.now=realNow;}
      await unload();await reopen();await selectTab('personal-messages');
      messages=page('/messages-sleep');assert(messages);
      assert.equal(messages.navigationHistory.getAllEntries().length,1,'Group unload clears history retained by automatic sleep');

      // Cancellation preserves live history and location.
      await selectTab('personal-home');home=page('/custom-home');
      await home.loadURL(url+'/protected-away');await wait(250);
      await home.executeJavaScript('window.onbeforeunload=()=>"";undefined');
      require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=async()=>({response:0});
      const history=home.navigationHistory.getAllEntries();await unload();
      assert(!home.isDestroyed());assert.equal(home.getURL(),url+'/protected-away');
      assert.deepEqual(home.navigationHistory.getAllEntries(),history);
      await home.executeJavaScript('window.onbeforeunload=null;undefined');
      require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=async()=>({response:1});

      // Defaults also apply to automatic sleep; no old scroll or navigation is restored.
      await selectTab('personal-messages');
      Date.now=()=>realNow()+16*60000;
      try {await waitFor(()=>{idleCheck();return home.isDestroyed();});} finally {Date.now=realNow;}
      await selectTab('personal-home');home=page('/custom-home');assert(home);
      assert.equal(home.navigationHistory.getAllEntries().length,1);
      await unload();main.reload();await wait(1000);await reopen();await selectTab('personal-home');
      assert(page('/custom-home'),'Default survives renderer restart');
      await evaluate(main, 'document.getElementById("page-tab-personal-home").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));undefined');await wait(150);
      assert(nativeContextMenu.items.some(item=>item.label==='Set current URL as default' && !item.enabled));
      nativeContextMenu.closePopup(main);
      console.log('PASS: pin captures live URL; explicit defaults; unpin retention; lazy/default wake; clean group and sleeping histories; cancelled unload; cookie retention; persisted defaults');
      Object.values(windows).forEach(win=>win.close());server.close();app.quit();return;
    }
` + source.slice(end);
module._compile(source, path.resolve('.erb/scripts/browser-ui-smoke.cjs'));
