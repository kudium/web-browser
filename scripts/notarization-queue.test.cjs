const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { submit, finalize } = require('../apps/browser/.erb/scripts/notarization-queue.cjs');
const id = '12345678-1234-1234-1234-123456789abc';
async function fixture(runTest) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'notarization-test-'));
  const appPath = path.join(dir, 'Kudium Browser.app');
  let hash = 'abcdef1234567890';
  const calls = [];
  let statuses = ['Accepted'];
  const run = async (command, args) => {
    calls.push([command,args]);
    if (command.endsWith('codesign')) return {stdout:'',stderr:`Authority=Developer ID Application: Kudium LTD (79VCL28M9P)\nTeamIdentifier=79VCL28M9P\nflags=runtime\nCDHash=${hash}\n`};
    if (command.endsWith('ditto')) await fs.writeFile(args.at(-1),'archive fixture');
    if (args.includes('submit')) return {stdout:JSON.stringify({id}),stderr:''};
    if (args.includes('info')) {
      const status=statuses.shift();if(status instanceof Error)throw status;
      return {stdout:JSON.stringify({id,status:status||'Accepted'}),stderr:''};
    }
    return {stdout:'',stderr:''};
  };
  const options = {appPath,appleApiKey:'/private/test-key',appleApiKeyId:'TESTKEY',appleApiIssuer:'test-issuer'};
  try { await runTest({dir,options,run,calls,changeHash:()=>{hash='bbbbbbbbbbbbbbbb';},setStatuses:s=>{statuses=s;}}); }
  finally { await fs.rm(dir,{recursive:true,force:true}); }
}
test('submits without a long wait, retains ID, and avoids duplicate upload on retry', () => fixture(async f => {
  await submit(f.options,{run:f.run,log:()=>{}});
  await submit(f.options,{run:f.run,log:()=>{}});
  const calls=f.calls.filter(([,args])=>args.includes('submit'));
  assert.equal(calls.length,1);assert(!calls[0][1].includes('--wait'));
  assert(calls[0][1].includes('--no-s3-acceleration'), 'Use direct S3 uploads to avoid acceleration endpoint stalls');
  const record=JSON.parse(await fs.readFile(path.join(f.dir,'notarization.json')));
  assert.equal(record.id,id);assert(!JSON.stringify(record).includes('test-key'));
}));
test('retries a failed status check, waits for acceptance, then staples and validates', () => fixture(async f => {
  await submit(f.options,{run:f.run,log:()=>{}});
  f.setStatuses([Error('Network unavailable'),'In Progress','Accepted']);
  let waits=0;await finalize(f.options,{run:f.run,sleep:async()=>{waits++;},log:()=>{}});
  assert.equal(waits,2);
  assert.equal(f.calls.filter(([,a])=>a.includes('submit')).length,1);
  assert(f.calls.some(([,a])=>a.includes('staple')));
  assert(f.calls.some(([,a])=>a.includes('validate')));
}));
test('rejects a changed signed bundle and tampered upload archive before resubmission or stapling', () => fixture(async f => {
  await submit(f.options,{run:f.run,log:()=>{}});f.changeHash();
  await assert.rejects(submit(f.options,{run:f.run}),/does not match/);
  await assert.rejects(finalize(f.options,{run:f.run}),/does not match/);
  assert(!f.calls.some(([,a])=>a.includes('staple')));
}));
test('rejects corrupted or missing retained archives without silently uploading again', () => fixture(async f => {
  await submit(f.options,{run:f.run,log:()=>{}});
  await fs.writeFile(path.join(f.dir,'notarization-upload.zip'),'changed');
  await assert.rejects(finalize(f.options,{run:f.run}),/does not match/);
  await fs.rm(path.join(f.dir,'notarization-upload.zip'));
  await assert.rejects(submit(f.options,{run:f.run}),/ENOENT/);
  assert.equal(f.calls.filter(([,a])=>a.includes('submit')).length,1);
}));
test('fails closed on Apple rejection without creating a ticket', () => fixture(async f => {
  await submit(f.options,{run:f.run,log:()=>{}});f.setStatuses(['Invalid']);
  await assert.rejects(finalize(f.options,{run:f.run,log:()=>{}}),/rejected submission/);
  assert(!f.calls.some(([,a])=>a.includes('staple')));
}));
