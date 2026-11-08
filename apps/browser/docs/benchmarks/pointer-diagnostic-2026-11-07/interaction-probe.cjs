// Disposable native routing regression; no personal profile or provider key.
const { app, BrowserWindow, WebContentsView } = require('electron');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-activity-'));
app.setPath('userData', root);
require('esbuild').buildSync({
  entryPoints: ['src/main/aiActivityLayer.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'layer.cjs'),
});
require('esbuild').buildSync({
  entryPoints: ['src/main/aiProtocol.ts'],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: path.join(root, 'protocol.cjs'),
});
const pause = () => new Promise((resolve) => setTimeout(resolve, 120));
(async () => {
  await app.whenReady();
  const host = new BrowserWindow({
    show: true,
    title: 'KudiumBrowser activity regression',
    width: 700,
    height: 500,
  });
  host.show();app.focus({steal:true});host.focus();
  const page = new WebContentsView();
  host.contentView.addChildView(page);
  let bounds = { x: 0, y: 0, width: 500, height: 300 };
  page.setBounds(bounds);
  await page.webContents.loadURL(
    'data:text/html,<body><button style="width:100px;height:80px" onclick="window.clicks++">Test</button><script>window.clicks=0</script></body>'
  );
  let takeovers = 0;
  const { AIActivityLayer } = require(path.join(root, 'layer.cjs'));
  const layer = new AIActivityLayer(
    host,
    (id) => (id === 'page' ? bounds : undefined),
    () => takeovers++
  );
  await pause();
  layer.set('page');
  await pause();
  const shield = host.contentView.children.at(-1);
  assert.notEqual(shield, page);
  assert(shield.getVisible());
  page.webContents.debugger.attach('1.3');
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type,
      x: 30,
      y: 30,
      button: 'left',
      clickCount: 1,
    });
  await pause();
  assert.equal(await page.webContents.executeJavaScript('window.clicks'), 1);
  assert.equal(takeovers, 0, 'AI input must bypass shield');
  for (const type of ['mouseDown', 'mouseUp'])
    shield.webContents.sendInputEvent({
      type,
      x: 30,
      y: 30,
      button: 'left',
      clickCount: 1,
    });
  await pause();
  assert.equal(
    takeovers,
    0,
    'Incidental mouse input must not request takeover'
  );
  assert.equal(
    await page.webContents.executeJavaScript('window.clicks'),
    1,
    'Human takeover click must not affect page'
  );
  shield.webContents.sendInputEvent({
    type: 'mouseWheel',
    x: 30,
    y: 30,
    deltaX: 0,
    deltaY: 40,
  });
  await pause();
  assert.equal(takeovers, 0, 'Wheel input must not request takeover');
  shield.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  shield.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await pause();
  assert.equal(takeovers, 0, 'Escape must not request takeover');
  // Production protocol observer drives the isolated cursor, including actual CDP input.
  const { observeAIPointer, withAIProtocol } = require(path.join(
    root,
    'protocol.cjs'
  ));
  page.webContents.debugger.detach();
  const detachPointer = observeAIPointer(page.webContents, (point) =>
    layer.pointer('page', point)
  );
  await withAIProtocol(
    page.webContents,
    new AbortController().signal,
    async (send) => {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: 160,
        y: 110,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: 160,
        y: 110,
        button: 'left',
        clickCount: 1,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: 160,
        y: 110,
        button: 'left',
        clickCount: 1,
      });
    }
  );
  await pause();
  const cursorState = () =>
    shield.webContents.executeJavaScript(
      `(()=>{const el=document.getElementById('agent-pointer');return {visible:el.classList.contains('visible'),click:el.classList.contains('click'),transform:el.style.transform}})()`
    );
  assert.deepEqual(await cursorState(), {
    visible: true,
    click: true,
    transform: 'translate(160px, 110px)',
  });
  layer.pointer('other-group', { x: 10, y: 20, type: 'mouseMoved' });
  await pause();
  assert.equal(
    (await cursorState()).transform,
    'translate(160px, 110px)',
    'Other tabs cannot move visible cursor'
  );
  const rect = (selector) =>
    shield.webContents.executeJavaScript(
      `(()=>{const r=document.querySelector(${JSON.stringify(
        selector
      )}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`
    );
  const start = await rect('.dock'),
    grip = await rect('.drag-handle');
  const origin = {
    x: Math.round(grip.x + grip.width / 2),
    y: Math.round(grip.y + grip.height / 2),
  };
  shield.webContents.sendInputEvent({
    type: 'mouseDown',
    ...origin,
    button: 'left',
    clickCount: 1,
  });
  shield.webContents.sendInputEvent({
    type: 'mouseMove',
    x: origin.x + 65,
    y: origin.y - 80,
    button: 'left',
  });
  shield.webContents.sendInputEvent({
    type: 'mouseUp',
    x: origin.x + 65,
    y: origin.y - 80,
    button: 'left',
    clickCount: 1,
  });
  await pause();
  const moved = await rect('.dock');
  assert(moved.y < start.y - 60, 'Native drag must move popup');
  assert.equal(takeovers, 0, 'Dragging must not stop AI');
  assert.equal(await page.webContents.executeJavaScript('window.clicks'), 1);
  shield.webContents.focus();
  shield.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Up' });
  shield.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Up' });
  await pause();
  assert((await rect('.dock')).y < moved.y, 'Keyboard moves focused handle');
  const evidence = path.resolve('docs/evidence/ai-pointer');
  fs.mkdirSync(evidence, { recursive: true });
  const shot = async (name) => { console.log('SKIP capture (isolated interaction probe): '+name); };

  for (const theme of ['light', 'dark']) {
    for (const width of [700, 400, 320, 240]) {
      host.setSize(width, 420);
      bounds = { x: 0, y: 0, width, height: 390 };
      page.setBounds(bounds);
      await page.webContents.executeJavaScript(
        `document.body.style.background=${JSON.stringify(
          theme === 'dark' ? '#1b1c20' : '#f8f8fa'
        )};document.body.style.color=${JSON.stringify(
          theme === 'dark' ? 'white' : '#222'
        )}`
      );
      await pause();
      layer.pointer('page', { x: width - 80, y: 90, type: 'mouseMoved' });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const r = await rect('.dock'); console.log(JSON.stringify({width,r,view:shield.getBounds(),viewport:await shield.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})')}));
      const copy = await rect('.title'),
        action = await rect('#take-control');
      assert(
        copy.x + copy.width + 5 <= action.x,
        'Title and action retain clearance at each width'
      );
      assert(
        r.x >= 11 &&
          r.y >= 11 &&
          r.x + r.width <= width - 11 &&
          r.y + r.height <= 390 - 11,
        'Popup remains in resized tab'
      );
      assert.equal(
        await shield.webContents.executeJavaScript(
          'document.documentElement.scrollWidth>innerWidth'
        ),
        false
      );
      await shot(theme + '-' + width);
    }
  }
  shield.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Home' });
  shield.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home' });
  await pause();
  const centered = await rect('.dock');
  const title = await rect('.title'),
    control = await rect('#take-control');
  assert(
    title.x + title.width + 5 <= control.x,
    'Centered popup must preserve title/action spacing'
  );
  assert(
    Math.abs(centered.x + centered.width / 2 - bounds.width / 2) < 1,
    'Home resets popup to center'
  );
  shield.webContents.debugger.attach('1.3');
  await shield.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(
    await shield.webContents.executeJavaScript(
      "getComputedStyle(document.getElementById('agent-pointer')).transitionDuration"
    ),
    '0s'
  );
  layer.pointer('page', { x: 70, y: 90, type: 'mouseMoved' });
  await pause();
  await shot('reduced-motion-focus');
  shield.webContents.debugger.detach();
  // Click feedback, cursor fading, focus and reset.
  layer.pointer('page', { x: 90, y: 90, type: 'mouseReleased' });
  await pause();
  await shot('click');
  await new Promise((resolve) => setTimeout(resolve, 2500));
  assert.equal((await cursorState()).visible, false, 'Idle cursor fades');
  layer.set();
  layer.set('page');
  await pause();
  assert.equal(
    (await cursorState()).visible,
    false,
    'Resuming clears stale cursor'
  );
  detachPointer();
  const button = await shield.webContents.executeJavaScript(
    `(()=>{const r=document.getElementById('take-control').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`
  );
  for (const type of ['mouseDown', 'mouseUp'])
    shield.webContents.sendInputEvent({
      type,
      ...button,
      button: 'left',
      clickCount: 1,
    });
  await pause();
  assert.equal(takeovers, 1, 'Only Take control must request takeover');
  assert.equal(await page.webContents.executeJavaScript('window.clicks'), 1);
  layer.set();
  layer.set('page');
  await pause();
  assert.equal(
    await shield.webContents.executeJavaScript(
      "document.getElementById('take-control').disabled"
    ),
    false,
    'Resume must re-enable Take control'
  );
  if (process.argv.includes('--screenshot')) {
    const destination = path.resolve('docs/evidence/ai-working-mode.png');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(
      destination,
      (await host.webContents.capturePage()).toPNG()
    );
  }
  if (process.argv.includes('--os-mouse')) {
    host.show();
    host.focus();
    app.focus({ steal: true });
    await pause();
    const screenBounds = host.getContentBounds();
    const swiftPath = path.join(root, 'mouse.swift');
    fs.writeFileSync(
      swiftPath,
      `import CoreGraphics
import Foundation
if !CGPreflightPostEventAccess() { exit(2) }
let point = CGPoint(x: ${screenBounds.x + 30}, y: ${screenBounds.y + 30})
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
Thread.sleep(forTimeInterval: 0.05)
CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
`
    );
    await new Promise((resolve, reject) =>
      require('child_process').execFile(
        '/usr/bin/swift',
        [swiftPath],
        (error) => (error ? reject(error) : resolve())
      )
    );
    await pause();
    assert.equal(takeovers, 1, 'Incidental OS mouse must not request takeover');
    assert.equal(await page.webContents.executeJavaScript('window.clicks'), 1);
    console.log('PASS: macOS event-system mouse interception.');
  }
  bounds = { x: 20, y: 25, width: 450, height: 250 };
  await pause();
  assert.deepEqual(shield.getBounds(), bounds);
  layer.set();
  assert(!shield.getVisible());
  layer.set('missing');
  assert(!shield.getVisible());
  if (process.argv.includes('--preview')) {
    host.setSize(1000, 700);
    bounds = { x: 0, y: 0, width: 1000, height: 672 };
    page.setBounds(bounds);
    await page.webContents.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          `<style>body{margin:0;background:#17181c;color:#eee;font:16px system-ui;padding:56px}h1{font-size:32px}p{color:#9a9da9}.cards{display:flex;gap:16px;margin-top:32px}.card{width:220px;height:140px;border:1px solid #ffffff15;border-radius:14px;background:#22242b;padding:20px}small{color:#979cab}</style><h1>Your workspace</h1><p>A clear view of your work, while your assistant handles the details.</p><div class="cards"><div class="card">Recent activity<br><br><small>Everything is up to date</small></div><div class="card">Projects<br><br><small>Keep your work organized</small></div><div class="card">Quick links<br><br><small>Your everyday destinations</small></div></div>`
        )
    );
    layer.set('page');
    host.show();
    host.focus();
    await pause();
    fs.mkdirSync(path.resolve('docs/evidence'), { recursive: true });
    fs.writeFileSync(
      path.resolve('docs/evidence/ai-working-mode.png'),
      (await shield.webContents.capturePage()).toPNG()
    );
  }
  layer.dispose();
  assert(!host.contentView.children.includes(shield));
  host.destroy();
  fs.rmSync(root, { recursive: true, force: true });
  console.log(
    'PASS: AI click bypass, incidental input protection, explicit Take control, bounds, visibility and disposal. Physical OS mouse routing remains a manual check.'
  );
  app.exit(0);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
