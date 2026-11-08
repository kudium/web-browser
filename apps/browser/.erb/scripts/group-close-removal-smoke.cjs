// Extend the production browser fixture without changing its existing checks.
const fs = require('fs');
const path = require('path');
process.argv.push('--group-close-only');
process.env.KUDIUMBROWSER_SMOKE_OUTPUT = path.resolve('docs/evidence/group-close-removal');
let source = fs.readFileSync(path.resolve('.erb/scripts/browser-ui-smoke.cjs'),'utf8');
const marker="      console.log('PASS: group menu and button unload views, preserve metadata and cookies, restore tabs lazily, protect cancelled unsaved changes, keep other groups resident');";
if(!source.includes(marker))throw new Error('Group-close fixture changed; update this extension.');
source=source.replace(marker, String.raw`
      const nativeTheme = require('electron').nativeTheme;
      fs.copyFileSync(path.join(runtimeDir,'dialogs.js'),path.join(runtimeDir,'actual-dialogs.js'));
      const actualDialog = require(path.join(runtimeDir,'actual-dialogs.js')).showBrowserDialog;
      const report=[];
      const waitFor=async test=>{for(let i=0;i<80;i++){if(await test())return;await wait(100);}throw new Error('Fixture timeout');};
      await personalSession.cookies.set({url,name:'removal-check',value:'keep-until-confirmed'});
      const storageProbe = async (write=false) => {const view=new WebContentsView({webPreferences:{session:personalSession,sandbox:true,contextIsolation:true,nodeIntegration:false}});await view.webContents.loadURL(url+'/home');const result=await view.webContents.executeJavaScript(write?'localStorage.setItem("removal-storage-check","retained");true':'localStorage.getItem("removal-storage-check")');view.webContents.close();return result;};
      await storageProbe(true);
      const siteApi = require(path.join(runtimeDir,'siteSettings.js'));
      siteApi.updateSiteSettings('personal',new URL(url).origin,{permissions:{geolocation:'block'},developer:{enabled:false,before:'',after:'',css:'body { color: blue; }'}});

      for(const appearance of ['light','dark'])for(const width of [800,400]) {
        nativeTheme.themeSource=appearance;
        await evaluate(main, 'localStorage.setItem("kudiumbrowser-appearance",'+JSON.stringify(appearance)+');undefined');main.reload();await wait(1200);
        main.setSize(width,600);await wait(200);
        require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=actualDialog;
        const click=()=>evaluate(main, 'document.querySelector(\'.sidebar-app[aria-label="Facebook · Personal"]\').closest(".sidebar-app-row").querySelector(".sidebar-app-close").click();undefined');
        await click();
        await waitFor(async()=>evaluate(main,'document.querySelector(\'.sidebar-app[aria-label="Facebook · Personal"]\').closest(".sidebar-app-row").querySelector(".sidebar-app-close").getAttribute("aria-label").startsWith("Remove") && !document.querySelector(\'.sidebar-app[aria-label="Facebook · Personal"]\').closest(".sidebar-app-row").querySelector(".sidebar-app-close").disabled'));
        assert(!BrowserWindow.getAllWindows().some(win=>win.getTitle()==='Remove group'),'First close only unloads');
        const saved=await evaluate(main,'localStorage.getItem("user_apps")');
        fs.writeFileSync(path.join(out,'unloaded-'+appearance+'-'+width+'.png'),(await main.capturePage()).toPNG());
        await click();let modal;
        await waitFor(async()=>{modal=BrowserWindow.getAllWindows().find(win=>win!==main&&win.getTitle()==='Remove group'&&win.isVisible());return !!modal;});
        const layout=await modal.webContents.executeJavaScript('(()=>{const f=document.querySelector("footer").getBoundingClientRect();return {focus:document.activeElement.id,footer:f.bottom,height:innerHeight,overflow:document.body.scrollWidth>innerWidth,detail:document.querySelector(".content").textContent}})()');
        assert.equal(layout.focus,'cancel');assert(layout.footer<=layout.height);assert(!layout.overflow);assert(layout.detail.includes('shared session data will be kept'));
        fs.writeFileSync(path.join(out,'confirmation-'+appearance+'-'+width+'.png'),(await modal.capturePage()).toPNG());
        await modal.webContents.executeJavaScript('document.getElementById("cancel").click()');await wait(250);
        assert.equal(await evaluate(main,'localStorage.getItem("user_apps")'),saved,'Cancel retains group metadata');
        assert((await personalSession.cookies.get({name:'removal-check'})).length,'Cancel retains cookies');
        report.push({appearance,width,...layout});
      }
      // Shared-profile removal retains cookies for the Work group.
      require(path.join(runtimeDir,'dialogs.js')).showBrowserDialog=async()=>({response:1});
      await evaluate(main,'document.querySelector(\'.sidebar-app[aria-label="Facebook · Personal"]\').closest(".sidebar-app-row").querySelector(".sidebar-app-close").click();undefined');
      await waitFor(async()=>evaluate(main,'!JSON.parse(localStorage.getItem("user_apps")).some(tab=>tab.sessionId==="personal")'));
      assert((await personalSession.cookies.get({name:'removal-check'})).length,'Shared profile cookies stay');
      assert.equal(await storageProbe(),'retained','Shared profile website storage stays');
      assert.equal(siteApi.getSiteSettings('personal',new URL(url).origin).permissions.geolocation,'block','Shared site settings stay');
      // Remove the final owning group and verify its real profile is cleared.
      await evaluate(main,'document.querySelector(\'.sidebar-app[aria-label="Facebook · Work"]\').closest(".sidebar-app-row").querySelector(".sidebar-app-close").click();undefined');await wait(350);
      await evaluate(main,'document.querySelector(\'.sidebar-app[aria-label="Facebook · Work"]\').closest(".sidebar-app-row").querySelector(".sidebar-app-close").click();undefined');
      await waitFor(async()=>evaluate(main,'!JSON.parse(localStorage.getItem("user_apps")).some(tab=>tab.sessionId==="work")'));
      assert.equal((await personalSession.cookies.get({name:'removal-check'})).length,0,'Final profile owner deletes cookies');
      assert.equal(await storageProbe(),null,'Final profile owner clears website storage');
      assert.deepEqual(siteApi.getSiteSettings('personal',new URL(url).origin).permissions,{},'Final profile owner clears site settings');
      assert(!require(path.join(runtimeDir,'history.js')).getBrowsingHistory().some(record=>record.profile==='personal'),'Final profile owner clears history');
      const survivor=await evaluate(main,'JSON.parse(localStorage.getItem("user_apps"))');assert(survivor.some(tab=>tab.sessionId==='notes'),'Other groups stay saved');
      fs.writeFileSync(path.join(out,'layout-checks.json'),JSON.stringify(report,null,2));
      console.log('PASS: first close unloads; second close confirms; cancel retains data; shared profiles survive; final-owner removal clears cookies; light/dark/narrow native dialog reviewed');
`);
module._compile(source,path.resolve('.erb/scripts/browser-ui-smoke.cjs'));
