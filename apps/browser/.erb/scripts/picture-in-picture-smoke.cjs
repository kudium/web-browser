// Run from apps/browser: node_modules/.bin/electron .erb/scripts/picture-in-picture-smoke.cjs
// Exercises the production-minified controller in sandboxed, cross-origin WebContentsViews.
const { app, BrowserWindow, WebContentsView } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-pip-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  entryPoints: [path.resolve(__dirname, '../../src/main/pictureInPicture.ts')],
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'es2021',
  outfile: path.join(root, 'controller.cjs'),
});
const { PictureInPictureController } = require(path.join(
  root,
  'controller.cjs'
));
let window, view, controller, first, second;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!(await predicate())) {
    assert(Date.now() < deadline, 'Timed out waiting for PiP state');
    await wait(30);
  }
}
function mediaPage() {
  return `<style>body{margin:20px;font:16px system-ui;background:#f5f5f7}video{width:320px;height:180px;background:#111;margin:0 20px 20px 0}h1{font-size:24px}</style>
    <h1>Kudium picture in picture</h1><video id="one" muted></video><video id="two" muted></video>
    <video id="blocked" muted disablepictureinpicture style="width:640px;height:360px"></video>
    <script>window.ready=Promise.all(['one','two','blocked'].map(async (id,i)=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
      const context=canvas.getContext('2d');let n=0;
      const draw=()=>{context.fillStyle=['#007f79','#30333a','#999'][i];context.fillRect(0,0,640,360);context.fillStyle='#fff';context.font='32px system-ui';context.fillText(id+' · '+n++,30,80)};
      draw();setInterval(draw,100);const video=document.getElementById(id);video.addEventListener('play',()=>{if(document.hidden)video.pause()});video.srcObject=canvas.captureStream(10);await video.play();
    }));</script>`;
}
async function server(handler) {
  const instance = http.createServer(handler);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  return instance;
}
async function open(url) {
  controller?.dispose();
  await view.webContents.loadURL(url);
  controller = new PictureInPictureController(
    view.webContents,
    () => view.getVisible(),
    () => {}
  );
  await until(() => controller.state.available);
}
(async () => {
  await app.whenReady();
  second = await server((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(mediaPage());
  });
  const embedded = `http://127.0.0.1:${second.address().port}`;
  first = await server((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      request.url === '/embedded'
        ? `<iframe src="${embedded}" allow="picture-in-picture; autoplay" style="border:0;width:100%;height:800px"></iframe>`
        : mediaPage()
    );
  });
  const origin = `http://127.0.0.1:${first.address().port}`;
  window = new BrowserWindow({ width: 1000, height: 900, show: true });
  view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1000, height: 860 });
  await open(origin);
  await view.webContents.executeJavaScript('window.ready');
  await controller.toggle();
  assert(controller.state.active, 'Address bar action opens native PiP');
  assert.equal(
    await view.webContents.executeJavaScript(
      'document.pictureInPictureElement.id'
    ),
    'one'
  );
  const dimensions = await view.webContents.executeJavaScript(
    '({width:document.pictureInPictureElement.videoWidth,height:document.pictureInPictureElement.videoHeight})'
  );
  assert(dimensions.width > 0 && dimensions.height > 0);
  assert.equal(view.webContents.getBackgroundThrottling(), false);
  view.setVisible(false);
  await wait(1100);
  assert(controller.state.active, 'PiP survives switching away from its tab');
  await view.webContents.executeJavaScript(
    'document.pictureInPictureElement.pause()'
  );
  await controller.refresh();
  assert(controller.state.active, 'Paused PiP remains available for closing');
  await view.webContents.executeJavaScript('document.pictureInPictureElement.play()', true);
  await wait(300);
  assert.equal(await view.webContents.executeJavaScript('document.pictureInPictureElement.paused'), false,
    'A visibility-sensitive player can resume PiP while its source tab is hidden');
  assert.equal(await view.webContents.executeJavaScript('document.hidden'), false);
  await controller.toggle();
  assert.equal(view.webContents.getBackgroundThrottling(), true, 'Closing PiP restores background throttling');
  assert(!controller.state.active);
  view.setVisible(true);
  window.focus();
  view.webContents.focus();
  await open(origin);
  await view.webContents.executeJavaScript('window.ready');
  await controller.visibilityChanged(false, true);
  assert(!controller.state.active, 'Muted videos do not enter automatic PiP');
  await controller.visibilityChanged(true, true);
  await view.webContents.executeJavaScript('document.querySelector("#one").muted=false', true);
  await controller.refresh();
  await controller.visibilityChanged(false, true);
  assert(controller.state.active, 'Leaving a playing video enters automatic PiP');
  await controller.visibilityChanged(true, true);
  assert(!controller.state.active, 'Returning closes automatic PiP');
  await controller.toggle();
  await controller.visibilityChanged(false, true);
  await controller.visibilityChanged(true, true);
  assert(controller.state.active, 'Automatic transitions preserve manual PiP');
  await controller.toggle();
  await Promise.all([controller.visibilityChanged(false, true), controller.visibilityChanged(true, true)]);
  assert(!controller.state.active, 'Fast return does not leave automatic PiP open');
  let params;
  view.webContents.once('context-menu', (_event, value) => {
    params = value;
  });
  const point = await view.webContents.executeJavaScript(
    '(()=>{const b=document.querySelector("#two").getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()'
  );
  view.webContents.sendInputEvent({
    type: 'mouseDown',
    button: 'right',
    clickCount: 1,
    ...point,
  });
  view.webContents.sendInputEvent({
    type: 'mouseUp',
    button: 'right',
    clickCount: 1,
    ...point,
  });
  await until(() => Boolean(params));
  assert.equal(params.mediaType, 'video');
  assert(params.mediaFlags.canShowPictureInPicture);
  await controller.toggle(params);
  assert(controller.state.active, 'Native right-click opens exact video');
  assert.equal(
    await view.webContents.executeJavaScript(
      'document.pictureInPictureElement.id'
    ),
    'two'
  );
  const oldMenu = controller.contextAction(params);
  await open(`${origin}/embedded`);
  oldMenu();
  await wait(50);
  assert(!controller.state.active, 'Old context menu cannot target a new page');
  await controller.toggle();
  assert(controller.state.active, 'Cross-origin embedded player opens PiP');
  const child = view.webContents.mainFrame.framesInSubtree.find((frame) =>
    frame.url.startsWith(embedded)
  );
  assert(child);
  assert.equal(
    await child.executeJavaScript('document.pictureInPictureElement.id'),
    'one'
  );
  await controller.toggle();
  assert(!controller.state.active);
  await child.executeJavaScript(
    'document.querySelectorAll("video").forEach(video=>video.disablePictureInPicture=true)'
  );
  await controller.refresh();
  assert(!controller.state.available, 'Website restrictions hide PiP action');
  await child.executeJavaScript('window.dynamicHost=document.createElement("div");window.dynamicHost.attachShadow({mode:"open"});document.body.append(window.dynamicHost);undefined');
  await wait(200);
  await child.executeJavaScript('(async()=>{const video=document.createElement("video");video.id="dynamic";video.muted=true;video.style="width:640px;height:360px";video.srcObject=document.querySelector("video").srcObject;window.dynamicHost.shadowRoot.append(video);await video.play()})()');
  await until(() => controller.state.available);
  await child.executeJavaScript('window.dynamicHost.remove();undefined');
  await until(() => !controller.state.available);
  console.log(
    'PASS: dynamic shadow video insertion/removal through observer events; native PiP entry/exit, automatic transitions, muted exclusion, manual preservation, rapid return, exact right-click target, hidden/paused source tab, cross-origin iframe, restricted video, stale menu; production-minified controller.'
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    controller?.dispose();
    if (window && !window.isDestroyed()) window.destroy();
    await Promise.all(
      [first, second]
        .filter(Boolean)
        .map((instance) => new Promise((resolve) => instance.close(resolve)))
    );
    fs.rmSync(root, { recursive: true, force: true });
    app.exit(process.exitCode || 0);
  });
