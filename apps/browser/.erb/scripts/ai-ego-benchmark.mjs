// Execute using: ego-browser nodejs < .erb/scripts/ai-ego-benchmark.mjs
// Requires the paired Electron harness, which writes this private control file.
const fs = await import('node:fs/promises');
const { origin, secret } = JSON.parse(
  await fs.readFile('/tmp/touchbox-comparison-control.json', 'utf8')
);
const task = await taskSpace('TouchBox AI control benchmark');
const page = task.page('p1');
await page.goto(`${origin}/fixture`);
const request = async (path, input) => {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
};
const measure = async (kind, round) => {
  const start = performance.now();
  let snapshot = await page.snapshot({ scope: 'full_page' });
  if (kind === 'workflow') {
    await page.fill('loc=css:#name', `Sample ${round}`);
    await page.click('loc=css:#apply', { label: 'Apply benchmark form' });
    snapshot = await page.snapshot({ scope: 'full_page' });
    if (!String(snapshot).includes(`Done Sample ${round}`))
      throw new Error('Ego workflow did not complete');
  }
  const text =
    typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
  if (
    !text.includes('Action 100') ||
    (text.match(/^\s*button \[ref=/gm) || []).length !== 101 ||
    (text.match(/^\s*textbox \[ref=/gm) || []).length !== 1
  )
    throw new Error('Ego snapshot omitted fixture controls');
  return {
    ms: performance.now() - start,
    bytes: Buffer.byteLength(text),
    verified: true,
    controls: 102,
    apiCalls: kind === 'workflow' ? 4 : 1,
  };
};
const coldTouchbox = await request('/measure', { kind: 'snapshot' });
const coldEgo = await measure('snapshot', -1);
console.log({ spaceId: task.spaceId, coldTouchbox, coldEgo });
const ego = { snapshot: [], workflow: [] };
for (let round = -2; round < 20; round += 1) {
  for (const kind of ['snapshot', 'workflow']) {
    let observed;
    if (round % 2 === 0) {
      await request('/measure', { kind, round });
      observed = await measure(kind, round);
    } else {
      observed = await measure(kind, round);
      await request('/measure', { kind, round });
    }
    if (round >= 0) ego[kind].push(observed);
  }
  if (round >= 0 && round % 5 === 0) console.log({ round });
}
console.log(await request('/finish', { coldTouchbox, coldEgo, ego }));
console.log(await page.snapshot({ scope: 'full_page' }));
// The broader parity task remains active; reuse this TaskSpace for later fixtures.
