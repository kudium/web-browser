const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-snapshot-benchmark-'));
app.setPath('userData', root);
require('esbuild').buildSync({ entryPoints: ['src/main/ai.ts'], bundle: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'ai.cjs') });
(async () => {
  await app.whenReady();
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<body></body>');
  await win.webContents.executeJavaScript("document.body.innerHTML='<button>Action</button>'.repeat(20000)");
  const current = require(path.join(root, 'ai.cjs')).readAIPage.toString();
  const start = current.indexOf('let visitedNodes = 0');
  const end = current.indexOf('collect(document);', start);
  assert(start >= 0 && end > start);
  const old = current.slice(0, start) + `let visitedNodes = 0;
    const collect = root => {
      Array.from(root.querySelectorAll('*')).forEach(node => {
        if (nodes.length >= 250) return;
        if (node.matches('a,button,input,textarea,select,[role="button"],[contenteditable="true"]') &&
          node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden') nodes.push(node);
        if (node.shadowRoot) collect(node.shadowRoot);
      });
    };
    ` + current.slice(end);
  const result = await win.webContents.executeJavaScript(`(() => {
    const baseline = (${old}); const bounded = (${current});
    const samples = { baseline: [], bounded: [] };
    let coverage;
    for (let run = 0; run < 12; run += 1) {
      const order = run % 2 ? [['bounded',bounded],['baseline',baseline]] : [['baseline',baseline],['bounded',bounded]];
      for (const [name, fn] of order) {
        const start = performance.now(); const page = fn();
        const elapsed = performance.now() - start;
        if (page.elements.length !== 250) throw new Error('Inconsistent target output');
        if (run >= 2) samples[name].push(elapsed);
        if (name === 'bounded') coverage = page.coverage;
      }
    }
    return { samples, coverage };
  })()`);
  const stats = values => {
    const sorted = [...values].sort((a,b) => a-b);
    return { p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))], runs: sorted.length };
  };
  const report = {
    fixture: '20,000 visible buttons; 250-target snapshot; same text and metadata generation',
    comparison: 'Previous all-node collection versus bounded TreeWalker; not an Ego comparison',
    baseline: stats(result.samples.baseline), bounded: stats(result.samples.bounded),
    coverage: result.coverage,
  };
  const output = process.env.KUDIUMBROWSER_BENCHMARK_OUTPUT || path.join(root, 'snapshot-benchmark.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, output }, null, 2));
  win.destroy(); app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
