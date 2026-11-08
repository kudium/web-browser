/* Native protocol interruption probe: disposable profile and synthetic keys. */
const { app, BrowserWindow, WebContentsView } = require('electron');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  assert = require('assert/strict'),
  crypto = require('crypto');
const root = path.resolve(__dirname, '../..'),
  phase = process.argv[2] || 'after';
assert(['before', 'after'].includes(phase));
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'touchbox-key-release-')
);
app.setPath('userData', temporary);
const source = fs.readFileSync(
  path.join(
    root,
    phase === 'before'
      ? 'docs/benchmarks/baselines/key-release/aiProtocol.ts.txt'
      : 'src/main/aiProtocol.ts'
  )
);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
let host;
const deadline = setTimeout(() => {
  console.error('Key release probe timed out');
  app.exit(1);
}, 30000);
app
  .whenReady()
  .then(async () => {
    const bundle = path.join(temporary, 'protocol.cjs');
    require('esbuild').buildSync({
      stdin: {
        contents: source.toString(),
        loader: 'ts',
        resolveDir: path.join(root, 'src/main'),
      },
      bundle: true,
      platform: 'node',
      external: ['electron'],
      outfile: bundle,
    });
    const { withAIProtocol, settleAIProtocol } = require(bundle);
    host = new BrowserWindow({ show: false, width: 600, height: 400 });
    const page = new WebContentsView();
    host.contentView.addChildView(page);
    page.setBounds({ x: 0, y: 0, width: 600, height: 400 });
    await page.webContents.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          '<input id="target"><script>window.events=[];for(const type of ["keydown","keyup"])document.addEventListener(type,e=>events.push({type:e.type,key:e.key,trusted:e.isTrusted}));</script>'
        )
    );
    const nativeSend = page.webContents.debugger.sendCommand.bind(
        page.webContents.debugger
      ),
      commands = [];
    page.webContents.debugger.sendCommand = async (
      method,
      parameters,
      session
    ) => {
      commands.push({ method, parameters, session });
      return nativeSend(method, parameters, session);
    };
    const results = [];
    for (const outcome of ['stop', 'failure', 'normal']) {
      commands.length = 0;
      await page.webContents.executeJavaScript(
        'events=[];document.querySelector("input").focus();undefined'
      );
      await page.webContents.executeJavaScript('document.activeElement.id');
      const cancellation = new AbortController();
      let error;
      try {
        await withAIProtocol(
          page.webContents,
          cancellation.signal,
          async (send) => {
            await send('Input.dispatchKeyEvent', {
              type: 'rawKeyDown',
              key: 'a',
              code: 'KeyA',
              windowsVirtualKeyCode: 65,
              modifiers: 2,
            });
            if (outcome === 'stop') {
              cancellation.abort();
              return new Promise(() => {});
            }
            if (outcome === 'failure')
              throw new Error('Synthetic action failure');
            await send('Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: 'a',
              code: 'KeyA',
              windowsVirtualKeyCode: 65,
              modifiers: 0,
            });
          }
        );
      } catch (value) {
        error = value.message;
      }
      await settleAIProtocol(page.webContents);
      const events = await page.webContents.executeJavaScript('events');
      const keyUps = commands.filter(
        (c) =>
          c.method === 'Input.dispatchKeyEvent' && c.parameters.type === 'keyUp'
      );
      assert.equal(
        events.filter((e) => e.type === 'keydown').length,
        1,
        'Native keydown must arrive'
      );
      const expected = phase === 'after' || outcome === 'normal' ? 1 : 0;
      assert.equal(keyUps.length, expected);
      assert.equal(events.filter((e) => e.type === 'keyup').length, expected);
      assert(events.every((e) => e.trusted));
      assert.equal(page.webContents.debugger.isAttached(), false);
      if (outcome === 'normal') {
        assert.equal(error, undefined);
        assert.equal(commands.length, 2);
      } else assert(error);
      results.push({ outcome, error, commands: [...commands], events });
    }
    const output = path.join(root, 'docs/benchmarks/key-release.json');
    const report = fs.existsSync(output)
      ? JSON.parse(fs.readFileSync(output))
      : {};
    report[phase] = {
      sourceSha256: hash(source),
      probeSha256: hash(fs.readFileSync(__filename)),
      results,
      scope:
        'Actual withAIProtocol and hidden native WebContentsView, trusted Chromium key events. Synthetic interruption after acknowledged keydown. No physical input, compositor/resize, full sidebar handoff or all-frame native coverage.',
    };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(
      'PASS ' +
        phase +
        ': Stop/failure/native key-up and unchanged normal dispatch.'
    );
    clearTimeout(deadline);
    host.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
