/* Actual DOM programs and policy, synthetic event handlers, no account/network. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const ts = require('typescript');
const esbuild = require('esbuild');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');
async function run() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-ai-policy-'));
  const ref = 'de2eae3bdf2f346d66dc91a6ef5aeda9581c0603';
  const main = fs.readFileSync('src/main/ai.ts', 'utf8');
  const ast = ts.createSourceFile('ai.ts', main, ts.ScriptTarget.Latest, true);
  const programs = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['readAIPage', 'actAIPage'].includes(node.name?.text)).map(node => node.getText(ast).replace(/^export\s+/, '')).join('\n');
  if (!programs.includes('function readAIPage') || !programs.includes('function actAIPage')) throw new Error('DOM program discovery failed');
  const code = ts.transpileModule(programs, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const policies = {
    before: execFileSync('git', ['show', `${ref}:src/browser/aiPermissions.ts`], { encoding: 'utf8' }),
    after: fs.readFileSync('src/browser/aiPermissions.ts', 'utf8'),
  };
  const result = { measuredAt: new Date().toISOString(), runtime: process.version, baselineRef: ref, domProgramSHA256: crypto.createHash('sha256').update(programs).digest('hex'), method: 'Actual readAIPage/actAIPage functions extracted by TypeScript AST and run in JSDOM; original/current requiresAIApproval decide whether synthetic controls execute without a review. No network or user account.', phases: {} };
  try {
    for (const [phase, policy] of Object.entries(policies)) {
      const entry = path.join(temporary, `${phase}.cjs`);
      await esbuild.build({ stdin: { contents: policy, loader: 'ts', resolveDir: path.resolve('src/browser') }, bundle: true, platform: 'node', outfile: entry });
      const { requiresAIApproval } = require(entry);
      const observations = [];
      for (const label of ['Continue', 'Continuar']) {
        const dom = new JSDOM(`<button>${label}</button>`, { url: 'https://fixture.example', runScripts: 'outside-only' });
        try {
          dom.window.Element.prototype.getClientRects = () => [{ width: 20 }];
          dom.window.crypto.randomUUID = crypto.randomUUID;
          dom.window.eval(`${code};window.probe={readAIPage,actAIPage};`);
          let effects = 0;
          dom.window.document.querySelector('button').onclick = () => { effects += 1; };
          const page = dom.window.probe.readAIPage();
          const observed = dom.window.probe.actAIPage('inspect', 0, '', page.snapshotId);
          const reviewed = requiresAIApproval('standard', 'click', observed.safeInteraction);
          if (!reviewed) dom.window.probe.actAIPage('click', 0, '', page.snapshotId);
          observations.push({ action: 'click', label, sensitiveActionHint: observed.sensitiveAction, routineHint: observed.safeInteraction, requiresReview: reviewed, sideEffectsWithoutReview: effects });
        } finally { dom.window.close(); }
      }
      const dom = new JSDOM('<select aria-label="Account action"><option value="keep">Keep account</option><option value="erase">Erase account</option></select>', { url: 'https://fixture.example', runScripts: 'outside-only' });
      try {
        dom.window.Element.prototype.getClientRects = () => [{ width: 20 }];
        dom.window.crypto.randomUUID = crypto.randomUUID;
        dom.window.eval(`${code};window.probe={readAIPage,actAIPage};`);
        let effects = 0;
        dom.window.document.querySelector('select').onchange = () => { effects += 1; };
        const page = dom.window.probe.readAIPage();
        const reviewed = requiresAIApproval('standard', 'select_options', false);
        if (!reviewed) dom.window.probe.actAIPage('select_options', 0, '["erase"]', page.snapshotId);
        observations.push({ action: 'select_options', label: 'Account action', requiresReview: reviewed, sideEffectsWithoutReview: effects });
      } finally { dom.window.close(); }
      observations.push({ action: 'press_key', label: 'Delete keyboard shortcut', requiresReview: requiresAIApproval('standard', 'press_key', true) });
      result.phases[phase] = { sourceSHA256: crypto.createHash('sha256').update(policy).digest('hex'), observations, controlsWithoutReview: observations.filter(item => !item.requiresReview).length };
    }
    result.limitations = ['DOM and policy probes do not exercise the entire MCP/inference dispatch path or prove that every sensitive workflow is safe.', 'Full access remains an explicit broader grant; private-data release and prompt-injection end-to-end checks remain separate requirements.'];
    const reportPath='docs/benchmarks/ai-action-policy.json';
    if(fs.existsSync(reportPath)) {
      const original=JSON.parse(fs.readFileSync(reportPath,'utf8'));
      original.confirmations=[...(original.confirmations||[]),result];
      fs.writeFileSync(reportPath, `${JSON.stringify(original,null,2)}\n`);
    } else fs.writeFileSync(reportPath, `${JSON.stringify(result,null,2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
