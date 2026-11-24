import { hookExamples } from '../browser/hookExamples';
import { hookPanelExamples } from '../browser/hookPanelExamples';
/** @jest-environment node */
import path from 'path';
import { execFileSync } from 'child_process';
import { Worker } from 'worker_threads';
import type { HookLanguageResult } from '../browser/hookLanguage';

let worker: Worker;
let sequence = 0;
beforeAll(() => {
  execFileSync(process.execPath, [
    path.resolve(__dirname, '../../.erb/scripts/build-hook-language.cjs'),
  ]);
  const dir = path.resolve(__dirname, '../../assets/hook-language');
  worker = new Worker(path.join(dir, 'worker.cjs'), {
    workerData: { libDir: dir },
  });
});
afterAll(async () => {
  await worker.terminate();
});
function query(
  action: string,
  source: string,
  position = source.length,
  mode?: string
): Promise<HookLanguageResult> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const listener = (message: {
      id: number;
      result: HookLanguageResult;
      error?: string;
    }) => {
      if (message.id !== id) return;
      worker.removeListener('message', listener);
      if (message.error) reject(new Error(message.error));
      else resolve(message.result);
    };
    worker.on('message', listener);
    worker.postMessage({ id, request: { action, source, position, mode } });
  });
}

test('understands inferred JavaScript variables and browser DOM types', async () => {
  const array = await query('completions', 'const values = [1, 2]; values.');
  expect(array.completions?.map((item) => item.label)).toContain('map');
  const dom = await query(
    'completions',
    'const input = document.querySelector("input"); if (input) input.'
  );
  expect(dom.completions?.map((item) => item.label)).toContain('value');
}, 15000);

test('validates the real Activity API and detects an unawaited result', async () => {
  const valid = await query(
    'diagnostics',
    'const saved = await context.activity.create({title: "Ready", url: context.url}); log(saved.id);'
  );
  expect(valid.diagnostics).toEqual([]);
  const wrong = await query(
    'diagnostics',
    'await context.activity.create({ body: "wrong" });'
  );
  expect(wrong.diagnostics?.some((item) => /body/.test(item.message))).toBe(
    true
  );
  const promise = await query(
    'diagnostics',
    'const saved = context.activity.create({title: "Ready"}); log(saved.id);'
  );
  expect(
    promise.diagnostics?.some((item) => /Promise/.test(item.message))
  ).toBe(true);
}, 15000);

test('offers method parameter types without evaluating source', async () => {
  const text = 'context.activity.create';
  const info = await query('hover', text, text.length - 2);
  expect(info.hover?.text).toContain('KudiumActivityInput');
  const safe = await query(
    'diagnostics',
    'throw new Error("This must never run");'
  );
  expect(safe.diagnostics).toEqual([]);
}, 15000);

test('types lifecycle helpers and validates cleanup callbacks', async () => {
  const completions = await query('completions', 'context.');
  expect(completions.completions?.map((item) => item.label)).toEqual(
    expect.arrayContaining([
      'onCleanup',
      'signal',
      'runId',
      'listen',
      'setInterval',
    ])
  );
  const valid = await query(
    'diagnostics',
    "onCleanup(() => document.body.classList.remove('hook')); context.listen(document, 'click', event => log(event.type)); log(signal.aborted);"
  );
  expect(valid.diagnostics).toEqual([]);
  const wrong = await query('diagnostics', 'context.onCleanup(123);');
  expect(wrong.diagnostics?.some((item) => /number/.test(item.message))).toBe(
    true
  );
}, 15000);

test('action handlers offer the action API and keep lifecycle context separate', async () => {
  const result = await query('completions', 'api.', 4, 'action');
  expect(result.completions?.map((item) => item.label)).toEqual(
    expect.arrayContaining(['field', 'passwords', 'notes', 'ai', 'showResult'])
  );
  const context = await query('completions', 'context.', 8, 'action');
  expect(context.completions?.map((item) => item.label)).toContain('selection');
  expect(context.completions?.map((item) => item.label)).not.toContain(
    'document'
  );
  const valid = await query(
    'diagnostics',
    'api.passwords.generateAndFill();',
    0,
    'action'
  );
  expect(valid.diagnostics).toEqual([]);
}, 15000);

test('action typings support awaited saved data and user input requests', async () => {
  const result = await query(
    'diagnostics',
    'const data = await api.input.request({title:"Profile",fields:[{key:"firstName",label:"First name",group:"Profile",required:true,personalData:"firstName"}]}); if (data) api.field.fill(data.firstName); const input = await api.input.request({fields:[{key:"question",type:"textarea",required:true}]}); if (input) api.ai.compose(input.question);',
    undefined,
    'action'
  );
  expect(result.diagnostics).toEqual([]);
});

test('the action editor documents and completes browser-owned form saving', async () => {
  const result = await query('diagnostics', 'api.personalData.saveForm();', undefined, 'action');
  expect(result.diagnostics).toEqual([]);
  const completions = await query('completions', 'api.personalData.', undefined, 'action');
  expect(completions.completions?.map(item => item.label)).toContain('saveForm');
});

// AI and the Action builder use this exact shared example set.
test('all shared action examples compile against the editor API reference', async () => {
  const { actionTemplates } = await import('../../../../packages/hooks/actions');
  for (const action of actionTemplates) {
    const result = await query('diagnostics', action.source, action.source.length, 'action');
    expect({ name: action.name, diagnostics: result.diagnostics }).toEqual({ name: action.name, diagnostics: [] });
  }
}, 30000);

test('types panel output and declared handlers in the actual editor worker', async () => {
  const completions=await query('completions','context.panel.');
  expect(completions.completions?.map(item=>item.label)).toEqual(expect.arrayContaining(['show','update','close','onAction']));
  const valid=await query('diagnostics',"context.panel.onAction('refresh',async payload=>({ok:true}));await context.panel.show({id:'output',title:'Output',content:{type:'table',columns:['Value'],rows:[[3]]},actions:[{id:'refresh',label:'Refresh'}]});");
  expect(valid.diagnostics).toEqual([]);
  const wrong=await query('diagnostics',"await context.panel.show({id:'output',title:'Output',content:{type:'html',html:42}});");
  expect(wrong.diagnostics?.length).toBeGreaterThan(0);
},15000);

test.each(hookPanelExamples)('the editor accepts the complete $name snippet', async sample => {
  const result=await query('diagnostics',sample.source);
  expect(result.diagnostics).toEqual([]);
},15000);

test('context.theme exposes read-only resolved color types in the hook editor', async () => {
  expect((await query('diagnostics','const primary = context.theme.primary; await context.panel.show({id:"colors",title:"Theme",content:{type:"text",text:primary}});')).diagnostics).toEqual([]);
  expect((await query('diagnostics','context.theme.primary = "#ffffff";')).diagnostics?.some(item => item.message.includes('read-only'))).toBe(true);
});

test('battery toast example passes the editor API checks',async()=>{
  const example=hookExamples.find(item=>item.id==='battery-toast')!;
  expect(example.stage).toBe('after');
  expect((await query('diagnostics',example.source)).diagnostics).toEqual([]);
},15000);
