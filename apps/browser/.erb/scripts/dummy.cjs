const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

console.log('Opening the dedicated Kudium demo profile with curated real websites.');
console.log('Each run resets demo tabs and collections; your regular profile is untouched.');
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
  cwd: path.resolve(__dirname, '../..'),
  env: { ...process.env, KUDIUM_DUMMY: randomUUID(), PORT: process.env.PORT || '1213' },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code || 0; });
