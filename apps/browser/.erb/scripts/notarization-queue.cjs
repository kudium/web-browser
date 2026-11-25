const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

async function command(file, args, timeout = 60000) {
  try { return await execute(file, args, { timeout, maxBuffer: 1024 * 1024 }); }
  catch (error) {
    const reason = error.killed ? 'timed out' : `exited with code ${error.code ?? 'unknown'}`;
    throw new Error(`${path.basename(file)} ${reason}`);
  }
}
function authorization(options) {
  if (options.appleApiKey) return ['--key', options.appleApiKey, '--key-id', options.appleApiKeyId, '--issuer', options.appleApiIssuer];
  return ['--apple-id', options.appleId, '--password', options.appleIdPassword, '--team-id', options.teamId];
}
async function fingerprint(appPath, run) {
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
  const { stderr } = await run('/usr/bin/codesign', ['-dv', '--verbose=4', appPath]);
  const hash = stderr.match(/^CDHash=([a-f0-9]+)$/mi)?.[1];
  if (!hash || !stderr.includes('Authority=Developer ID Application: Kudium LTD (79VCL28M9P)') ||
      !stderr.includes('TeamIdentifier=79VCL28M9P') || !stderr.includes('runtime'))
    throw new Error('Notarization requires the verified Kudium Developer ID and hardened runtime');
  return hash;
}
async function checksum(file) { return createHash('sha256').update(await fs.readFile(file)).digest('hex'); }
function paths(appPath) {
  const directory = path.dirname(appPath);
  return { archive: path.join(directory, 'notarization-upload.zip'), record: path.join(directory, 'notarization.json') };
}
async function validatedRecord(appPath, run) {
  const files = paths(appPath);
  const value = JSON.parse(await fs.readFile(files.record, 'utf8'));
  if (value.version !== 1 || !uuid.test(value.id || '') || value.appName !== path.basename(appPath) ||
      value.cdHash !== await fingerprint(appPath, run) || value.sha256 !== await checksum(files.archive))
    throw new Error('Notarization record does not match the signed application and uploaded archive');
  return value;
}
async function submit(options, { run = command, log = console.log } = {}) {
  const files = paths(options.appPath);
  let exists = false;
  try { await fs.access(files.record); exists = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists) return validatedRecord(options.appPath, run);
  const cdHash = await fingerprint(options.appPath, run);
  await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', options.appPath, files.archive], 300000);
  const sha256 = await checksum(files.archive);
  const result = await run('/usr/bin/xcrun', ['notarytool', 'submit', files.archive, ...authorization(options), '--no-s3-acceleration', '--output-format', 'json'], 1800000);
  let response;
  try { response = JSON.parse(result.stdout); } catch { throw new Error('Apple submission did not return a submission ID'); }
  if (!uuid.test(response.id || '')) throw new Error('Apple submission returned an invalid submission ID');
  const record = { version: 1, id: response.id, appName: path.basename(options.appPath), cdHash, sha256 };
  await fs.writeFile(`${files.record}.tmp`, JSON.stringify(record, null, 2), { mode: 0o600 });
  await fs.rename(`${files.record}.tmp`, files.record);
  log(`Submitted ${record.appName} to Apple: ${record.id}`);
  return record;
}
async function finalize(options, { run = command, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log } = {}) {
  const record = await validatedRecord(options.appPath, run);
  for (;;) {
    let status;
    try {
      const result = await run('/usr/bin/xcrun', ['notarytool', 'info', record.id, ...authorization(options), '--output-format', 'json']);
      const value = JSON.parse(result.stdout);
      if (value.id !== record.id) throw new Error('Unexpected submission');
      status = value.status;
    } catch { log(`Apple status check unavailable; retrying submission ${record.id}`); }
    if (status === 'Accepted') break;
    if (status === 'Invalid' || status === 'Rejected') throw new Error(`Apple rejected submission ${record.id}; inspect its notarization log`);
    log(`Waiting for Apple submission ${record.id}: ${status || 'status unavailable'}`);
    await sleep(30000);
  }
  // Recheck after waiting: no changed application can inherit another build's ticket.
  await validatedRecord(options.appPath, run);
  await run('/usr/bin/xcrun', ['stapler', 'staple', options.appPath], 300000);
  await run('/usr/bin/xcrun', ['stapler', 'validate', options.appPath]);
  await fingerprint(options.appPath, run);
  log(`Accepted and stapled ${record.appName}: ${record.id}`);
}
module.exports = { submit, finalize };
