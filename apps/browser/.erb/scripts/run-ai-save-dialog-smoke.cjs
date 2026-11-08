// macOS launcher with an identity distinct from the user's running Electron app.
const fs=require('fs');const os=require('os');const path=require('path');const {spawn,spawnSync}=require('child_process');
if(process.platform!=='darwin')throw new Error('This launcher isolates a macOS app bundle. Use the native fixture with your platform UI driver.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kudiumbrowser-save-app-'));
const bundle=path.join(root,'KudiumBrowser Save Test.app');
const original=path.resolve('node_modules/electron/dist/Electron.app');
const copy=spawnSync('cp',['-cR',original,bundle],{stdio:'inherit'});
if(copy.status!==0)throw new Error('Unable to clone the disposable Electron bundle.');
const plist=path.join(bundle,'Contents','Info.plist');
for(const [key,value] of [['CFBundleIdentifier','com.kudiumbrowser.native-save-fixture'],['CFBundleName','KudiumBrowser Save Test'],['CFBundleDisplayName','KudiumBrowser Save Test']]) {
 const result=spawnSync('/usr/bin/plutil',['-replace',key,'-string',value,plist],{stdio:'inherit'});
 if(result.status!==0)throw new Error('Unable to assign the fixture app identity.');
}
process.stdout.write(JSON.stringify({stage:'ISOLATED_APP',path:bundle,instructions:'Use CUA on this exact path. At CHOOSE_SAVE set Save As to chosen-test.txt and click Save. At CANCEL_SAVE click Cancel. Close the test app after PASS.'})+'\n');
const child=spawn(path.join(bundle,'Contents','MacOS','Electron'),[path.resolve('.erb/scripts/ai-save-dialog-smoke.cjs')],{stdio:'inherit'});
child.on('error',error=>{process.stderr.write(error.stack+'\n');process.exitCode=1});
child.on('exit',(code,signal)=>{process.stdout.write(JSON.stringify({stage:'FIXTURE_EXIT',code,signal,disposableBundle:bundle})+'\n');process.exitCode=code??1});
