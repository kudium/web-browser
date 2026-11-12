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
  position = source.length
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
    worker.postMessage({ id, request: { action, source, position } });
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
